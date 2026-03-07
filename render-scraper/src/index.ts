import 'dotenv/config';

import { queueAnalysis, shouldAnalyze } from './ai-gate';
import { RapidApiClient, type MediaDetail, type RapidReel } from './scraper';
import {
  StorageService,
  type CompetitorWatchlist,
  type ExistingCompetitorReel,
  type ExistingOwnReel,
  type OwnAccount,
} from './storage';
import { calculateAccountVPD, calculateReelVPD, flagReel, type ReelFlags, type ReelVPD } from './vpd';

const DAILY_REEL_AGE_DAYS = 30; // 00:00 UTC full scrape — matches Tom's 30-day tracking
const VPD_REEL_AGE_DAYS = 14;   // 06:00/12:00/18:00 UTC — VPD trending only

type ScrapeMode = 'daily' | 'vpd';


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
  apiCalls: number;
  errors: number;
};

type ProcessedReel = {
  reelId: string;
  code: string;
  caption: string | null;
  analysisStatus: string | null;
  videoUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  vpd: ReelVPD;
  flags: ReelFlags;
};

function isoToAgeDays(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000;
}

function sourceKey(reel: RapidReel): string {
  return reel.code; // shortcode — universal key across Tom's data and RapidAPI
}

function sourceCode(reel: RapidReel): string {
  return reel.code;
}

async function resolvePostedAt(params: {
  reel: RapidReel;
  existingPostedAt: string | null;
  isNew: boolean;
  mediaDetailCache: Map<string, MediaDetail>;
  rapid: RapidApiClient;
}): Promise<{ postedAtIso: string | null; mediaDetail: MediaDetail | null }> {
  if (params.reel.takenAtIso) {
    return { postedAtIso: params.reel.takenAtIso, mediaDetail: null };
  }

  if (params.existingPostedAt) {
    return { postedAtIso: params.existingPostedAt, mediaDetail: null };
  }

  if (!params.isNew) {
    return { postedAtIso: null, mediaDetail: null };
  }

  const cached = params.mediaDetailCache.get(params.reel.code);
  if (cached) {
    return { postedAtIso: cached.takenAtIso, mediaDetail: cached };
  }

  const detail = await params.rapid.fetchMediaDetail(params.reel.code);
  params.mediaDetailCache.set(params.reel.code, detail);
  return { postedAtIso: detail.takenAtIso, mediaDetail: detail };
}

