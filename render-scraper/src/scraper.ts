import { getPosterUrl, getVideoUrl, sleep, toIsoFromUnix } from './utils';

const REQUEST_DELAY_MS = 1500;
const RETRY_429_DELAY_MS = 60_000;

type ApiError = Error & { status?: number };

export type RapidProfile = {
  id: string | null;
  username: string;
  followerCount: number | null;
  biography: string | null;
  profilePicUrl: string | null;
};

export type RapidReel = {
  code: string;
  mediaId: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  caption: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  takenAtIso: string | null;
};

export type MediaDetail = {
  takenAtIso: string | null;
  videoUrl: string | null;
  posterUrl: string | null;
};

type ReelsPagePayload = {
  reels?: unknown[];
  data?: { reels?: unknown[] };
  items?: unknown[];
  pagination_token?: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asMedia(row: unknown): Record<string, unknown> {
  const obj = asObject(row);
  const node = asObject(obj.node);
  const media = asObject(node.media);
  if (Object.keys(media).length > 0) return media;
  return asObject(obj.media && typeof obj.media === 'object' ? obj.media : obj);
}

function listReels(payload: unknown): unknown[] {
  const p = asObject(payload) as ReelsPagePayload;
  if (Array.isArray(p.reels)) return p.reels;
  if (Array.isArray(p.data?.reels)) return p.data.reels;
  if (Array.isArray(p.items)) return p.items;
  return [];
}

export class RapidApiClient {
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
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }

  private async request(path: string, init: RequestInit, retries = 3): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      await this.waitForRateLimit();

      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          'content-type': 'application/json',
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': this.host,
          ...(init.headers ?? {}),
        },
      });

      this.lastRequestAt = Date.now();
      this.apiCalls += 1;

      if (response.status === 429) {
        if (attempt < retries) {
          await sleep(RETRY_429_DELAY_MS);
          continue;
        }
        const e: ApiError = new Error('RapidAPI 429 (rate limited, retries exhausted)');
        e.status = 429;
        throw e;
      }

      if (!response.ok) {
        const text = await response.text();
        const e: ApiError = new Error(`RapidAPI ${response.status}: ${text}`);
        e.status = response.status;
        lastError = e;
        if (attempt < retries) {
          await sleep(1500);
          continue;
        }
        throw e;
      }

      return response.json();
    }

    throw lastError instanceof Error ? lastError : new Error('RapidAPI request failed');
  }

  async fetchProfile(username: string): Promise<RapidProfile> {
    const payload = await this.request('/ig_get_fb_profile_v3.php', {
      method: 'POST',
      body: JSON.stringify({ username_or_url: username }),
    });

    const obj = asObject(payload);
    const profile = asObject(obj.user && typeof obj.user === 'object' ? obj.user : obj.profile ?? obj);

    return {
      id: profile.pk != null ? String(profile.pk) : profile.id != null ? String(profile.id) : null,
      username,
      followerCount:
        profile.follower_count != null
          ? Number(profile.follower_count)
          : profile.followers != null
            ? Number(profile.followers)
            : null,
      biography: typeof profile.biography === 'string' ? profile.biography : null,
      profilePicUrl:
        typeof profile.profile_pic_url === 'string'
          ? profile.profile_pic_url
          : asObject(profile.hd_profile_pic_url_info).url != null
            ? String(asObject(profile.hd_profile_pic_url_info).url)
            : null,
    };
  }

  async fetchReelsPage(username: string, paginationToken?: string): Promise<{ reels: RapidReel[]; paginationToken?: string }> {
    const payload = await this.request('/get_ig_user_reels.php', {
      method: 'POST',
      body: JSON.stringify({
        username_or_url: username,
        amount: '30',
        ...(paginationToken ? { pagination_token: paginationToken } : {}),
      }),
    });

    const rows = listReels(payload);
    const reels = rows
      .map(asMedia)
      .map((media): RapidReel | null => {
        const codeRaw = media.code;
        const code = typeof codeRaw === 'string' ? codeRaw : codeRaw != null ? String(codeRaw) : '';
        if (!code) return null;

        const captionObj = asObject(media.caption);
        const caption =
          typeof captionObj.text === 'string'
            ? captionObj.text
            : typeof media.caption === 'string'
              ? media.caption
              : null;

        return {
          code,
          mediaId: media.pk != null ? String(media.pk) : media.id != null ? String(media.id) : null,
          views: Number(media.play_count ?? 0) || 0,
          likes: Number(media.like_count ?? 0) || 0,
          comments: Number(media.comment_count ?? 0) || 0,
          shares: Number(media.share_count ?? 0) || 0,
          caption,
          posterUrl: getPosterUrl(media),
          videoUrl: getVideoUrl(media),
          takenAtIso: toIsoFromUnix(media.taken_at),
        };
      })
      .filter((item): item is RapidReel => item !== null);

    const obj = asObject(payload);
    const nextToken = typeof obj.pagination_token === 'string' && obj.pagination_token.length > 0 ? obj.pagination_token : undefined;

    return { reels, paginationToken: nextToken };
  }

  async fetchAllReels(username: string): Promise<RapidReel[]> {
    const all: RapidReel[] = [];
    let token: string | undefined;

    do {
      const page = await this.fetchReelsPage(username, token);
      all.push(...page.reels);
      token = page.paginationToken;
    } while (token);

    return all;
  }

  async fetchMediaDetail(code: string): Promise<MediaDetail> {
    const payload = await this.request(`/get_media_data.php?reel_post_code_or_url=${encodeURIComponent(code)}&type=reel`, {
      method: 'GET',
    });

    const obj = asObject(payload);
    const media = asObject(obj.media && typeof obj.media === 'object' ? obj.media : obj);

    const takenAt = media.taken_at_timestamp ?? media.taken_at;

    return {
      takenAtIso: toIsoFromUnix(takenAt),
      videoUrl: getVideoUrl(media),
      posterUrl: getPosterUrl(media),
    };
  }
}
