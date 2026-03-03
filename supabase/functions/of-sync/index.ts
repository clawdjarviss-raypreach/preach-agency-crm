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
  if (raw.includes('rebill') || raw === 'renewal' || raw === 'subscription_renewal' || raw === 'recurring_subscription') return 'rebill';
  if (raw === 'post' || raw === 'chat_messages' || raw === 'message' || raw === 'messages' || raw === 'ppv') return 'ppv';
  if (raw === 'subscription') return 'subscription';

  return 'subscription';
}

function parseDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
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

function buildEmptyDailyEarnings(accountId: string, date: string) {
  return {
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
  };
}

async function syncEarnings(accountId: string) {
  return withSyncState(accountId, 'earnings', async () => {
    const range = getDefaultAnalyticsRange();
    const rowsByDate = new Map<string, any>();

    const ensureRow = (date: string) => {
      if (!rowsByDate.has(date)) rowsByDate.set(date, buildEmptyDailyEarnings(accountId, date));
      return rowsByDate.get(date)!;
    };

    const typeMappings = [
      { type: 'subscribes', payloadKey: 'subscribes', earningsKey: 'subscription_earnings', countKey: 'subscription_count' },
      { type: 'tips', payloadKey: 'tips', earningsKey: 'tip_earnings', countKey: 'tip_count' },
      { type: 'messages', payloadKey: 'chat_messages', earningsKey: 'message_earnings', countKey: 'message_count' },
      { type: 'post', payloadKey: 'post', earningsKey: 'message_earnings', countKey: 'message_count' },
      { type: 'stream', payloadKey: 'stream', earningsKey: 'stream_earnings', countKey: null },
    ] as const;

    for (const mapping of typeMappings) {
      const payload = await fetchOf(`/api/${accountId}/statistics/statements/earnings`, {
        query: {
          start_date: range.start_date,
          end_date: range.end_date,
          type: mapping.type,
        },
      });

      const typedPayload = payload?.data?.[mapping.payloadKey] ?? payload?.data?.total ?? null;
      const amountSeries = Array.isArray(typedPayload?.chartAmount) ? typedPayload.chartAmount : [];
      const countSeries = Array.isArray(typedPayload?.chartCount) ? typedPayload.chartCount : [];

      for (const item of amountSeries) {
        const date = parseDate(item?.date);
        if (!date) continue;
        const row = ensureRow(date);
        const amount = Number(item?.count ?? 0);
        row[mapping.earningsKey] += amount;
      }

      for (const item of countSeries) {
        const date = parseDate(item?.date);
        if (!date) continue;
        const row = ensureRow(date);
        const count = Number(item?.count ?? 0);
        row.transaction_count += count;
        if (mapping.countKey) row[mapping.countKey] += count;
      }
    }

    const rows = Array.from(rowsByDate.values()).map((row) => {
      row.total_earnings = Number(row.subscription_earnings ?? 0)
        + Number(row.tip_earnings ?? 0)
        + Number(row.message_earnings ?? 0)
        + Number(row.stream_earnings ?? 0)
        + Number(row.referral_earnings ?? 0);
      row.net_earnings = row.total_earnings - Number(row.chargeback_amount ?? 0);
      row.synced_at = new Date().toISOString();
      return row;
    });

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
        amount: Number(r.amount ?? r.net ?? 0),
        type: normalizeTransactionType(r.type ?? r.category ?? r.description),
        fan_id: r.fan_id ? String(r.fan_id) : (r.user?.id ? String(r.user.id) : null),
        fan_username: r.fan_username ?? r.user?.username ?? null,
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
    const chatsPayload = await fetchOf(`/api/${accountId}/chats`, { query: { limit: 100 } });
    const chats = listFromPayload(chatsPayload);

    const chatRows = chats
      .map((chat: any) => {
        const chatId = String(chat?.id ?? chat?.chat_id ?? '').trim();
        if (!chatId) return null;

        const withUser = chat?.withUser ?? chat?.with_user ?? chat?.fan ?? chat?.user ?? null;
        const lastMessageAt = parseDate(chat?.lastMessageAt ?? chat?.last_message_at ?? chat?.updatedAt ?? chat?.updated_at)
          ? new Date(chat?.lastMessageAt ?? chat?.last_message_at ?? chat?.updatedAt ?? chat?.updated_at).toISOString()
          : null;

        return {
          account_id: accountId,
          chat_id: chatId,
          fan_id: withUser?.id ? String(withUser.id) : null,
          fan_username: withUser?.username ?? null,
          fan_display_name: withUser?.name ?? withUser?.display_name ?? null,
          last_message_at: lastMessageAt,
          has_unread: Boolean(chat?.hasUnreadTips ?? chat?.has_unread ?? chat?.unread ?? false),
          metadata: chat,
          synced_at: new Date().toISOString(),
        };
      })
      .filter(Boolean);

    if (chatRows.length > 0) {
      const { error: chatsError } = await supabaseAdmin
        .from('crm_of_chats')
        .upsert(chatRows, { onConflict: 'account_id,chat_id' });
      if (chatsError) throw chatsError;
    }

    const messageRows: any[] = [];

    for (const chat of chats) {
      const chatId = String(chat?.id ?? chat?.chat_id ?? '').trim();
      if (!chatId) continue;

      const withUserId = chat?.withUser?.id ?? chat?.with_user?.id ?? chat?.fan?.id ?? chat?.user?.id;
      const seenMarkers = new Set<string>();
      let marker: string | undefined;

      while (true) {
        const payload = await fetchOf(`/api/${accountId}/chats/${chatId}/messages`, {
          query: {
            limit: 100,
            marker,
            order: 'desc',
          },
        });

        const messages = listFromPayload(payload);
        if (messages.length === 0) break;

        for (const message of messages) {
          const messageId = String(message?.id ?? message?.message_id ?? '').trim();
          if (!messageId) continue;

          const fromUserId = message?.fromUser?.id ?? message?.from_user?.id ?? message?.user?.id;
          const fromUser = withUserId ? String(fromUserId ?? '') === String(withUserId) : Boolean(message?.from_user || message?.fromUser);

          messageRows.push({
            account_id: accountId,
            chat_id: chatId,
            message_id: messageId,
            from_user: fromUser,
            text: typeof message?.text === 'string' ? message.text : null,
            timestamp: message?.createdAt ?? message?.created_at ?? message?.timestamp ?? new Date().toISOString(),
            is_media: Boolean((message?.media?.length ?? 0) > 0 || message?.is_media || message?.isMedia),
            is_ppv: Boolean(message?.is_ppv ?? message?.isPPV ?? Number(message?.price ?? 0) > 0),
            response_time_sec: null,
            is_first_in_thread: null,
          });
        }

        const nextMarker = payload?.data?.nextMarker
          ?? payload?.data?.next_marker
          ?? payload?.nextMarker
          ?? payload?.next_marker
          ?? payload?.marker;

        if (!nextMarker || seenMarkers.has(String(nextMarker)) || messages.length < 100) break;
        seenMarkers.add(String(nextMarker));
        marker = String(nextMarker);
      }
    }

    if (messageRows.length > 0) {
      const { error: messagesError } = await supabaseAdmin
        .from('crm_of_messages')
        .upsert(messageRows, { onConflict: 'message_id' });
      if (messagesError) throw messagesError;
    }

    return { chats: chatRows.length, messages: messageRows.length };
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
    const { data: ofAccount, error: accountError } = await supabaseAdmin
      .from('crm_of_accounts')
      .select('creator_id')
      .eq('account_id', accountId)
      .maybeSingle();

    if (accountError) throw accountError;

    const items: any[] = [];
    let offset = 0;

    for (let page = 0; page < 50; page++) {
      const payload = await fetchOf(`/api/${accountId}/tracking-links`, {
        query: {
          limit: 100,
          offset,
        },
      });
      const pageItems = listFromPayload(payload);
      if (pageItems.length === 0) break;
      items.push(...pageItems);
      if (pageItems.length < 100) break;
      offset += 100;
    }

    if (items.length === 0) return { inserted: 0, snapshots: 0 };

    const nowIso = new Date().toISOString();
    const today = nowIso.slice(0, 10);

    const linkRows: any[] = [];
    const snapshotRows: any[] = [];

    for (const link of items) {
      const linkId = String(link?.id ?? link?.link_id ?? link?.trackingLinkId ?? '').trim();
      if (!linkId) continue;

      let analytics: any = null;
      try {
        analytics = await fetchOf(`/api/${accountId}/tracking-links/${linkId}/analytics`);
      } catch {
        analytics = null;
      }

      const analyticsData = analytics?.data ?? analytics ?? {};
      const clicks = Number(
        analyticsData?.clicks
          ?? analyticsData?.totalClicks
          ?? analyticsData?.visits
          ?? analyticsData?.stats?.clicks
          ?? link?.clicks
          ?? link?.click_count
          ?? 0,
      );
      const subscribers = Number(
        analyticsData?.subscribers
          ?? analyticsData?.totalSubscribers
          ?? analyticsData?.conversions
          ?? analyticsData?.stats?.subscribers
          ?? link?.subscribers
          ?? link?.subscriber_count
          ?? 0,
      );
      const conversionRate = Number(
        analyticsData?.conversion_rate
          ?? analyticsData?.conversionRate
          ?? analyticsData?.stats?.conversionRate
          ?? (clicks > 0 ? subscribers / clicks : 0),
      );

      const url = String(link?.url ?? link?.tracking_url ?? link?.trackingUrl ?? '').trim();
      const rawName = link?.name ?? link?.title ?? link?.slug ?? link?.campaignName ?? url ?? linkId;
      const name = String(rawName).trim();

      linkRows.push({
        account_id: accountId,
        creator_id: ofAccount?.creator_id ?? null,
        link_id: linkId,
        name: name || linkId,
        url: url || linkId,
        clicks: Number.isFinite(clicks) ? clicks : 0,
        subscribers: Number.isFinite(subscribers) ? subscribers : 0,
        conversion_rate: Number.isFinite(conversionRate) ? conversionRate : 0,
        last_synced_at: nowIso,
      });

      snapshotRows.push({
        account_id: accountId,
        link_id: linkId,
        snapshot_date: today,
        clicks: Number.isFinite(clicks) ? clicks : 0,
        subscribers: Number.isFinite(subscribers) ? subscribers : 0,
        conversion_rate: Number.isFinite(conversionRate) ? conversionRate : 0,
        snapshot_at: nowIso,
        analytics_payload: analyticsData,
      });
    }

    if (linkRows.length > 0) {
      const { error } = await supabaseAdmin
        .from('crm_of_tracking_links')
        .upsert(linkRows, { onConflict: 'account_id,link_id' });

      if (error) throw error;
    }

    if (snapshotRows.length > 0) {
      const { error: snapshotError } = await supabaseAdmin
        .from('crm_of_tracking_link_snapshots')
        .upsert(snapshotRows, { onConflict: 'account_id,link_id,snapshot_date' });
      if (snapshotError) throw snapshotError;
    }

    return { inserted: linkRows.length, snapshots: snapshotRows.length };
  });
}