async function processOwnAccount(
  account: OwnAccount,
  deps: {
    storage: StorageService;
    rapid: RapidApiClient;
    aiServerUrl: string;
    stats: ScrapeStats;
    mode: ScrapeMode;
  },
): Promise<void> {
  const now = new Date();
  const maxAgeDays = deps.mode === 'daily' ? DAILY_REEL_AGE_DAYS : VPD_REEL_AGE_DAYS;
  const maxPages = deps.mode === 'daily' ? 3 : 1; // 3 pages = ~36 reels for 30-day coverage
  const existingMap = await deps.storage.getExistingOwnReels(account.id);
  const mediaDetailCache = new Map<string, MediaDetail>();

  const profile = await deps.rapid.fetchProfile(account.username);
  await deps.storage.updateOwnAccountProfile(account.id, profile);

  const reels = await deps.rapid.fetchAllReels(account.username, maxPages);
  const processed: ProcessedReel[] = [];

  for (const reel of reels) {
    try {
      const existing = existingMap.get(sourceKey(reel));
      const { postedAtIso, mediaDetail } = await resolvePostedAt({
        reel,
        existingPostedAt: existing?.posted_at ?? null,
        isNew: !existing,
        mediaDetailCache,
        rapid: deps.rapid,
      });

      if (!postedAtIso) continue;
      if (isoToAgeDays(postedAtIso, now) > maxAgeDays) continue;

      const upserted = await deps.storage.upsertOwnReel(account.id, reel, postedAtIso);

      const isRecentEnoughForVpd = isoToAgeDays(postedAtIso, now) <= VPD_REEL_AGE_DAYS;

      // 6-hourly snapshot — only for reels within 14 days (VPD tracking)
      let prevSnapshot = null;
      if (isRecentEnoughForVpd) {
        prevSnapshot = await deps.storage.getPreviousOwnSnapshot(upserted.id);
        await deps.storage.insertOwnSnapshot(upserted.id, reel);
        deps.stats.ownSnapshots += 1;
      }

      // Daily snapshot — for ALL reels in this cycle (up to 30 days in daily mode)
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

      // VPD only for reels within 14 days
      if (!isRecentEnoughForVpd) continue;

      const finalPostedAt = upserted.posted_at ?? postedAtIso;
      if (!finalPostedAt) continue;

      const vpd = calculateReelVPD(reel.views, new Date(finalPostedAt), prevSnapshot, now);
      processed.push({
        reelId: upserted.id,
        code: sourceCode(reel),
        caption: reel.caption,
        analysisStatus: upserted.analysis_status,
        videoUrl: reel.videoUrl ?? mediaDetail?.videoUrl ?? null,
        views: reel.views,
        likes: reel.likes,
        comments: reel.comments,
        vpd,
        flags: { is_winner: false, is_outlier: false, is_trending: false, virality_ratio: 0 },
      });
    } catch (error) {
      deps.stats.errors += 1;
      console.error(`[own:@${account.username}] reel error:`, error);
    }
  }

  const accountVpd = calculateAccountVPD(processed.map((r) => r.vpd));
  await deps.storage.updateOwnAccountVpd(account.id, accountVpd);

  for (const reel of processed) {
    const flags = flagReel(reel.vpd, accountVpd);
    reel.flags = flags;

    await deps.storage.updateOwnReelVpd(reel.reelId, reel.vpd, flags);

    deps.stats.ownReels += 1;
    if (flags.is_winner) deps.stats.winners += 1;
    if (flags.is_trending) deps.stats.trending += 1;

    if (
      shouldAnalyze({
        is_winner: flags.is_winner,
        is_outlier: false,
        is_trending: flags.is_trending,
        projected_views: reel.vpd.projected_views,
        analysis_status: reel.analysisStatus,
      })
    ) {
      const detail = reel.videoUrl
        ? ({ takenAtIso: null, posterUrl: null, videoUrl: reel.videoUrl } as MediaDetail)
        : await deps.rapid.fetchMediaDetail(reel.code);

      const queued = await queueAnalysis({
        storage: deps.storage,
        aiServerUrl: deps.aiServerUrl,
        source: 'crm_ig_reels',
        reelId: reel.reelId,
        caption: reel.caption,
        projectedViews: reel.vpd.projected_views,
        mediaDetail: detail,
      });

      if (queued) deps.stats.aiQueued += 1;
    }
  }
}

async function processCompetitorAccount(
  watchlist: CompetitorWatchlist,
  deps: {
    storage: StorageService;
    rapid: RapidApiClient;
    aiServerUrl: string;
    stats: ScrapeStats;
  },
): Promise<void> {
  const now = new Date();
  const existingMap = await deps.storage.getExistingCompetitorReels(watchlist.id);
  const mediaDetailCache = new Map<string, MediaDetail>();

  const profile = await deps.rapid.fetchProfile(watchlist.ig_username);
  await deps.storage.updateCompetitorProfile(watchlist.id, profile);

  const reels = await deps.rapid.fetchAllReels(watchlist.ig_username);
  const processed: ProcessedReel[] = [];

  for (const reel of reels) {
    try {
      const existing = existingMap.get(sourceCode(reel));
      const { postedAtIso, mediaDetail } = await resolvePostedAt({
        reel,
        existingPostedAt: existing?.posted_at ?? null,
        isNew: !existing,
        mediaDetailCache,
        rapid: deps.rapid,
      });

      if (!postedAtIso) continue;
      if (isoToAgeDays(postedAtIso, now) > VPD_REEL_AGE_DAYS) continue;

      const upserted = await deps.storage.upsertCompetitorReel(
        watchlist.id,
        reel,
        postedAtIso,
        mediaDetail?.videoUrl ?? existing?.video_url ?? null,
      );

      const prevSnapshot = await deps.storage.getPreviousCompetitorSnapshot(upserted.id);
      await deps.storage.insertCompetitorSnapshot(upserted.id, reel);
      deps.stats.competitorSnapshots += 1;

      const finalPostedAt = upserted.posted_at ?? postedAtIso;
      if (!finalPostedAt) continue;

      const vpd = calculateReelVPD(reel.views, new Date(finalPostedAt), prevSnapshot, now);
      processed.push({
        reelId: upserted.id,
        code: sourceCode(reel),
        caption: reel.caption,
        analysisStatus: upserted.analysis_status,
        videoUrl: upserted.video_url ?? reel.videoUrl ?? mediaDetail?.videoUrl ?? null,
        views: reel.views,
        likes: reel.likes,
        comments: reel.comments,
        vpd,
        flags: { is_winner: false, is_outlier: false, is_trending: false, virality_ratio: 0 },
      });
    } catch (error) {
      deps.stats.errors += 1;
      console.error(`[competitor:@${watchlist.ig_username}] reel error:`, error);
    }
  }

  const accountVpd = calculateAccountVPD(processed.map((r) => r.vpd));
  await deps.storage.updateCompetitorAccountVpd(watchlist.id, accountVpd);

  for (const reel of processed) {
    const flags = flagReel(reel.vpd, accountVpd);
    reel.flags = flags;

    await deps.storage.updateCompetitorReelVpd(reel.reelId, reel.vpd, flags);

    deps.stats.competitorReels += 1;
    if (flags.is_outlier) deps.stats.winners += 1;
    if (flags.is_trending) deps.stats.trending += 1;

    if (
      shouldAnalyze({
        is_winner: false,
        is_outlier: flags.is_outlier,
        is_trending: flags.is_trending,
        projected_views: reel.vpd.projected_views,
        analysis_status: reel.analysisStatus,
      })
    ) {
      const detail = reel.videoUrl
        ? ({ takenAtIso: null, posterUrl: null, videoUrl: reel.videoUrl } as MediaDetail)
        : await deps.rapid.fetchMediaDetail(reel.code);

      const queued = await queueAnalysis({
        storage: deps.storage,
        aiServerUrl: deps.aiServerUrl,
        source: 'crm_competitor_reels',
        reelId: reel.reelId,
        caption: reel.caption,
        projectedViews: reel.vpd.projected_views,
        mediaDetail: detail,
      });

      if (queued) deps.stats.aiQueued += 1;
    }
  }
}

