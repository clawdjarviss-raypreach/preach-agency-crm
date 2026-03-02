// @ts-nocheck
import { supabaseAdmin, json } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, { status: 405 });

    const { startDate, endDate, creatorId, job } = await req.json();

    if (job === 'refresh_cache') {
      // placeholder for future materialized view refreshes
      return json({ ok: true, refreshed: true });
    }

    let earningsQuery = supabaseAdmin
      .from('crm_of_daily_earnings')
      .select('total_earnings, net_earnings, date, account_id')
      .gte('date', startDate)
      .lte('date', endDate);

    if (creatorId) {
      const { data: accounts, error: accountError } = await supabaseAdmin
        .from('crm_of_accounts')
        .select('account_id')
        .eq('creator_id', creatorId);
      if (accountError) throw accountError;
      const accountIds = (accounts ?? []).map((a) => a.account_id);
      earningsQuery = earningsQuery.in('account_id', accountIds);
    }

    const { data: earnings, error: earningsError } = await earningsQuery;
    if (earningsError) throw earningsError;

    const totalRevenue = (earnings ?? []).reduce((sum, row) => sum + Number(row.total_earnings ?? 0), 0);
    const totalNet = (earnings ?? []).reduce((sum, row) => sum + Number(row.net_earnings ?? 0), 0);

    const { data: tx, error: txError } = await supabaseAdmin
      .from('crm_of_transactions')
      .select('id', { count: 'exact', head: true })
      .gte('timestamp', `${startDate}T00:00:00.000Z`)
      .lte('timestamp', `${endDate}T23:59:59.999Z`);

    if (txError) throw txError;

    return json({
      range: { startDate, endDate },
      metrics: {
        totalRevenue,
        totalNet,
        transactionCount: tx ?? 0,
      },
      earnings: earnings ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return json({ error: message }, { status: 500 });
  }
});
