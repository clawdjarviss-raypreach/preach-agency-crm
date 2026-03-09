import 'dotenv/config';

import { queueAnalysis, shouldAnalyze } from './ai-gate';
import { StableApiClient } from './scraper';
import { SocialApiClient, type SocialReel } from './social-api';
import {
  StorageService,
  type CompetitorWatchlist,
  type OwnAccount,
  type ReelForStatsUpdate,
} from './storage';
import { calculateAccountVPD, calculateReelVPD, flagReel, type ReelVPD } from './vpd';

const DAILY_REEL_AGE_DAYS = 30;
const VPD_REEL_AGE_DAYS = 14;
const STATS_UPDATE_AGE_DAYS = 30;

type ScrapeMode = 'daily' | 'vpd';
type ApiError = Error & { status?: number };

type ScrapeStats = {
  ownAccounts: number;
  competitorAccounts: number;
  ownReels: number;
  competitorReels: number;
  ownSnapshots: number;
  competitorSnapshots: number;
  winners: number;
  trending: number;
  aiQueued: number;
  socialApiCalls: number;
  stableApiCalls: number;
  errors: number;
  accountsMarkedInactive: number;
  accountsReactivated: number;
  reelsMarkedDeleted: number;
  snapshotsSkipped0Followers: number;
  deactivatedAccountIds: Set<string>;
};

function isoToAgeDays(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

// ─── PHASE 1: Account Snapshots ─────────────────────────────────────────────

async function phase1AccountSnapshots(
  accounts: OwnAccount[],
  deps: {
    social: SocialApiClient;
    stable: StableApiClient;
    storage: StorageService;
    stats: ScrapeStats;
  },
): Promise<void> {
  console.log(`\n=== PHASE 1: Account Snapshots (${accounts.length} accounts) ===`);

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const label = `[P1 ${i + 1}/${accounts.length}] @${account.username}`;

    try {
      let followerCount: number | null = null;
      let followingCount: number | null = null;
      let mediaCount: number | null = null;
      let biography: string | null = null;
      let profilePicUrl: string | null = null;
      let source = 'social';

      // Primary: SocialAPI
      try {
        const profile = await deps.social.fetchProfile(account.username);
        followerCount = profile.followerCount;
        followingCount = profile.followingCount;
        mediaCount = profile.mediaCount;
        biography = profile.biography;
        profilePicUrl = profile.profilePicUrl;
      } catch (error) {
        const apiErr = error as ApiError;

        // 404 → mark inactive
        if (apiErr.status === 404) {
          console.log(`${label} — 404 from SocialAPI, marking inactive`);
          await deps.storage.markAccountInactive(account.id);
          deps.stats.accountsMarkedInactive++;
          deps.stats.deactivatedAccountIds.add(account.id);
          continue;
        }

        // 401/403 → critical, stop
        if (apiErr.status === 401 || apiErr.status === 403) {
          console.error(`${label} — SocialAPI auth error (${apiErr.status}), stopping`);
          throw error;
        }

        // Fallback: Stable API
        console.warn(`${label} — SocialAPI failed, trying Stable API fallback`);
        source = 'stable';
        try {
          const fallback = await deps.stable.fetchProfile(account.username);
          followerCount = fallback.followerCount;
          followingCount = fallback.followingCount;
          mediaCount = fallback.mediaCount;
          biography = fallback.biography;
          profilePicUrl = fallback.profilePicUrl;
        } catch (fallbackError) {
          const fbErr = fallbackError as ApiError;
          if (fbErr.status === 404) {
            console.log(`${label} — 404 from both APIs, marking inactive`);
            await deps.storage.markAccountInactive(account.id);
            deps.stats.accountsMarkedInactive++;
            deps.stats.deactivatedAccountIds.add(account.id);
            continue;
          }
          throw fallbackError;
        }
      }

      // 0-follower safety check
      const previousFollowers = account.followers ?? 0;
      if (
        followerCount === 0 &&
        previousFollowers >= 50
      ) {
        console.warn(`${label} — Both APIs returned 0 followers but previously had ${previousFollowers}, skipping snapshot (bad data)`);
        deps.stats.snapshotsSkipped0Followers++;
        continue;
      }

      // Write profile update
      await deps.storage.updateOwnAccountProfile(account.id, {
        followerCount,
        followingCount,
        mediaCount,
        biography,
        profilePicUrl,
      });

      // Write daily snapshot
      if (followerCount != null) {
        await deps.storage.writeAccountDailySnapshot(
          account.id,
          followerCount,
          followingCount ?? 0,
          mediaCount ?? 0,
        );
      }

      deps.stats.ownAccounts++;
      console.log(`${label} — done (${source}, ${followerCount ?? '?'} followers)`);
    } catch (error) {
      deps.stats.errors++;
      console.error(`${label} — ERROR:`, (error as Error).message);
    }
  }
}

