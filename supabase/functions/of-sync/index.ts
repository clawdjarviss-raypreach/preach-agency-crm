// @ts-nocheck
import { supabaseAdmin, json } from '../_shared/supabase.ts';

const OF_API_BASE = Deno.env.get('OF_API_BASE') ?? 'https://api.onlyfansapi.com';
const OF_API_KEY = Deno.env.get('OF_API_KEY') ?? '';

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

async function syncEarnings(accountId: string) {
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
}

async function syncTransactions(accountId: string) {
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
}

async function syncChargebacks(accountId: string) {
  const payload = await fetchOf(`/v1/accounts/${accountId}/chargebacks`);
  return { count: (payload?.data ?? []).length };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });
    const body = await req.json();

    const job = body?.job as string;

    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('crm_of_accounts')
      .select('account_id')
      .eq('status', 'active');

    if (accountsError) throw accountsError;

    const results: any[] = [];

    for (const row of accounts ?? []) {
      const accountId = row.account_id as string;
      if (job === 'earnings') results.push({ accountId, ...(await syncEarnings(accountId)) });
      if (job === 'transactions') results.push({ accountId, ...(await syncTransactions(accountId)) });
      if (job === 'chargebacks') results.push({ accountId, ...(await syncChargebacks(accountId)) });
      if (job === 'reconciliation') {
        const earnings = await syncEarnings(accountId);
        const transactions = await syncTransactions(accountId);
        results.push({ accountId, earnings, transactions });
      }
    }

    return json({ ok: true, job, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return json({ error: message }, { status: 500 });
  }
});
