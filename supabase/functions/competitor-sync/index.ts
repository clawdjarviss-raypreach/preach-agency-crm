// @ts-nocheck
import { supabaseAdmin, json } from '../_shared/supabase.ts';

const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY') ?? '';
const RAPIDAPI_HOST = Deno.env.get('RAPIDAPI_HOST') ?? 'instagram-scraper-stable-api.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/get_ig_user_reels.php`;

const REQUEST_DELAY_MS = 1500;
const RETRY_ON_429_DELAY_MS = 60_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function listFromPayload(payload: any): any[] {
  if (Array.isArray(payload?.reels)) return payload.reels;
  if (Array.isArray(payload?.data?.reels)) return payload.data.reels;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function fetchReelsForUsername(username: string) {
  const body = {
    username_or_url: username,
    amount: '30',
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(RAPIDAPI_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < 3) {
      await sleep(RETRY_ON_429_DELAY_MS);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`RapidAPI ${response.status} for @${username}: ${text}`);
    }

    return response.json();
  }

  throw new Error(`RapidAPI retries exhausted for @${username}`);
}

function extractMedia(row: any) {
  return row?.node?.media ?? row?.media ?? row;
}

function getPosterUrl(media: any): string | null {
  const candidates = media?.image_versions2?.candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    return candidates[0]?.url ?? null;
  }

  if (Array.isArray(media?.image_versions2) && media.image_versions2.length > 0) {
    return media.image_versions2[0]?.url ?? null;
  }

  return media?.thumbnail_url ?? media?.display_url ?? null;
}

function getVideoUrl(media: any): string | null {
  const versions = media?.video_versions;
  if (Array.isArray(versions) && versions.length > 0) {
    return versions[0]?.url ?? null;
  }
  return media?.video_url ?? null;
}

function toIsoFromUnix(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

async function getWatchlists() {
  const rows: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('crm_competitor_watchlists')
      .select('id,ig_username,ig_user_id,creator_id,format_id')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function syncWatchlist(watchlist: any) {
  const response = await fetchReelsForUsername(String(watchlist.ig_username));
  const reels = listFromPayload(response)
    .map(extractMedia)
    .filter((media: any) => Boolean(media?.code));

  const avgViews = reels.length > 0
    ? reels.reduce((sum: number, media: any) => sum + toNumber(media?.play_count), 0) / reels.length
    : 0;

  const rows = reels.map((media: any) => {
    const playCount = toNumber(media?.play_count);
    const isOutlier = avgViews > 0 && playCount >= avgViews * 3.0;

    return {
      watchlist_id: watchlist.id,
      ig_media_code: String(media?.code),
      ig_media_id: media?.pk ? String(media.pk) : null,
      play_count: playCount,
      like_count: toNumber(media?.like_count),
      comment_count: toNumber(media?.comment_count),
      caption: media?.caption?.text ?? media?.caption ?? null,
      thumbnail_url: getPosterUrl(media),
      video_url: getVideoUrl(media),
      is_outlier: isOutlier,
      outlier_multiplier: isOutlier && avgViews > 0 ? playCount / avgViews : null,
      posted_at: toIsoFromUnix(media?.taken_at),
      synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error: reelsError } = await supabaseAdmin
      .from('crm_competitor_reels')
      .upsert(rows, { onConflict: 'watchlist_id,ig_media_code' });

    if (reelsError) throw reelsError;
  }

  const profile = response?.user ?? response?.profile ?? {};
  const { error: watchlistError } = await supabaseAdmin
    .from('crm_competitor_watchlists')
    .update({
      ig_user_id: profile?.pk ? String(profile.pk) : watchlist.ig_user_id,
      follower_count: profile?.follower_count ?? profile?.followers ?? null,
      profile_pic_url: profile?.profile_pic_url ?? profile?.hd_profile_pic_url_info?.url ?? null,
      bio: profile?.biography ?? null,
      avg_views: avgViews > 0 ? avgViews : null,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', watchlist.id);

  if (watchlistError) throw watchlistError;

  return {
    watchlistId: watchlist.id,
    username: watchlist.ig_username,
    reelCount: rows.length,
    avgViews,
    outlierCount: rows.filter((row: any) => row.is_outlier).length,
  };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return json({ error: 'Method not allowed' }, { status: 405 });
    }

    if (!RAPIDAPI_KEY) {
      return json({ error: 'Missing RAPIDAPI_KEY' }, { status: 500 });
    }

    const watchlists = await getWatchlists();
    const results: any[] = [];

    for (let i = 0; i < watchlists.length; i += 1) {
      const watchlist = watchlists[i];
      try {
        const result = await syncWatchlist(watchlist);
        results.push({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ ok: false, watchlistId: watchlist.id, username: watchlist.ig_username, error: message });
      }

      if (i < watchlists.length - 1) {
        await sleep(REQUEST_DELAY_MS);
      }
    }

    return json({ ok: true, synced: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, { status: 500 });
  }
});
