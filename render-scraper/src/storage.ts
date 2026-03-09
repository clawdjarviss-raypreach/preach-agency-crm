import { createClient, SupabaseClient } from '@supabase/supabase-js';

import type { AccountVPD, ReelFlags, ReelVPD } from './vpd';

export type OwnAccount = {
  id: string;
  username: string;
  creator_id: string | null;
  is_active: boolean;
  followers: number | null;
};

export type CompetitorWatchlist = {
  id: string;
  ig_username: string;
  ig_user_id: string | null;
  creator_id: string | null;
  format_id: string | null;
};

export type ExistingOwnReel = {
  id: string;
  shortcode: string | null;
  supabase_reel_id: string;
  posted_at: string | null;
  analysis_status: string | null;
};

export type ExistingCompetitorReel = {
  id: string;
  ig_media_code: string;
  posted_at: string | null;
  analysis_status: string | null;
  video_url: string | null;
};

export type ReelForStatsUpdate = {
  id: string;
  shortcode: string;
  ig_account_id: string;
  posted_at: string;
  supabase_reel_id: string;
};

export type SnapshotPoint = {
  views: number;
  scrapedAt: Date;
};

export type UpsertedOwnReel = {
  id: string;
  supabase_reel_id: string;
  posted_at: string | null;
  analysis_status: string | null;
};

export type UpsertedCompetitorReel = {
  id: string;
  posted_at: string | null;
  analysis_status: string | null;
  video_url: string | null;
};

export type AiJobSource = 'crm_ig_reels' | 'crm_competitor_reels';

export class StorageService {
  private readonly supabase: SupabaseClient;

  constructor(params: { supabaseUrl: string; serviceKey: string }) {
    this.supabase = createClient(params.supabaseUrl, params.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async loadOwnAccounts(): Promise<OwnAccount[]> {
    const { data, error } = await this.supabase
      .from('crm_ig_accounts')
      .select('id,username,creator_id,is_active,followers')
      .eq('is_active', true)
      .order('username', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      is_active: true,
      followers: typeof row.followers === 'number' ? row.followers : null,
    })) as OwnAccount[];
  }

  async loadInactiveAccounts(): Promise<OwnAccount[]> {
    const { data, error } = await this.supabase
      .from('crm_ig_accounts')
      .select('id,username,creator_id,is_active,followers')
      .eq('is_active', false)
      .order('username', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => ({
      ...row,
      is_active: false,
      followers: typeof row.followers === 'number' ? row.followers : null,
    })) as OwnAccount[];
  }

  async markAccountInactive(accountId: string): Promise<void> {
    const { error } = await this.supabase
      .from('crm_ig_accounts')
      .update({ is_active: false, last_synced_at: new Date().toISOString() })
      .eq('id', accountId);
    if (error) throw error;
  }

  async reactivateAccount(accountId: string): Promise<void> {
    const { error } = await this.supabase
      .from('crm_ig_accounts')
      .update({ is_active: true, last_synced_at: new Date().toISOString() })
      .eq('id', accountId);
    if (error) throw error;
  }

  async markReelDeleted(reelId: string): Promise<void> {
    const { error } = await this.supabase
      .from('crm_ig_reels')
      .update({ is_deleted: true, last_synced_at: new Date().toISOString() })
      .eq('id', reelId);
    if (error) throw error;
  }

  async getReelsForStatsUpdate(maxAgeDays: number): Promise<ReelForStatsUpdate[]> {
    const cutoff = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();
    const { data, error } = await this.supabase
      .from('crm_ig_reels')
      .select('id,shortcode,ig_account_id,posted_at,supabase_reel_id')
      .gte('posted_at', cutoff)
      .eq('is_deleted', false)
      .order('posted_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).filter(
      (r: Record<string, unknown>) => typeof r.shortcode === 'string' && r.shortcode.length > 0,
    ) as ReelForStatsUpdate[];
  }