// ─── PHASE 2: New Reel Discovery ────────────────────────────────────────────

async function phase2ReelDiscovery(
  accounts: OwnAccount[],
  deps: {
    social: SocialApiClient;
    storage: StorageService;
    stats: ScrapeStats;
    mode: ScrapeMode;
    aiServerUrl: string;
  },
): Promise<void> {
  const now = new Date();
  const maxAgeDays = deps.mode === 'daily' ? DAILY_REEL_AGE_DAYS : VPD_REEL_AGE_DAYS;
  console.log(`\n=== PHASE 2: Reel Discovery (${accounts.length} accounts, ${maxAgeDays}-day window) ===`);

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const label = `[P2 ${i + 1}/${accounts.length}] @${account.username}`;

    try {
      const existingMap = await deps.storage.getExistingOwnReels(account.id);

      // SocialAPI reels — returns taken_at!
      let reels: SocialReel[];
      try {
        reels = await deps.social.fetchReels(account.username, maxAgeDays);
      } catch (error) {
        const apiErr = error as ApiError;
        if (apiErr.status === 404) {
          console.log(`${label} — 404 on reels, marking inactive`);
          await deps.storage.markAccountInactive(account.id);
          deps.stats.accountsMarkedInactive++;
          continue;
        }
        console.error(`${label} — SocialAPI reels failed:`, (error as Error).message);
        deps.stats.errors++;
        continue; // No fallback for reel discovery
      }

      let newCount = 0;
      const processed: Array<{
        reelId: string;
        code: string;
        caption: string | null;
        analysisStatus: string | null;
        videoUrl: string | null;
        views: number;
        likes: number;
        comments: number;
        vpd: ReelVPD;
      }> = [];

      for (const reel of reels) {
        try {
          if (!reel.takenAtIso) continue; // Skip reels without posted date
          if (isoToAgeDays(reel.takenAtIso, now) > maxAgeDays) continue;

          const existing = existingMap.get(reel.code);
          const isNew = !existing;

          // For truly new reels, fetch post_info if we need video_url/thumbnail
          let videoUrl = reel.videoUrl;
          let posterUrl = reel.posterUrl;
          if (isNew && (!videoUrl || !posterUrl)) {
            try {
              const postInfo = await deps.social.fetchPostInfo(reel.code);
              videoUrl = postInfo.videoUrl ?? videoUrl;
              posterUrl = postInfo.thumbnailUrl ?? posterUrl;
            } catch {
              // Non-critical — we can still upsert without video_url
            }
          }

          const upserted = await deps.storage.upsertOwnReel(
            account.id,
            { code: reel.code, id: reel.id, views: reel.views, likes: reel.likes, comments: reel.comments, shares: reel.shares, caption: reel.caption, posterUrl, videoUrl },
            reel.takenAtIso,
          );

          if (isNew) newCount++;

          // 6-hourly snapshot for VPD tracking
          const isRecentEnoughForVpd = isoToAgeDays(reel.takenAtIso, now) <= VPD_REEL_AGE_DAYS;
          let prevSnapshot = null;
          if (isRecentEnoughForVpd) {
            prevSnapshot = await deps.storage.getPreviousOwnSnapshot(upserted.id);
            await deps.storage.insertOwnSnapshot(upserted.id, reel);
            deps.stats.ownSnapshots++;
          }

          // Daily snapshot
          if (deps.mode === 'daily') {
            const todayStr = now.toISOString().split('T')[0];
            await deps.storage.upsertDailySnapshot(
              upserted.id,
              upserted.supabase_reel_id,
              account.id,
              todayStr,
              reel.views,
              reel.likes,
              reel.comments,
              reel.shares,
            );
          }

          if (!isRecentEnoughForVpd) continue;

          const finalPostedAt = upserted.posted_at ?? reel.takenAtIso;
          if (!finalPostedAt) continue;

          const vpd = calculateReelVPD(reel.views, new Date(finalPostedAt), prevSnapshot, now);
          processed.push({
            reelId: upserted.id,
            code: reel.code,
            caption: reel.caption,
            analysisStatus: upserted.analysis_status,
            videoUrl: videoUrl ?? null,
            views: reel.views,
            likes: reel.likes,
            comments: reel.comments,
            vpd,
          });
        } catch (error) {
          deps.stats.errors++;
          console.error(`${label} reel ${reel.code} error:`, (error as Error).message);
        }
      }

      // VPD + flagging
      const accountVpd = calculateAccountVPD(processed.map((r) => r.vpd));
      await deps.storage.updateOwnAccountVpd(account.id, accountVpd);

      for (const reel of processed) {
        const flags = flagReel(reel.vpd, accountVpd);
        await deps.storage.updateOwnReelVpd(reel.reelId, reel.vpd, flags);
        deps.stats.ownReels++;
        if (flags.is_winner) deps.stats.winners++;
        if (flags.is_trending) deps.stats.trending++;

        // AI analysis
        if (
          shouldAnalyze({
            is_winner: flags.is_winner,
            is_outlier: false,
            is_trending: flags.is_trending,
            projected_views: reel.vpd.projected_views,
            analysis_status: reel.analysisStatus,
          })
        ) {
          let videoUrlForAi = reel.videoUrl;
          if (!videoUrlForAi) {
            try {
              const postInfo = await deps.social.fetchPostInfo(reel.code);
              videoUrlForAi = postInfo.videoUrl;
            } catch { /* skip AI if no video */ }
          }

          if (videoUrlForAi) {
            const queued = await queueAnalysis({
              storage: deps.storage,
              aiServerUrl: deps.aiServerUrl,
              source: 'crm_ig_reels',
              reelId: reel.reelId,
              caption: reel.caption,
              projectedViews: reel.vpd.projected_views,
              mediaDetail: { takenAtIso: null, posterUrl: null, videoUrl: videoUrlForAi },
            });
            if (queued) deps.stats.aiQueued++;
          }
        }
      }

      console.log(`${label} — done (${reels.length} reels fetched, ${newCount} new)`);
    } catch (error) {
      deps.stats.errors++;
      console.error(`${label} — ERROR:`, (error as Error).message);
    }
  }
}