async function reconcileDaily(accountId: string) {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 1);
  const ymd = start.toISOString().slice(0, 10);
  const dayStartIso = `${ymd}T00:00:00.000Z`;
  const dayEnd = new Date(dayStartIso);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const dayEndIso = dayEnd.toISOString();

  const { data: dbRows, error: dbError } = await supabaseAdmin
    .from('crm_of_transactions')
    .select('of_transaction_id,amount,timestamp')
    .eq('account_id', accountId)
    .gte('timestamp', dayStartIso)
    .lt('timestamp', dayEndIso);
  if (dbError) throw dbError;

  const dbCount = (dbRows ?? []).length;
  const dbTotal = (dbRows ?? []).reduce((sum: number, row: any) => sum + Number(row.amount ?? 0), 0);

  const apiItems: any[] = [];
  const seenMarkers = new Set<string>();
  let marker: string | undefined;

  while (true) {
    const payload = await fetchOf(`/api/${accountId}/payouts/transactions`, {
      query: {
        limit: 100,
        marker,
        start_date: ymd,
        end_date: ymd,
      },
    });

    const items = listFromPayload(payload);
    if (items.length === 0) break;
    apiItems.push(...items);

    const nextMarker = payload?.data?.nextMarker
      ?? payload?.data?.next_marker
      ?? payload?.nextMarker
      ?? payload?.next_marker
      ?? payload?.marker;

    if (!nextMarker || seenMarkers.has(String(nextMarker)) || items.length < 100) {
      break;
    }

    seenMarkers.add(String(nextMarker));
    marker = String(nextMarker);
  }

  const apiDayItems = apiItems.filter((item) => {
    const date = parseDate(item?.createdAt ?? item?.created_at ?? item?.timestamp);
    return date === ymd;
  });

  const apiCount = apiDayItems.length;
  const apiTotal = apiDayItems.reduce((sum: number, row: any) => sum + Number(row.amount ?? row.net ?? 0), 0);

  let backfilled = 0;
  const countMismatch = apiCount > 0 && dbCount !== apiCount;
  const totalMismatch = apiTotal > 0 && Math.abs(dbTotal - apiTotal) > 0.01;

  if (countMismatch || totalMismatch) {
    const backfillRows = apiDayItems
      .filter((r: any) => r?.id)
      .map((r: any) => ({
        account_id: accountId,
        of_transaction_id: String(r.id),
        amount: Number(r.amount ?? r.net ?? 0),
        type: normalizeTransactionType(r.type ?? r.category ?? r.description),
        fan_id: r.fan_id ? String(r.fan_id) : (r.user?.id ? String(r.user.id) : null),
        fan_username: r.fan_username ?? r.user?.username ?? null,
        timestamp: r.createdAt ?? r.created_at ?? r.timestamp ?? new Date().toISOString(),
        metadata: r,
      }));

    if (backfillRows.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('crm_of_transactions')
        .upsert(backfillRows, { onConflict: 'of_transaction_id' });
      if (upsertError) throw upsertError;
      backfilled = backfillRows.length;
    }
  }

  return {
    date: ymd,
    dbCount,
    dbTotal,
    apiCount,
    apiTotal,
    discrepancy: countMismatch || totalMismatch,
    backfilled,
  };
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
      if (job === 'reconciliation') results.push({ accountId, ...(await reconcileDaily(accountId)) });
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
