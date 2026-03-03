// @ts-nocheck
import { supabaseAdmin, json } from '../_shared/supabase.ts';

const OF_API_BASE = Deno.env.get('OF_API_BASE') ?? 'https://api.onlyfansapi.com';
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

async function fetchOf(path: string) {
  const res = await fetch(`${OF_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${OF_API_KEY}`,
      'Content-Type': 'application/json',
    },
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

async function syncEarnings(accountId: string) {
  return withSyncState(accountId, 'earnings', async () => {
    const payload = await fetchOf(`/v1/accounts/${accountId}/earnings/daily`);
    const rows = (payload?.data ?? []).map((r: any) => ({
      account_id: accountId,
      date: r.date,
      total_earnings: r.total_earnings ?? 0,
      subscription_earnings: r.subscription_earnings ?? 0,
      tip_earnings: r.tip_earnings ?? 0,
      message_earnings: r.message_earnings ?? 0,
      stream_earnings: r.stream_earnings ?? 0,
      referral_earnings: r.referral_earnings ?? 0,
      transaction_count: r.transaction_count ?? 0,
      subscription_count: r.subscription_count ?? 0,
      tip_count: r.tip_count ?? 0,
      message_count: r.message_count ?? 0,
      chargeback_amount: r.chargeback_amount ?? 0,
      chargeback_count: r.chargeback_count ?? 0,
      net_earnings: r.net_earnings ?? 0,
      synced_at: new Date().toISOString(),
    }));

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
    const payload = await fetchOf(`/v1/accounts/${accountId}/transactions`);
    const rows = (payload?.data ?? []).map((r: any) => ({
      account_id: accountId,
      of_transaction_id: String(r.id),
      amount: r.amount ?? 0,
      type: r.type ?? 'subscription',
      fan_id: r.fan_id ?? null,
      fan_username: r.fan_username ?? null,
      timestamp: r.timestamp ?? new Date().toISOString(),
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
    const payload = await fetchOf(`/v1/accounts/${accountId}/chargebacks`);
    return { count: (payload?.data ?? []).length };
  });
}

async function syncFans(accountId: string) {
  return withSyncState(accountId, 'fans', async () => {
    const payload = await fetchOf(`/v1/accounts/${accountId}/fans`);
    return { count: (payload?.data ?? []).length };
  });
}

async function syncChats(accountId: string) {
  return withSyncState(accountId, 'chats', async () => {
    const payload = await fetchOf(`/v1/accounts/${accountId}/chats`);
    return { count: (payload?.data ?? []).length };
  });
}

async function syncForecast(accountId: string) {
  return withSyncState(accountId, 'forecast', async () => {
    const payload = await fetchOf(`/v1/accounts/${accountId}/forecast`);
    return { generatedAt: payload?.generated_at ?? null };
  });
}

async function syncTrackingLinks(accountId: string) {
  return withSyncState(accountId, 'tracking_links', async () => {
    const payload = await fetchOf(`/v1/accounts/${accountId}/tracking-links`);
    return { count: (payload?.data ?? []).length };
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
    const message = err instanceof Error ? err.message : 'unknown error';
    return json({ error: message }, { status: 500 });
  }
});
