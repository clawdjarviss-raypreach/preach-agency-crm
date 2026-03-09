import { getPosterUrl, getVideoUrl, sleep, toIsoFromUnix } from './utils';

const REQUEST_DELAY_MS = 200; // SocialAPI recommends 200ms between requests
const RETRY_BASE_MS = 1000;

type ApiError = Error & { status?: number };

export type SocialProfile = {
  id: string | null;
  username: string;
  followerCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  biography: string | null;
  profilePicUrl: string | null;
};

export type SocialReel = {
  code: string;
  id: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  takenAtIso: string | null;
};

export type SocialPostInfo = {
  code: string;
  takenAtIso: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export class SocialApiClient {
  private readonly bearerToken: string;
  private readonly baseUrl = 'https://api.socialapi.io';
  private lastRequestAt = 0;
  private apiCalls = 0;

  constructor(bearerToken: string) {
    this.bearerToken = bearerToken;
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
            Authorization: `Bearer ${this.bearerToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(30_000),
        });

        this.lastRequestAt = Date.now();
        this.apiCalls++;

        if (response.status === 401 || response.status === 403) {
          const e: ApiError = new Error(`SocialAPI ${response.status}: API key problem`);
          e.status = response.status;
          throw e; // Critical — don't retry
        }

        if (response.status === 404) {
          const e: ApiError = new Error(`SocialAPI 404: Not found`);
          e.status = 404;
          throw e; // Don't retry 404s
        }

        if (response.status === 429) {
          if (attempt < retries) {
            await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
            continue;
          }
          const e: ApiError = new Error('SocialAPI 429: rate limited');
          e.status = 429;
          throw e;
        }

        if (!response.ok) {
          const text = await response.text();
          const e: ApiError = new Error(`SocialAPI ${response.status}: ${text}`);
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
        // Don't retry critical errors
        if (apiErr.status === 401 || apiErr.status === 403 || apiErr.status === 404) throw error;
        lastError = error;
        if (attempt < retries) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1));
          continue;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('SocialAPI request failed');
  }

  async fetchProfile(username: string): Promise<SocialProfile> {
    const payload = await this.request(`/ig/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`);
    const obj = asObject(payload);
    const data = asObject(obj.data);

    return {
      id: data.pk != null ? String(data.pk) : data.id != null ? String(data.id) : null,
      username: typeof data.username === 'string' ? data.username : username,
      followerCount: data.follower_count != null ? Number(data.follower_count) : null,
      followingCount: data.following_count != null ? Number(data.following_count) : null,
      mediaCount: data.media_count != null ? Number(data.media_count) : null,
      biography: typeof data.biography === 'string' ? data.biography : null,
      profilePicUrl: typeof data.profile_pic_url === 'string' ? data.profile_pic_url : null,
    };
  }

  private parseReelItems(items: unknown[]): SocialReel[] {
    return items
      .map((item: unknown): SocialReel | null => {
        const media = asObject(item);
        const code = typeof media.code === 'string' ? media.code : media.code != null ? String(media.code) : '';
        if (!code) return null;

        const captionObj = asObject(media.caption);
        const caption =
          typeof captionObj.text === 'string'
            ? captionObj.text
            : typeof media.caption === 'string'
              ? (media.caption as string)
              : null;

        return {
          code,
          id: media.pk != null ? String(media.pk) : media.id != null ? String(media.id) : null,
          views: Number(media.play_count ?? media.ig_play_count ?? 0) || 0,
          likes: Number(media.like_count ?? 0) || 0,
          comments: Number(media.comment_count ?? 0) || 0,
          shares: Number(media.share_count ?? 0) || 0,
          caption,
          posterUrl: getPosterUrl(media),
          videoUrl: getVideoUrl(media),
          takenAtIso: toIsoFromUnix(media.taken_at),
        };
      })
      .filter((item): item is SocialReel => item !== null);
  }

  async fetchReels(username: string, maxAgeDays?: number): Promise<SocialReel[]> {
    const MAX_PAGES = 10;
    const cutoffMs = maxAgeDays != null ? Date.now() - maxAgeDays * 86_400_000 : 0;
    const allReels: SocialReel[] = [];
    let paginationToken: string | null = null;

    for (let page = 0; page < MAX_PAGES; page++) {
      let url = `/ig/v1/reels?username_or_id_or_url=${encodeURIComponent(username)}`;
      if (paginationToken) url += `&pagination_token=${encodeURIComponent(paginationToken)}`;

      const payload = await this.request(url);
      const obj = asObject(payload);
      const data = asObject(obj.data);
      const items = Array.isArray(data.items) ? data.items : [];

      if (items.length === 0) break;

      const reels = this.parseReelItems(items);
      allReels.push(...reels);

      // Check if the oldest reel on this page is beyond the cutoff
      if (maxAgeDays != null) {
        const oldestOnPage = reels
          .filter((r) => r.takenAtIso != null)
          .map((r) => new Date(r.takenAtIso!).getTime())
          .sort((a, b) => a - b)[0];

        if (oldestOnPage != null && oldestOnPage < cutoffMs) break;
      }

      // Check for pagination token (top-level in response, not inside data)
      const nextToken = typeof obj.pagination_token === 'string' ? obj.pagination_token : null;
      if (!nextToken) break;
      paginationToken = nextToken;
    }

    return allReels;
  }

  async fetchPostInfo(shortcode: string): Promise<SocialPostInfo> {
    const payload = await this.request(`/ig/v1/post_info?code_or_id_or_url=${encodeURIComponent(shortcode)}`);
    const obj = asObject(payload);
    const data = asObject(obj.data);
    const metrics = asObject(data.metrics);

    const captionObj = asObject(data.caption);
    const caption =
      typeof captionObj.text === 'string'
        ? captionObj.text
        : typeof data.caption === 'string'
          ? (data.caption as string)
          : null;

    return {
      code: typeof data.code === 'string' ? data.code : shortcode,
      takenAtIso: toIsoFromUnix(data.taken_at),
      videoUrl: typeof data.video_url === 'string' ? data.video_url : getVideoUrl(data),
      thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : getPosterUrl(data),
      views: Number(metrics.ig_play_count ?? metrics.play_count ?? data.play_count ?? 0) || 0,
      likes: Number(metrics.like_count ?? data.like_count ?? 0) || 0,
      comments: Number(metrics.comment_count ?? data.comment_count ?? 0) || 0,
      shares: Number(metrics.share_count ?? data.share_count ?? 0) || 0,
      caption,
    };
  }

  async fetchQuota(): Promise<{ remaining: number; total: number }> {
    try {
      const payload = await this.request('/ig/v1/quota');
      const obj = asObject(payload);
      const data = asObject(obj.data);
      return {
        remaining: Number(data.remaining ?? 0),
        total: Number(data.total ?? 0),
      };
    } catch {
      return { remaining: -1, total: -1 };
    }
  }
}
