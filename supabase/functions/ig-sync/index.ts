// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseAdmin, json } from '../_shared/supabase.ts';

const TOM_SUPABASE_URL = Deno.env.get('TOM_SUPABASE_URL') ?? 'https://cihququkurdvblxqifwh.supabase.co';
const TOM_SUPABASE_ANON_KEY =
  Deno.env.get('TOM_SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNpaHF1cXVrdXJkdmJseHFpZndoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0ODcwNDgsImV4cCI6MjA3MzA2MzA0OH0.skVb4dSsWmOL_cJQ1vRlDI_Fv-gnkqUEreO0P-q0Pug';
const TOM_SUPABASE_EMAIL = Deno.env.get('TOM_SUPABASE_EMAIL') ?? 'niklas@1clickcontent.de';
const TOM_SUPABASE_PASSWORD = Deno.env.get('NIKLAS_SUPABASE_PASSWORD') ?? '';

const PAGE_SIZE = 1000;
const SNAPSHOT_DAYS_BACK = 7;
const SYNC_TABLES = {
  accounts: 'instagram_accounts',
  accountDaily: 'am_account_daily_snapshots',
  reels: 'am_reels',
  reelDaily: 'am_reels_daily_snapshots',
} as const;

const source = createClient(TOM_SUPABASE_URL, TOM_SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});

let sourceSession: any = null;

type SyncStateRow = {
  source_table: string;
  cursor_value: string | null;
  last_synced_at?: string;
  metadata?: Record<string, unknown> | null;
};

function toInt(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : 0;
  const normalized = String(value).trim().replace(/,/g, '');
  if (!normalized) return 0;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHandle(handle: string | null | undefined): string {
  return String(handle ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
}

function isoDateDaysAgo(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function ensureSourceSession(force = false) {
  if (!TOM_SUPABASE_PASSWORD) {
    throw new Error('Missing NIKLAS_SUPABASE_PASSWORD secret.');
  }

  if (!force && sourceSession?.access_token) {
    const expiresAtMs = Number(sourceSession.expires_at ?? 0) * 1000;
    const expiresSoon = expiresAtMs > 0 && expiresAtMs - Date.now() < 60_000;
    if (!expiresSoon) return sourceSession;
  }

  if (!force && sourceSession?.refresh_token) {
    const { data, error } = await source.auth.refreshSession({ refresh_token: sourceSession.refresh_token });
    if (!error && data?.session) {
      sourceSession = data.session;
      return sourceSession;
    }
  }

  const { data, error } = await source.auth.signInWithPassword({
    email: TOM_SUPABASE_EMAIL,
    password: TOM_SUPABASE_PASSWORD,
  });

  if (error || !data?.session) {
    throw new Error(`Source auth failed: ${error?.message ?? 'no session returned'}`);
  }

  sourceSession = data.session;
  return sourceSession;
}

async function withSourceRetry<T>(fn: () => Promise<T>) {
  await ensureSourceSession(false);
  try {
    return await fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('jwt') || message.toLowerCase().includes('token')) {
      await ensureSourceSession(true);
      return await fn();
    }
    throw error;
  }
}

async function fetchPagedRows(options: {
  table: string;
  select: string;
  orderBy: string;
  cursor?: string | null;
  gte?: string | null;
  limit?: number;
}) {
  const allRows: any[] = [];
  let offset = 0;
  const limit = options.limit ?? PAGE_SIZE;

  for (;;) {
    const rows = await withSourceRetry(async () => {
      let query = source
        .from(options.table)
        .select(options.select)
        .order(options.orderBy, { ascending: true, nullsFirst: true })
        .range(offset, offset + limit - 1);

      if (options.cursor) {
        query = query.gt(options.orderBy, options.cursor);
      }

      if (options.gte) {
        query = query.gte(options.orderBy, options.gte);
      }

      const { data, error } = await query;
      if (error) throw new Error(`[${options.table}] ${error.message}`);
      return data ?? [];
    });

    if (rows.length === 0) break;
    allRows.push(...rows);

    if (rows.length < limit) break;
    offset += rows.length;
  }

  return allRows;
}

async function setSyncState(sourceTable: string, cursorValue: string | null, metadata: Record<string, unknown>) {
  const row: SyncStateRow = {
    source_table: sourceTable,
    cursor_value: cursorValue,
    last_synced_at: new Date().toISOString(),
    metadata,
  };

  const { error } = await supabaseAdmin
    .from('crm_ig_sync_state')
    .upsert(row, { onConflict: 'source_table' });

  if (error) throw error;
}

async function fetchCreatorMap() {
  const { data, error } = await supabaseAdmin
    .from('crm_creators')
    .select('id,instagram_username,instagram_usernames')
    .eq('status', 'active');

  if (error) throw error;

  const map = new Map<string, string>();
  for (const creator of data ?? []) {
    const handles = [creator.instagram_username, ...(creator.instagram_usernames ?? [])]
      .map((value: string | null | undefined) => normalizeHandle(value))
      .filter(Boolean);

    for (const handle of handles) {
      if (!map.has(handle)) map.set(handle, creator.id as string);
    }
  }

  return map;
}

async function fetchAccountIdMap() {
  const { data, error } = await supabaseAdmin.from('crm_ig_accounts').select('id,supabase_id');
  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.supabase_id), row.id as string);
  }
  return map;
}