  async writeAccountDailySnapshot(
    accountId: string,
    followerCount: number,
    followingCount: number,
    mediaCount: number,
  ): Promise<void> {
    const snapshotDate = new Date().toISOString().split('T')[0];

    // Check if row exists for today
    const { data: existing } = await this.supabase
      .from('crm_ig_account_daily_snapshots')
      .select('id')
      .eq('ig_account_id', accountId)
      .eq('snapshot_date', snapshotDate)
      .maybeSingle();

    if (existing) {
      const { error } = await this.supabase
        .from('crm_ig_account_daily_snapshots')
        .update({ follower_count: followerCount, following_count: followingCount, media_count: mediaCount })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await this.supabase
        .from('crm_ig_account_daily_snapshots')
        .insert({
          ig_account_id: accountId,
          snapshot_date: snapshotDate,
          follower_count: followerCount,
          following_count: followingCount,
          media_count: mediaCount,
        });
      if (error) throw error;
    }
  }

  async loadCompetitorWatchlists(): Promise<CompetitorWatchlist[]> {
    const { data, error } = await this.supabase
      .from('crm_competitor_watchlists')
      .select('id,ig_username,ig_user_id,creator_id,format_id')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data ?? []) as CompetitorWatchlist[];
  }

  async updateOwnAccountProfile(
    accountId: string,
    profile: {
      followerCount: number | null;
      followingCount?: number | null;
      mediaCount?: number | null;
      biography: string | null;
      profilePicUrl: string | null;
    },
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      bio: profile.biography,
      profile_pic_url: profile.profilePicUrl,
      last_synced_at: new Date().toISOString(),
    };

    if (typeof profile.followerCount === 'number' && Number.isFinite(profile.followerCount)) {
      patch.followers = profile.followerCount;
    }

    const { error } = await this.supabase.from('crm_ig_accounts').update(patch).eq('id', accountId);
    if (error) throw error;
  }

  async updateCompetitorProfile(
    watchlistId: string,
    profile: {
      id?: string | null;
      followerCount: number | null;
      biography: string | null;
      profilePicUrl: string | null;
    },
  ): Promise<void> {
    const { error } = await this.supabase
      .from('crm_competitor_watchlists')
      .update({
        ig_user_id: profile.id ?? undefined,
        follower_count: profile.followerCount,
        profile_pic_url: profile.profilePicUrl,
        bio: profile.biography,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', watchlistId);

    if (error) throw error;
  }

  async getExistingOwnReels(accountId: string): Promise<Map<string, ExistingOwnReel>> {
    const { data, error } = await this.supabase
      .from('crm_ig_reels')
      .select('id,shortcode,supabase_reel_id,posted_at,analysis_status')
      .eq('ig_account_id', accountId)
      .order('last_synced_at', { ascending: false })
      .limit(5000);

    if (error) throw error;

    const map = new Map<string, ExistingOwnReel>();
    for (const row of data ?? []) {
      // Key by shortcode (universal) — matches RapidAPI reel.code
      const key = row.shortcode ?? row.supabase_reel_id;
      if (typeof key === 'string' && key.length > 0) {
        map.set(key, row as ExistingOwnReel);
      }
    }
    return map;
  }

  async getExistingCompetitorReels(watchlistId: string): Promise<Map<string, ExistingCompetitorReel>> {
    const { data, error } = await this.supabase
      .from('crm_competitor_reels')
      .select('id,ig_media_code,posted_at,analysis_status,video_url')
      .eq('watchlist_id', watchlistId)
      .order('synced_at', { ascending: false })
      .limit(1000);

    if (error) throw error;

    const map = new Map<string, ExistingCompetitorReel>();
    for (const row of data ?? []) {
      if (typeof row.ig_media_code === 'string' && row.ig_media_code.length > 0) {
        map.set(row.ig_media_code, row as ExistingCompetitorReel);
      }
    }

    return map;
  }

  async upsertOwnReel(
    accountId: string,
    reel: { code: string; id?: string | null; mediaId?: string | null; views: number; likes: number; comments: number; shares: number; caption: string | null; posterUrl: string | null; videoUrl: string | null },
    postedAtIso: string | null,
  ): Promise<UpsertedOwnReel> {
    const { data, error } = await this.supabase
      .from('crm_ig_reels')
      .upsert(
        {
          ig_account_id: accountId,
          shortcode: reel.code,
          supabase_reel_id: reel.mediaId ?? reel.id ?? reel.code,
          caption: reel.caption,
          thumbnail_url: reel.posterUrl,
          video_url: reel.videoUrl,
          posted_at: postedAtIso,
          views: reel.views,
          likes: reel.likes,
          comments: reel.comments,
          shares: reel.shares,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'ig_account_id,shortcode' },
      )
      .select('id,supabase_reel_id,posted_at,analysis_status')
      .single();

    if (error) throw error;
    return data as UpsertedOwnReel;
  }

  async upsertCompetitorReel(
    watchlistId: string,
    reel: { code: string; id?: string | null; mediaId?: string | null; views: number; likes: number; comments: number; shares?: number; caption: string | null; posterUrl: string | null; videoUrl: string | null },
    postedAtIso: string | null,
    videoUrlOverride: string | null,
  ): Promise<UpsertedCompetitorReel> {
    const { data, error } = await this.supabase
      .from('crm_competitor_reels')
      .upsert(
        {
          watchlist_id: watchlistId,
          ig_media_code: reel.code,
          ig_media_id: reel.mediaId ?? reel.id,
          play_count: reel.views,
          like_count: reel.likes,
          comment_count: reel.comments,
          caption: reel.caption,
          thumbnail_url: reel.posterUrl,
          video_url: videoUrlOverride ?? reel.videoUrl,
          posted_at: postedAtIso,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'watchlist_id,ig_media_code' },
      )
      .select('id,posted_at,analysis_status,video_url')
      .single();

    if (error) throw error;
    return data as UpsertedCompetitorReel;
  }

  async getPreviousOwnSnapshot(igReelId: string): Promise<SnapshotPoint | null> {
    const { data, error } = await this.supabase
      .from('crm_ig_reel_snapshots')
      .select('views,scraped_at')
      .eq('ig_reel_id', igReelId)
      .order('scraped_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      views: Number(data.views ?? 0),
      scrapedAt: new Date(String(data.scraped_at)),
    };
  }

  async getPreviousCompetitorSnapshot(competitorReelId: string): Promise<SnapshotPoint | null> {
    const { data, error } = await this.supabase
      .from('crm_competitor_reel_snapshots')
      .select('views,scraped_at')
      .eq('competitor_reel_id', competitorReelId)
      .order('scraped_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      views: Number(data.views ?? 0),
      scrapedAt: new Date(String(data.scraped_at)),
    };
  }

  async insertOwnSnapshot(
    igReelId: string,
    metrics: { views: number; likes: number; comments: number; shares: number },
  ): Promise<void> {
    const { error } = await this.supabase.from('crm_ig_reel_snapshots').insert({
      ig_reel_id: igReelId,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      scraped_at: new Date().toISOString(),
    });

    if (error) throw error;
  }

  async insertCompetitorSnapshot(
    competitorReelId: string,
    metrics: { views: number; likes: number; comments: number },
  ): Promise<void> {
    const { error } = await this.supabase.from('crm_competitor_reel_snapshots').insert({
      competitor_reel_id: competitorReelId,
      views: metrics.views,
      likes: metrics.likes,
      comments: metrics.comments,
      scraped_at: new Date().toISOString(),
    });

    if (error) throw error;
  }

  /**
   * Write a daily snapshot row matching Tom's format (crm_ig_reel_daily_snapshots).
   * This keeps the dashboard RPCs working seamlessly.
   * Uses SELECT + INSERT/UPDATE pattern since we can't add a unique constraint right now.
   */
  async upsertDailySnapshot(
    igReelId: string,
    supabaseReelId: string,
    accountId: string,
    snapshotDate: string, // YYYY-MM-DD
    views: number,
    likes: number,
    comments: number,
    shares: number,
  ): Promise<void> {
    // Check if row exists for this reel + date
    const { data: existing } = await this.supabase
      .from('crm_ig_reel_daily_snapshots')
      .select('id,views,likes,comments,shares')
      .eq('ig_reel_id', igReelId)
      .eq('snapshot_date', snapshotDate)
      .maybeSingle();

    // Get yesterday's snapshot for delta calculation
    const { data: yesterday } = await this.supabase
      .from('crm_ig_reel_daily_snapshots')
      .select('views,likes,comments,shares')
      .eq('ig_reel_id', igReelId)
      .lt('snapshot_date', snapshotDate)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const viewsDelta = yesterday ? views - (yesterday.views ?? 0) : 0;
    const likesDelta = yesterday ? likes - (yesterday.likes ?? 0) : 0;
    const commentsDelta = yesterday ? comments - (yesterday.comments ?? 0) : 0;
    const sharesDelta = yesterday ? shares - (yesterday.shares ?? 0) : 0;

    if (existing) {
      // Update with latest values (later scrape in the day wins)
      const { error } = await this.supabase
        .from('crm_ig_reel_daily_snapshots')
        .update({
          views,
          likes,
          comments,
          shares,
          views_delta: Math.max(viewsDelta, 0),
          likes_delta: Math.max(likesDelta, 0),
          comments_delta: Math.max(commentsDelta, 0),
          shares_delta: Math.max(sharesDelta, 0),
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      // Insert new row
      const { error } = await this.supabase
        .from('crm_ig_reel_daily_snapshots')
        .insert({
          ig_reel_id: igReelId,
          supabase_reel_id: supabaseReelId,
          account_id: accountId,
          snapshot_date: snapshotDate,
          views,
          likes,
          comments,
          shares,
          views_delta: Math.max(viewsDelta, 0),
          likes_delta: Math.max(likesDelta, 0),
          comments_delta: Math.max(commentsDelta, 0),
          shares_delta: Math.max(sharesDelta, 0),
          last_synced_at: new Date().toISOString(),
        });
      if (error) throw error;
    }
  }

  async updateOwnAccountVpd(accountId: string, accountVpd: AccountVPD): Promise<void> {
    const { error } = await this.supabase
      .from('crm_ig_accounts')
      .update({
        median_vpd: accountVpd.median_vpd,
        median_delta_vpd: accountVpd.median_delta_vpd,
        winner_threshold: accountVpd.winner_threshold,
        active_reel_count: accountVpd.active_reel_count,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    if (error) throw error;
  }

  async updateCompetitorAccountVpd(watchlistId: string, accountVpd: AccountVPD): Promise<void> {
    const { error } = await this.supabase
      .from('crm_competitor_watchlists')
      .update({
        median_vpd: accountVpd.median_vpd,
        median_delta_vpd: accountVpd.median_delta_vpd,
        winner_threshold: accountVpd.winner_threshold,
        active_reel_count: accountVpd.active_reel_count,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', watchlistId);

    if (error) throw error;
  }

  async updateOwnReelVpd(reelId: string, vpd: ReelVPD, flags: ReelFlags): Promise<void> {
    const { error } = await this.supabase
      .from('crm_ig_reels')
      .update({
        lifetime_vpd: vpd.lifetime_vpd,
        delta_vpd: vpd.delta_vpd,
        effective_vpd: vpd.effective_vpd,
        is_trending: flags.is_trending,
        projected_views: vpd.projected_views,
        age_days: vpd.age_days,
        is_winner: flags.is_winner,
        performance_ratio: flags.virality_ratio,
      })
      .eq('id', reelId);

    if (error) throw error;
  }

  async updateCompetitorReelVpd(reelId: string, vpd: ReelVPD, flags: ReelFlags): Promise<void> {
    const { error } = await this.supabase
      .from('crm_competitor_reels')
      .update({
        lifetime_vpd: vpd.lifetime_vpd,
        delta_vpd: vpd.delta_vpd,
        effective_vpd: vpd.effective_vpd,
        is_trending: flags.is_trending,
        projected_views: vpd.projected_views,
        age_days: vpd.age_days,
        is_outlier: flags.is_outlier,
        virality_ratio: flags.virality_ratio,
      })
      .eq('id', reelId);

    if (error) throw error;
  }

  async markAnalysisQueued(source: AiJobSource, reelId: string): Promise<void> {
    const table = source === 'crm_ig_reels' ? 'crm_ig_reels' : 'crm_competitor_reels';
    const { error } = await this.supabase
      .from(table)
      .update({ analysis_status: 'queued' })
      .eq('id', reelId);

    if (error) throw error;
  }

  async enqueueAiJob(input: {
    source: AiJobSource;
    reelId: string;
    videoUrl: string;
    caption: string | null;
    projectedViews: number;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('ai_jobs')
      .insert({
        type: 'reel_analysis',
        source: input.source,
        source_id: input.reelId,
        status: 'queued',
        params: {
          videoUrl: input.videoUrl,
          caption: input.caption,
          projectedViews: input.projectedViews,
          source: input.source,
          reelId: input.reelId,
        },
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) throw error;
    return String(data.id);
  }

  async setCompetitorVideoUrl(reelId: string, videoUrl: string): Promise<void> {
    const { error } = await this.supabase
      .from('crm_competitor_reels')
      .update({ video_url: videoUrl })
      .eq('id', reelId);

    if (error) throw error;
  }
}