// ─── PHASE 3: Reel Stats Update ─────────────────────────────────────────────

async function phase3ReelStatsUpdate(
  deps: {
    social: SocialApiClient;
    stable: StableApiClient;
    storage: StorageService;
    stats: ScrapeStats;
    mode: ScrapeMode;
  },
): Promise<void> {
  const now = new Date();
  const reels = await deps.storage.getReelsForStatsUpdate(STATS_UPDATE_AGE_DAYS);
  console.log(`\n=== PHASE 3: Reel Stats Update (${reels.length} reels in 30-day window) ===`);

  if (reels.length === 0) return;

  const shortcodes = reels.map((r) => r.shortcode);

  // Batch fetch from Stable API
  const stableResults = await deps.stable.fetchReelStatsBatch(shortcodes);

  // Process results
  const failedShortcodes: string[] = [];
  for (const reel of reels) {
    const stableStats = stableResults.get(reel.shortcode);
    if (stableStats) {
      // Got stats from Stable API
      try {
        await deps.storage.insertOwnSnapshot(reel.id, stableStats);
        deps.stats.ownSnapshots++;

        if (deps.mode === 'daily') {
          const todayStr = now.toISOString().split('T')[0];
          await deps.storage.upsertDailySnapshot(
            reel.id,
            reel.supabase_reel_id,
            reel.ig_account_id,
            todayStr,
            stableStats.views,
            stableStats.likes,
            stableStats.comments,
            stableStats.shares,
          );
        }
      } catch (error) {
        deps.stats.errors++;
        console.error(`[P3] Snapshot write error for ${reel.shortcode}:`, (error as Error).message);
      }
    } else {
      failedShortcodes.push(reel.shortcode);
    }
  }

  // Fallback: SocialAPI post_info for failed ones
  if (failedShortcodes.length > 0) {
    console.log(`[P3] ${failedShortcodes.length} reels failed Stable API, trying SocialAPI fallback...`);

    const reelMap = new Map(reels.map((r) => [r.shortcode, r]));

    for (const shortcode of failedShortcodes) {
      const reel = reelMap.get(shortcode)!;
      try {
        const postInfo = await deps.social.fetchPostInfo(shortcode);
        await deps.storage.insertOwnSnapshot(reel.id, {
          views: postInfo.views,
          likes: postInfo.likes,
          comments: postInfo.comments,
          shares: postInfo.shares,
        });
        deps.stats.ownSnapshots++;

        if (deps.mode === 'daily') {
          const todayStr = now.toISOString().split('T')[0];
          await deps.storage.upsertDailySnapshot(
            reel.id,
            reel.supabase_reel_id,
            reel.ig_account_id,
            todayStr,
            postInfo.views,
            postInfo.likes,
            postInfo.comments,
            postInfo.shares,
          );
        }
      } catch (error) {
        const apiErr = error as ApiError;
        if (apiErr.status === 404) {
          console.log(`[P3] ${shortcode} — not found by either API, marking deleted`);
          await deps.storage.markReelDeleted(reel.id);
          deps.stats.reelsMarkedDeleted++;
        } else {
          deps.stats.errors++;
          console.error(`[P3] Fallback failed for ${shortcode}:`, (error as Error).message);
        }
      }
    }
  }

  console.log(`[P3] Stats update complete`);
}