async function fetchReelIdMap() {
  const { data, error } = await supabaseAdmin.from('crm_ig_reels').select('id,supabase_reel_id');
  if (error) throw error;

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(String(row.supabase_reel_id), row.id as string);
  }
  return map;
}

async function syncAccounts() {
  const startedAt = Date.now();
  const creatorMap = await fetchCreatorMap();

  const sourceRows = await fetchPagedRows({
    table: SYNC_TABLES.accounts,
    select: 'id,username,name,follower_count,following_count,media_count,bio,profile_pic_path,isActive',
    orderBy: 'id',
  });

  const nowIso = new Date().toISOString();
  const rows = sourceRows
    .filter((row) => row?.id != null && row?.username)
    .filter((row) => row?.isActive !== false)
    .map((row) => ({
      supabase_id: String(row.id),
      creator_id: creatorMap.get(normalizeHandle(row.username)) ?? null,
      username: String(row.username),
      followers: toInt(row.follower_count),
      following: toInt(row.following_count),
      media_count: toInt(row.media_count),
      bio: row.bio ?? null,
      profile_pic_url: row.profile_pic_path ?? null,
      last_synced_at: nowIso,
    }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('crm_ig_accounts')
      .upsert(rows, { onConflict: 'supabase_id' });
    if (error) throw error;
  }

  await setSyncState(SYNC_TABLES.accounts, null, {
    mode: 'full',
    pulled: sourceRows.length,
    upserted: rows.length,
    durationMs: Date.now() - startedAt,
  });

  return { pulled: sourceRows.length, upserted: rows.length };
}

async function syncAccountSnapshots(forceFull = false) {
  const startedAt = Date.now();
  const windowStart = forceFull ? null : isoDateDaysAgo(SNAPSHOT_DAYS_BACK);

  const sourceRows = await fetchPagedRows({
    table: SYNC_TABLES.accountDaily,
    select: 'internal_account_id,date,followers,following,views,likes,comments,reels_posted,feed_posted,stories_posted',
    orderBy: 'date',
    gte: windowStart,
  });

  const accountMap = await fetchAccountIdMap();
  const nowIso = new Date().toISOString();

  const rows = sourceRows
    .map((row) => {
      const igAccountId = accountMap.get(String(row.internal_account_id));
      if (!igAccountId) return null;
      const dateIso = row.date ? String(row.date).slice(0, 10) : null;
      if (!dateIso) return null;

      return {
        ig_account_id: igAccountId,
        date: dateIso,
        followers: toInt(row.followers),
        following: toInt(row.following),
        views: toInt(row.views),
        likes: toInt(row.likes),
        comments: toInt(row.comments),
        reels_posted: toInt(row.reels_posted),
        feed_posted: toInt(row.feed_posted),
        stories_posted: toInt(row.stories_posted),
        last_synced_at: nowIso,
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('crm_ig_daily_snapshots')
      .upsert(rows, { onConflict: 'ig_account_id,date' });
    if (error) throw error;
  }

  await setSyncState(SYNC_TABLES.accountDaily, null, {
    mode: forceFull ? 'full' : 'last_7_days',
    windowStart,
    pulled: sourceRows.length,
    upserted: rows.length,
    durationMs: Date.now() - startedAt,
  });

  return { windowStart, pulled: sourceRows.length, upserted: rows.length };
}

async function syncReels() {
  const startedAt = Date.now();

  const sourceRows = await fetchPagedRows({
    table: SYNC_TABLES.reels,
    select: 'id,internal_account_id,username,shortcode,posted_at,caption,views,likes,comments,shares',
    orderBy: 'posted_at',
  });

  const accountMap = await fetchAccountIdMap();
  const nowIso = new Date().toISOString();

  const rows = sourceRows
    .map((row) => {
      const igAccountId = accountMap.get(String(row.internal_account_id));
      if (!igAccountId) return null;
      const sourceReelId = row.id ?? row.shortcode;
      if (!sourceReelId) return null;

      return {
        ig_account_id: igAccountId,
        supabase_reel_id: String(sourceReelId),
        caption: row.caption ?? null,
        thumbnail_url: null,
        posted_at: row.posted_at ?? null,
        views: toInt(row.views),
        likes: toInt(row.likes),
        comments: toInt(row.comments),
        shares: toInt(row.shares),
        last_synced_at: nowIso,
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('crm_ig_reels')
      .upsert(rows, { onConflict: 'supabase_reel_id' });
    if (error) throw error;
  }

  await setSyncState(SYNC_TABLES.reels, null, {
    mode: 'full',
    pulled: sourceRows.length,
    upserted: rows.length,
    durationMs: Date.now() - startedAt,
  });

  return { pulled: sourceRows.length, upserted: rows.length };
}

async function syncReelSnapshots(forceFull = false) {
  const startedAt = Date.now();
  const windowStart = forceFull ? null : isoDateDaysAgo(SNAPSHOT_DAYS_BACK);

  const sourceRows = await fetchPagedRows({
    table: SYNC_TABLES.reelDaily,
    select: 'reel_id,shortcode,internal_account_id,snapshot_date,views,likes,comments,shares',
    orderBy: 'snapshot_date',
    gte: windowStart,
  });

  const reelMap = await fetchReelIdMap();
  const nowIso = new Date().toISOString();

  let skippedMissingReel = 0;
  const rows = sourceRows
    .map((row) => {
      const sourceReelId = row.reel_id ?? row.shortcode;
      if (!sourceReelId) return null;

      const reelId = reelMap.get(String(sourceReelId));
      if (!reelId) {
        skippedMissingReel += 1;
        return null;
      }

      const snapshotDate = row.snapshot_date ? String(row.snapshot_date).slice(0, 10) : null;
      if (!snapshotDate) return null;

      return {
        ig_reel_id: reelId,
        supabase_reel_id: String(sourceReelId),
        account_id: String(row.internal_account_id ?? ''),
        snapshot_date: snapshotDate,
        views: toInt(row.views),
        likes: toInt(row.likes),
        comments: toInt(row.comments),
        shares: toInt(row.shares),
        last_synced_at: nowIso,
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('crm_ig_reel_daily_snapshots')
      .upsert(rows, { onConflict: 'supabase_reel_id,snapshot_date' });
    if (error) throw error;
  }

  await setSyncState(SYNC_TABLES.reelDaily, null, {
    mode: forceFull ? 'full' : 'last_7_days',
    windowStart,
    pulled: sourceRows.length,
    upserted: rows.length,
    skippedMissingReel,
    durationMs: Date.now() - startedAt,
  });

  return { windowStart, pulled: sourceRows.length, upserted: rows.length, skippedMissingReel };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json().catch(() => ({}));
    const forceFull = Boolean(body?.forceFullSync);

    const accountStats = await syncAccounts();
    const accountDailyStats = await syncAccountSnapshots(forceFull);
    const reelsStats = await syncReels();
    const reelDailyStats = await syncReelSnapshots(forceFull);

    return json({
      ok: true,
      forceFull,
      source: TOM_SUPABASE_URL,
      syncedAt: new Date().toISOString(),
      stats: {
        accounts: accountStats,
        accountDailySnapshots: accountDailyStats,
        reels: reelsStats,
        reelDailySnapshots: reelDailyStats,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message }, { status: 500 });
  }
});