async function main(): Promise<void> {
  const start = Date.now();
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST ?? 'instagram-scraper-stable-api.p.rapidapi.com';
  const aiServerUrl = process.env.AI_SERVER_URL;

  if (!supabaseUrl || !serviceKey || !rapidApiKey || !aiServerUrl) {
    throw new Error('Missing one or more required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, RAPIDAPI_KEY, AI_SERVER_URL');
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
    apiCalls: 0,
    errors: 0,
  };

  const storage = new StorageService({ supabaseUrl, serviceKey });
  const rapid = new RapidApiClient({ apiKey: rapidApiKey, host: rapidApiHost });

  // Determine scrape mode based on UTC hour
  // 00:00 UTC = daily mode (30 days, writes daily snapshots for dashboard)
  // 06:00, 12:00, 18:00 UTC = vpd mode (14 days, 6-hourly snapshots for trending)
  // Can be overridden with SCRAPE_MODE env var for testing
  const utcHour = new Date().getUTCHours();
  const mode: ScrapeMode = (process.env.SCRAPE_MODE as ScrapeMode) ?? (utcHour < 1 ? 'daily' : 'vpd');

  console.log(`[${new Date().toISOString()}] Starting ${mode.toUpperCase()} scrape cycle (UTC hour: ${utcHour})...`);
  console.log(`  Mode: ${mode === 'daily' ? '30-day reels + daily snapshots + VPD' : '14-day reels + VPD only'}`);

  const ownAccounts = await storage.loadOwnAccounts();
  const watchlists = await storage.loadCompetitorWatchlists();

  console.log(`Loaded ${ownAccounts.length} own accounts, ${watchlists.length} competitor watchlists`);

  for (let i = 0; i < ownAccounts.length; i++) {
    const account = ownAccounts[i];
    console.log(`[own ${i + 1}/${ownAccounts.length}] Processing @${account.username}...`);
    try {
      await processOwnAccount(account, { storage, rapid, aiServerUrl, stats, mode });
      stats.ownAccounts += 1;
      console.log(`[own ${i + 1}/${ownAccounts.length}] @${account.username} — done`);
    } catch (error) {
      stats.errors += 1;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[own ${i + 1}/${ownAccounts.length}] @${account.username} — ERROR: ${msg}`);
    }
  }

  for (let i = 0; i < watchlists.length; i++) {
    const watchlist = watchlists[i];
    console.log(`[comp ${i + 1}/${watchlists.length}] Processing @${watchlist.ig_username}...`);
    try {
      await processCompetitorAccount(watchlist, { storage, rapid, aiServerUrl, stats });
      stats.competitorAccounts += 1;
      console.log(`[comp ${i + 1}/${watchlists.length}] @${watchlist.ig_username} — done`);
    } catch (error) {
      stats.errors += 1;
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[comp ${i + 1}/${watchlists.length}] @${watchlist.ig_username} — ERROR: ${msg}`);
    }
  }

  stats.apiCalls = rapid.getApiCallCount();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[${new Date().toISOString()}] Scrape cycle complete in ${elapsed}s`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