// ─── REACTIVATION CHECK ─────────────────────────────────────────────────────

async function checkInactiveAccounts(
  deps: {
    social: SocialApiClient;
    storage: StorageService;
    stats: ScrapeStats;
  },
): Promise<void> {
  const inactive = await deps.storage.loadInactiveAccounts();
  if (inactive.length === 0) return;

  console.log(`\n=== Reactivation Check (${inactive.length} inactive accounts) ===`);

  for (const account of inactive) {
    try {
      const profile = await deps.social.fetchProfile(account.username);
      if (profile.followerCount != null && profile.followerCount > 0) {
        console.log(`[reactivate] @${account.username} — found with ${profile.followerCount} followers, reactivating`);
        await deps.storage.reactivateAccount(account.id);
        await deps.storage.updateOwnAccountProfile(account.id, {
          followerCount: profile.followerCount,
          followingCount: profile.followingCount,
          mediaCount: profile.mediaCount,
          biography: profile.biography,
          profilePicUrl: profile.profilePicUrl,
        });
        deps.stats.accountsReactivated++;
      }
    } catch {
      // Still not found or API error — stays inactive
    }
  }
}

// ─── COMPETITOR PROCESSING ──────────────────────────────────────────────────

async function processCompetitors(
  watchlists: CompetitorWatchlist[],
  deps: {
    social: SocialApiClient;
    stable: StableApiClient;
    storage: StorageService;
    stats: ScrapeStats;
    aiServerUrl: string;
  },
): Promise<void> {
  const now = new Date();
  console.log(`\n=== Competitor Processing (${watchlists.length} watchlists) ===`);

  for (let i = 0; i < watchlists.length; i++) {
    const watchlist = watchlists[i];
    const label = `[comp ${i + 1}/${watchlists.length}] @${watchlist.ig_username}`;

    try {
      // Profile snapshot (SocialAPI primary, Stable fallback)
      let profileData: { id?: string | null; followerCount: number | null; biography: string | null; profilePicUrl: string | null };
      try {
        const profile = await deps.social.fetchProfile(watchlist.ig_username);
        profileData = profile;
      } catch (error) {
        const apiErr = error as ApiError;
        if (apiErr.status === 404) {
          console.log(`${label} — 404, skipping`);
          continue;
        }
        try {
          const fallback = await deps.stable.fetchProfile(watchlist.ig_username);
          profileData = fallback;
        } catch {
          console.error(`${label} — both APIs failed for profile`);
          deps.stats.errors++;
          continue;
        }
      }

      await deps.storage.updateCompetitorProfile(watchlist.id, profileData);

      // Reel discovery via SocialAPI
      let reels: SocialReel[];
      try {
        reels = await deps.social.fetchReels(watchlist.ig_username, VPD_REEL_AGE_DAYS);
      } catch {
        console.warn(`${label} — reels fetch failed, skipping`);
        deps.stats.errors++;
        continue;
      }

      const existingMap = await deps.storage.getExistingCompetitorReels(watchlist.id);
      const processed: Array<{
        reelId: string;
        code: string;
        caption: string | null;
        analysisStatus: string | null;
        videoUrl: string | null;
        views: number;
        likes: number;
        comments: number;
        vpd: ReelVPD;
      }> = [];

      for (const reel of reels) {
        try {
          if (!reel.takenAtIso) continue;
          if (isoToAgeDays(reel.takenAtIso, now) > VPD_REEL_AGE_DAYS) continue;

          const existing = existingMap.get(reel.code);
          const upserted = await deps.storage.upsertCompetitorReel(
            watchlist.id,
            { code: reel.code, id: reel.id, views: reel.views, likes: reel.likes, comments: reel.comments, shares: reel.shares, caption: reel.caption, posterUrl: reel.posterUrl, videoUrl: reel.videoUrl },
            reel.takenAtIso,
            existing?.video_url ?? null,
          );

          const prevSnapshot = await deps.storage.getPreviousCompetitorSnapshot(upserted.id);
          await deps.storage.insertCompetitorSnapshot(upserted.id, reel);
          deps.stats.competitorSnapshots++;

          const finalPostedAt = upserted.posted_at ?? reel.takenAtIso;
          if (!finalPostedAt) continue;

          const vpd = calculateReelVPD(reel.views, new Date(finalPostedAt), prevSnapshot, now);
          processed.push({
            reelId: upserted.id,
            code: reel.code,
            caption: reel.caption,
            analysisStatus: upserted.analysis_status,
            videoUrl: upserted.video_url ?? reel.videoUrl ?? null,
            views: reel.views,
            likes: reel.likes,
            comments: reel.comments,
            vpd,
          });
        } catch (error) {
          deps.stats.errors++;
          console.error(`${label} reel ${reel.code} error:`, (error as Error).message);
        }
      }

      const accountVpd = calculateAccountVPD(processed.map((r) => r.vpd));
      await deps.storage.updateCompetitorAccountVpd(watchlist.id, accountVpd);

      for (const reel of processed) {
        const flags = flagReel(reel.vpd, accountVpd);
        await deps.storage.updateCompetitorReelVpd(reel.reelId, reel.vpd, flags);
        deps.stats.competitorReels++;
        if (flags.is_outlier) deps.stats.winners++;
        if (flags.is_trending) deps.stats.trending++;

        if (
          shouldAnalyze({
            is_winner: false,
            is_outlier: flags.is_outlier,
            is_trending: flags.is_trending,
            projected_views: reel.vpd.projected_views,
            analysis_status: reel.analysisStatus,
          })
        ) {
          let videoUrlForAi = reel.videoUrl;
          if (!videoUrlForAi) {
            try {
              const postInfo = await deps.social.fetchPostInfo(reel.code);
              videoUrlForAi = postInfo.videoUrl;
            } catch { /* skip */ }
          }

          if (videoUrlForAi) {
            const queued = await queueAnalysis({
              storage: deps.storage,
              aiServerUrl: deps.aiServerUrl,
              source: 'crm_competitor_reels',
              reelId: reel.reelId,
              caption: reel.caption,
              projectedViews: reel.vpd.projected_views,
              mediaDetail: { takenAtIso: null, posterUrl: null, videoUrl: videoUrlForAi },
            });
            if (queued) deps.stats.aiQueued++;
          }
        }
      }

      deps.stats.competitorAccounts++;
      console.log(`${label} — done (${reels.length} reels)`);
    } catch (error) {
      deps.stats.errors++;
      console.error(`${label} — ERROR:`, (error as Error).message);
    }
  }
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const start = Date.now();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST ?? 'instagram-scraper-stable-api.p.rapidapi.com';
  const socialApiKey = process.env.SOCIALAPI_KEY ?? process.env.SOCIALAPI_BEARER;
  const aiServerUrl = process.env.AI_SERVER_URL;

  if (!supabaseUrl || !serviceKey || !rapidApiKey || !aiServerUrl) {
    throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RAPIDAPI_KEY, AI_SERVER_URL');
  }

  if (!socialApiKey) {
    throw new Error('Missing SOCIALAPI_KEY (or SOCIALAPI_BEARER) env var');
  }

  const stats: ScrapeStats = {
    ownAccounts: 0,
    competitorAccounts: 0,
    ownReels: 0,
    competitorReels: 0,
    ownSnapshots: 0,
    competitorSnapshots: 0,
    winners: 0,
    trending: 0,
    aiQueued: 0,
    socialApiCalls: 0,
    stableApiCalls: 0,
    errors: 0,
    accountsMarkedInactive: 0,
    accountsReactivated: 0,
    reelsMarkedDeleted: 0,
    snapshotsSkipped0Followers: 0,
    deactivatedAccountIds: new Set<string>(),
  };

  const storage = new StorageService({ supabaseUrl, serviceKey });
  const social = new SocialApiClient(socialApiKey);
  const stable = new StableApiClient({ apiKey: rapidApiKey, host: rapidApiHost });

  // Determine scrape mode based on UTC hour
  const utcHour = new Date().getUTCHours();
  const mode: ScrapeMode = (process.env.SCRAPE_MODE as ScrapeMode) ?? (utcHour < 1 ? 'daily' : 'vpd');

  console.log(`[${new Date().toISOString()}] Starting ${mode.toUpperCase()} scrape cycle (UTC hour: ${utcHour})...`);
  console.log(`  Mode: ${mode === 'daily' ? '30-day reels + daily snapshots + VPD' : '14-day reels + VPD only'}`);

  // Check SocialAPI quota
  const quota = await social.fetchQuota();
  if (quota.remaining >= 0) {
    console.log(`  SocialAPI quota: ${quota.remaining}/${quota.total} remaining`);
  }

  let ownAccounts = await storage.loadOwnAccounts();
  let watchlists = await storage.loadCompetitorWatchlists();

  // TEST_ACCOUNTS: comma-separated usernames to limit the run (e.g. "user1,user2,@comp1")
  const testFilter = process.env.TEST_ACCOUNTS;
  if (testFilter) {
    const names = testFilter.split(',').map((n) => n.trim().replace(/^@/, '').toLowerCase());
    ownAccounts = ownAccounts.filter((a) => names.includes(a.username.toLowerCase()));
    watchlists = watchlists.filter((w) => names.includes(w.ig_username.replace(/^@/, '').toLowerCase()));
    console.log(`TEST_ACCOUNTS filter active — limited to ${ownAccounts.length} own, ${watchlists.length} competitor`);
  }

  console.log(`Loaded ${ownAccounts.length} own accounts, ${watchlists.length} competitor watchlists`);

  // Phase 1: Account snapshots
  await phase1AccountSnapshots(ownAccounts, { social, stable, storage, stats });

  // Phase 2: Reel discovery (only for accounts still active after Phase 1)
  const activeAccounts = ownAccounts.filter((a) => !stats.deactivatedAccountIds.has(a.id));
  await phase2ReelDiscovery(activeAccounts, { social, storage, stats, mode, aiServerUrl });

  // Phase 3: Reel stats update (30-day window) — skip when TEST_ACCOUNTS is set
  if (!testFilter) {
    await phase3ReelStatsUpdate({ social, stable, storage, stats, mode });
  } else {
    console.log('\nSkipping Phase 3 (reel stats update) — TEST_ACCOUNTS mode');
  }

  // Competitors
  await processCompetitors(watchlists, { social, stable, storage, stats, aiServerUrl });

  // Reactivation check (only on daily mode to save API calls) — skip in test mode
  if (mode === 'daily' && !testFilter) {
    await checkInactiveAccounts({ social, storage, stats });
  }

  stats.socialApiCalls = social.getApiCallCount();
  stats.stableApiCalls = stable.getApiCallCount();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n[${new Date().toISOString()}] Scrape cycle complete in ${elapsed}s`);
  const { deactivatedAccountIds: _, ...logStats } = stats;
  console.log(JSON.stringify(logStats, null, 2));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
