// @ts-nocheck
import { supabaseAdmin, json } from '../_shared/supabase.ts';

const OF_API_BASE = Deno.env.get('OF_API_BASE') ?? 'https://app.onlyfansapi.com';
const OF_API_KEY = Deno.env.get('OF_API_KEY') ?? '';

type SyncEndpoint =
  | 'earnings'
  | 'transactions'
  | 'chargebacks'
  | 'fans'
  | 'chats'
  | 'messages'
  | 'forecast'
  | 'tracking_links'
  | 'reconciliation'
  | 'webhook';

async function fetchOf(path: string, opts?: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: Record<string, string | number | undefined> }) {
  const url = new URL(`${OF_API_BASE}${path}`);
  for (const [key, value] of Object.entries(opts?.query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const method = opts?.method ?? 'GET';
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${OF_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(opts?.body ?? {}) : undefined,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OF API ${res.status}: ${body}`);
  }

  return res.json();
}

async function setSyncState(accountId: string, endpoint: Exclude<SyncEndpoint, 'reconciliation'>, status: 'syncing' | 'idle' | 'error', error?: string | null) {
  const row = {
    account_id: accountId,
    endpoint,
    status,
    error: error ?? null,
    last_sync_at: status === 'idle' ? new Date().toISOString() : null,
  };

  const { error: upsertError } = await supabaseAdmin
    .from('crm_of_sync_state')
    .upsert(row, { onConflict: 'account_id,endpoint' });

  if (upsertError) throw upsertError;
}

async function withSyncState<T>(accountId: string, endpoint: Exclude<SyncEndpoint, 'reconciliation'>, fn: () => Promise<T>) {
  await setSyncState(accountId, endpoint, 'syncing');
  try {
    const result = await fn();
    await setSyncState(accountId, endpoint, 'idle');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown sync error';
    await setSyncState(accountId, endpoint, 'error', message);
    throw err;
  }
}

function listFromPayload<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data?.list)) return payload.data.list as T[];
  if (Array.isArray(payload?.data?.items)) return payload.data.items as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  if (Array.isArray(payload?.items)) return payload.items as T[];
  if (Array.isArray(payload?.results)) return payload.results as T[];
  return [];
}

function normalizeTransactionType(input: unknown): 'ppv' | 'tip' | 'subscription' | 'new_sub' | 'rebill' | 'stream' {
  const raw = String(input ?? '').toLowerCase();

  if (raw.includes('tip')) return 'tip';
  if (raw.includes('stream')) return 'stream';
  if (raw === 'new_subscription' || raw === 'new_sub' || raw === 'subscribes' || raw === 'subscribe') return 'new_sub';
  if (raw.includes('rebill') || raw === 'renewal' || raw === 'subscription_renewal') return 'rebill';
  if (raw === 'post' || raw === 'chat_messages' || raw === 'message' || raw === 'messages' || raw === 'ppv') return 'ppv';
  if (raw === 'subscription') return 'subscription';

  return 'subscription';
}

function getDefaultAnalyticsRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  return {
    start_date: start.toISOString().slice(0, 10),
    end_date: end.toISOString().slice(0, 10),
  };
}

async function syncEarnings(accountId: string) {
  return withSyncState(accountId, 'earnings', async () => {
    const range = getDefaultAnalyticsRange();
    const payload = await fetchOf(`/api/${accountId}/statistics/statements/earnings`, {
      query: {
        start_date: range.start_date,
        end_date: range.end_date,
      },
    });

    const parseDate = (value: unknown): string | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value * 1000).toISOString().slice(0, 10);
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      }
      return null;
    };

    const amountSeries = Array.isArray(payload?.data?.total?.chartAmount) ? payload.data.total.chartAmount : [];
    const countSeries = Array.isArray(payload?.data?.total?.chartCount) ? payload.data.total.chartCount : [];

    const countByDate = new Map<string, number>();
    for (const item of countSeries) {
      const date = parseDate(item?.date);
      if (!date) continue;
      countByDate.set(date, Number(item?.count ?? 0));
    }

    const rowsByDate = new Map<string, any>();
    const ensureRow = (date: string) => {
      if (!rowsByDate.has(date)) {
        rowsByDate.set(date, {
          account_id: accountId,
          date,
          total_earnings: 0,
          subscription_earnings: 0,
          tip_earnings: 0,
          message_earnings: 0,
          stream_earnings: 0,
          referral_earnings: 0,
          transaction_count: 0,
          subscription_count: 0,
          tip_count: 0,
          message_count: 0,
          chargeback_amount: 0,
          chargeback_count: 0,
          net_earnings: 0,
          synced_at: new Date().toISOString(),
        });
      }
      return rowsByDate.get(date)!;
    };

    for (const item of amountSeries) {
      const date = parseDate(item?.date);
      if (!date) continue;
      const row = ensureRow(date);
      const net = Number(item?.count ?? 0);
      row.net_earnings = net;
      row.total_earnings = net;
      row.transaction_count = countByDate.get(date) ?? row.transaction_count ?? 0;
    }

    for (const [date, count] of countByDate.entries()) {
      const row = ensureRow(date);
      row.transaction_count = Number(count ?? 0);
    }

    const rows = Array.from(rowsByDate.values());
    if (rows.length === 0) return { inserted: 0 };

    const { error } = await supabaseAdmin
      .from('crm_of_daily_earnings')
      .upsert(rows, { onConflict: 'account_id,date' });

    if (error) throw error;
    return { inserted: rows.length };
  });
}

async function syncTransactions(accountId: string) {
  return withSyncState(accountId, 'transactions', async () => {
    const all: any[] = [];
    const seenMarkers = new Set<string>();
    let marker: string | undefined;

    while (true) {
      const payload = await fetchOf(`/api/${accountId}/payouts/transactions`, {
        query: {
          limit: 100,
          marker,
        },
      });

      const items = listFromPayload(payload);
      all.push(...items);

      const nextMarker = payload?.data?.nextMarker
        ?? payload?.data?.next_marker
        ?? payload?.nextMarker
        ?? payload?.next_marker
        ?? payload?.marker;

      if (!nextMarker || seenMarkers.has(String(nextMarker)) || items.length === 0) {
        break;
      }

      seenMarkers.add(String(nextMarker));
      marker = String(nextMarker);
    }

    const rows = all
      .filter((r: any) => r?.id)
      .map((r: any) => ({
        account_id: accountId,
        of_transaction_id: String(r.id),
        amount: r.amount ?? 0,
        type: normalizeTransactionType(r.type ?? r.category ?? r.description),
        fan_id: r.fan_id ?? null,
        fan_username: r.fan_username ?? null,
        timestamp: r.createdAt ?? r.created_at ?? r.timestamp ?? new Date().toISOString(),
        metadata: r,
      }));

    if (rows.length === 0) return { inserted: 0 };

    const { error } = await supabaseAdmin
      .from('crm_of_transactions')
      .upsert(rows, { onConflict: 'of_transaction_id' });

    if (error) throw error;
    return { inserted: rows.length };
  });
}

async function syncChargebacks(accountId: string) {
  return withSyncState(accountId, 'chargebacks', async () => {
    const payload = await fetchOf(`/api/${accountId}/chargebacks`);
    return { count: listFromPayload(payload).length };
  });
}

async function syncFans(accountId: string) {
  return withSyncState(accountId, 'fans', async () => {
    const payload = await fetchOf(`/api/${accountId}/fans/all`);
    return { count: listFromPayload(payload).length };
  });
}

async function syncChats(accountId: string) {
  return withSyncState(accountId, 'chats', async () => {
    const payload = await fetchOf(`/api/${accountId}/chats`);
    return { count: listFromPayload(payload).length };
  });
}

async function syncForecast(accountId: string) {
  return withSyncState(accountId, 'forecast', async () => {
    const payload = await fetchOf('/api/analytics/financial/forecast', {
      method: 'POST',
      body: {
        account_id: accountId,
      },
    });
    return { generatedAt: payload?.generated_at ?? null };
  });
}

async function syncTrackingLinks(accountId: string) {
  return withSyncState(accountId, 'tracking_links', async () => {
    const payload = await fetchOf(`/api/${accountId}/tracking-links`);
    const items = listFromPayload(payload);

    if (items.length === 0) return { inserted: 0 };

    const { data: ofAccount, error: accountError } = await supabaseAdmin
      .from('crm_of_accounts')
      .select('creator_id')
      .eq('account_id', accountId)
      .maybeSingle();

    if (accountError) throw accountError;

    const rows = items
      .map((link: any) => {
        const linkId = String(link?.id ?? link?.link_id ?? link?.trackingLinkId ?? '').trim();
        if (!linkId) return null;

        const url = String(link?.url ?? link?.tracking_url ?? link?.trackingUrl ?? '').trim();
        const rawName = link?.name ?? link?.title ?? link?.slug ?? url ?? linkId;
        const name = String(rawName).trim();

        return {
          account_id: accountId,
          creator_id: ofAccount?.creator_id ?? null,
          link_id: linkId,
          name: name || linkId,
          url: url || linkId,
          clicks: Number(link?.clicks ?? link?.click_count ?? link?.visits ?? 0),
          subscribers: Number(link?.subscribers ?? link?.subscriber_count ?? link?.conversions ?? 0),
          conversion_rate: Number(link?.conversion_rate ?? link?.conversionRate ?? 0),
          last_synced_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (rows.length === 0) return { inserted: 0 };

    const { error } = await supabaseAdmin
      .from('crm_of_tracking_links')
      .upsert(rows, { onConflict: 'account_id,link_id' });

    if (error) throw error;

    return { inserted: rows.length };
  });
}

async function ingestWebhookEvent(eventType: string, accountId: string | null, payload: unknown) {
  const { data, error } = await supabaseAdmin
    .from('crm_of_webhook_events')
    .insert({
      event_type: eventType,
      account_id: accountId,
      payload,
      processed: false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return { id: data?.id };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json();

    const rawJob = body?.job as SyncEndpoint;
    const job = rawJob === 'messages' ? 'chats' : rawJob;
    const targetAccountId = body?.accountId ? String(body.accountId) : null;

    if (job === 'webhook') {
      const eventType = String(body?.eventType ?? body?.type ?? 'unknown');
      const inserted = await ingestWebhookEvent(eventType, targetAccountId, body?.payload ?? body);
      return json({ ok: true, job, inserted });
    }

    let accountsQuery = supabaseAdmin
      .from('crm_of_accounts')
      .select('account_id')
      .eq('status', 'active');

    if (targetAccountId) {
      accountsQuery = accountsQuery.eq('account_id', targetAccountId);
    }

    const { data: accounts, error: accountsError } = await accountsQuery;

    if (accountsError) throw accountsError;

    const results: any[] = [];

    for (const row of accounts ?? []) {
      const accountId = row.account_id as string;
      if (job === 'earnings') results.push({ accountId, ...(await syncEarnings(accountId)) });
      if (job === 'transactions') results.push({ accountId, ...(await syncTransactions(accountId)) });
      if (job === 'chargebacks') results.push({ accountId, ...(await syncChargebacks(accountId)) });
      if (job === 'fans') results.push({ accountId, ...(await syncFans(accountId)) });
      if (job === 'chats') results.push({ accountId, ...(await syncChats(accountId)) });
      if (job === 'forecast') results.push({ accountId, ...(await syncForecast(accountId)) });
      if (job === 'tracking_links') results.push({ accountId, ...(await syncTrackingLinks(accountId)) });
      if (job === 'reconciliation') {
        const earnings = await syncEarnings(accountId);
        const transactions = await syncTransactions(accountId);
        const chargebacks = await syncChargebacks(accountId);
        results.push({ accountId, earnings, transactions, chargebacks });
      }
    }

    return json({ ok: true, job, results });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : JSON.stringify(err);
    return json({ error: message }, { status: 500 });
  }
});
