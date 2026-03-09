import { sleep } from './utils';

const REQUEST_DELAY_MS = 1500; // 50 req/min → ~1200ms minimum, using 1500ms for safety
const RETRY_BASE_MS = 1000;
const BATCH_SIZE = 10;
const BATCH_MIN_DURATION_MS = 15_000;

type ApiError = Error & { status?: number };

/**
 * Stable API reel stats — flat response, no data wrapper.
 */
export type StableReelStats = {
  shortcode: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

/**
 * Stable API profile (fallback for SocialAPI).
 */
export type StableProfile = {
  followerCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  biography: string | null;
  profilePicUrl: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export class StableApiClient {
  private readonly apiKey: string;
  private readonly host: string;
  private readonly baseUrl: string;
  private lastRequestAt = 0;
  private apiCalls = 0;

  constructor(params: { apiKey: string; host: string }) {
    this.apiKey = params.apiKey;
    this.host = params.host;
    this.baseUrl = `https://${params.host}`;
  }

  getApiCallCount(): number {
    return this.apiCalls;
  }

  private async waitForRateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    const waitMs = Math.max(REQUEST_DELAY_MS - elapsed, 0);
    if (waitMs > 0) await sleep(waitMs);
  }

  private async request(path: string, retries = 3): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt++) {
      await this.waitForRateLimit();

      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': this.apiKey,
            'x-rapidapi-host': this.host,
          },
          signal: AbortSignal.timeout(30_000),
        });

        this.lastRequestAt = Date.now();
        this.apiCalls++;

        if (response.status === 401 || response.status === 403) {
          const e: ApiError = new Error(`StableAPI ${response.status}: API key problem`);
          e.status = response.status;
          throw e; // Critical — don't retry
        }

        if (response.status === 404) {
          const e: ApiError = new Error(`StableAPI 404: Not found`);
          e.status = 404;
          throw e;
        }

        if (response.status === 429) {
          if (attempt < retries) {
            await sleep(RETRY_BASE_MS * Math.pow(2, attempt) * 5); // Aggressive backoff for 50/min limit
            continue;
          }
          const e: ApiError = new Error('StableAPI 429: rate limited');
          e.status = 429;
          throw e;
        }

        if (!response.ok) {
          const text = await response.text();
          const e: ApiError = new Error(`StableAPI ${response.status}: ${text}`);
          e.status = response.status;
          lastError = e;
          if (attempt < retries) {
            await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
            continue;
          }
          throw e;
        }

        return response.json();
      } catch (error) {
        const apiErr = error as ApiError;
        if (apiErr.status === 401 || apiErr.status === 403 || apiErr.status === 404) throw error;
        lastError = error;
        if (attempt < retries) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
          continue;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('StableAPI request failed');
  }

  /**
   * Phase 3 primary: Fetch reel metrics by shortcode.
   * Flat response — no `data` wrapper.
   */
  async fetchReelStats(shortcode: string): Promise<StableReelStats> {
    const payload = await this.request(
      `/get_media_data_v2.php?media_code=${encodeURIComponent(shortcode)}`,
    );

    const obj = asObject(payload);

    return {
      shortcode,
      views: Number(obj.video_play_count ?? 0) || 0,
      likes: Number(
        obj.like_count ??
          (asObject(obj.edge_media_preview_like) as Record<string, unknown>).count ??
          0,
      ) || 0,
      comments: Number(
        obj.comment_count ??
          (asObject(obj.edge_media_to_parent_comment) as Record<string, unknown>).count ??
          0,
      ) || 0,
      shares: Number(obj.share_count ?? 0) || 0,
    };
  }

  /**
   * Batch fetch reel stats: 10 parallel requests, minimum 15s per batch.
   */
  async fetchReelStatsBatch(shortcodes: string[]): Promise<Map<string, StableReelStats | null>> {
    const results = new Map<string, StableReelStats | null>();

    for (let i = 0; i < shortcodes.length; i += BATCH_SIZE) {
      const batchStart = Date.now();
      const batch = shortcodes.slice(i, i + BATCH_SIZE);

      const promises = batch.map(async (code) => {
        try {
          const stats = await this.fetchReelStats(code);
          return { code, stats };
        } catch (error) {
          const apiErr = error as ApiError;
          if (apiErr.status === 404) {
            return { code, stats: null }; // Reel deleted
          }
          console.error(`[StableAPI] Failed to fetch stats for ${code}:`, (error as Error).message);
          return { code, stats: null };
        }
      });

      const batchResults = await Promise.all(promises);
      for (const { code, stats } of batchResults) {
        results.set(code, stats);
      }

      // Ensure minimum batch duration
      const elapsed = Date.now() - batchStart;
      if (elapsed < BATCH_MIN_DURATION_MS && i + BATCH_SIZE < shortcodes.length) {
        await sleep(BATCH_MIN_DURATION_MS - elapsed);
      }
    }

    return results;
  }

  /**
   * Fallback profile fetch (used when SocialAPI fails).
   */
  async fetchProfile(username: string): Promise<StableProfile> {
    const payload = await this.request(
      `/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(username)}`,
    );

    const obj = asObject(payload);
    const userData = asObject(obj.user_data ?? obj.user ?? obj);

    return {
      followerCount: userData.follower_count != null ? Number(userData.follower_count) : null,
      followingCount: userData.following_count != null ? Number(userData.following_count) : null,
      mediaCount: userData.media_count != null ? Number(userData.media_count) : null,
      biography: typeof userData.biography === 'string' ? userData.biography : null,
      profilePicUrl: typeof userData.profile_pic_url === 'string' ? userData.profile_pic_url : null,
    };
  }
}
