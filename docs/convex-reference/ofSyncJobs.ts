import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal as _internal } from "../_generated/api";
import {
  getChargebacks,
  getChatMessages,
  getChats,
  getEarningsSummary,
  getFans,
  getRevenueForecast,
  getTrackingLinkAnalytics,
  getTrackingLinks,
  getTransactionsByType,
  getTransactionsList,
  getTransactionsSummary,
} from "./ofApiClient";

const internal = _internal as any;

function toDateString(ts = Date.now()) {
  return new Date(ts).toISOString().split("T")[0];
}

function segmentForSpend(totalSpend: number) {
  if (totalSpend >= 500) return "whale";
  if (totalSpend >= 100) return "vip";
  if (totalSpend >= 20) return "core";
  if (totalSpend >= 1) return "casual";
  return "new";
}

function asList<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data?.list)) return payload.data.list as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  if (Array.isArray(payload?.items)) return payload.items as T[];
  if (Array.isArray(payload?.fans)) return payload.fans as T[];
  if (Array.isArray(payload?.transactions)) return payload.transactions as T[];
  return [];
}

function normalizeTransactionType(value: unknown): "ppv" | "tip" | "new_sub" | "rebill" | "stream" {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("recurring subscription")) return "rebill";
  if (raw.includes("subscription") || raw.includes("sub")) return "new_sub";
  if (raw.includes("tip")) return "tip";
  if (raw.includes("stream")) return "stream";
  // "Payment for message" = PPV
  return "ppv";
}


type ChargebackItem = {
  createdAt?: string;
  payment?: {
    createdAt?: string;
    net?: number | string;
    amount?: number | string;
    fee?: number | string;
    status?: string;
  };
};

function chargebackDateOf(item: ChargebackItem): string {
  const source = item?.payment?.createdAt || item?.createdAt;
  if (!source) return toDateString();
  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) return toDateString();
  return dt.toISOString().slice(0, 10);
}

function chargebackNetOf(item: ChargebackItem): number {
  const raw = Number(item?.payment?.net ?? item?.payment?.amount ?? 0);
  return Math.abs(Number.isFinite(raw) ? raw : 0);
}

async function getChargebackTotalsByDate(
  apiKey: string,
  accountId: string,
  startDate: string,
  endDate: string
): Promise<Record<string, { amount: number; count: number }>> {
  const chargebacks = (await getChargebacks(apiKey, accountId, {
    start_date: startDate,
    end_date: endDate,
    limit: 100,
  })) as ChargebackItem[];

  const out: Record<string, { amount: number; count: number }> = {};
  for (const cb of chargebacks) {
    const date = chargebackDateOf(cb);
    if (!out[date]) out[date] = { amount: 0, count: 0 };
    out[date].amount += chargebackNetOf(cb);
    out[date].count += 1;
  }
  return out;
}

export const getApiKey = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db.query("crm_of_api_config").withIndex("by_updated_at").order("desc").first();
    return config?.apiKey ?? process.env.OFAPI_KEY ?? null;
  },
});

export const getActiveAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("crm_of_accounts").withIndex("by_status", (q) => q.eq("status", "active")).collect();
  },
});

export const getAccountCreatorId = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("crm_of_accounts")
      .withIndex("by_account_id", (q) => q.eq("accountId", args.accountId))
      .first();
    return account?.creatorId ?? null;
  },
});

export const getDbTransactionStatsForDate = internalQuery({
  args: { accountId: v.string(), date: v.string() },
  handler: async (ctx, args) => {
    const startTs = new Date(`${args.date}T00:00:00.000Z`).getTime();
    const endTs = startTs + 24 * 60 * 60 * 1000;

    const rows = await ctx.db
      .query("crm_of_transactions")
      .withIndex("by_account_timestamp", (q: any) =>
        q.eq("accountId", args.accountId).gte("timestamp", startTs).lt("timestamp", endTs)
      )
      .take(5000);

    const total = rows.reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0);
    return { count: rows.length, total };
  },
});

export const upsertSyncState = internalMutation({
  args: {
    accountId: v.string(),
    endpoint: v.union(v.literal("earnings"), v.literal("messages"), v.literal("chats"), v.literal("fans"), v.literal("transactions"), v.literal("forecast"), v.literal("chargebacks"), v.literal("tracking_links")),
    status: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    cursor: v.optional(v.string()),
    error: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crm_of_sync_state")
      .withIndex("by_account_endpoint", (q) => q.eq("accountId", args.accountId).eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args);
      return existing._id;
    }
    return await ctx.db.insert("crm_of_sync_state", args);
  },
});

export const upsertDailyEarnings = internalMutation({
  args: { accountId: v.string(), date: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("crm_of_daily_earnings")
      .withIndex("by_account_date", (q) => q.eq("accountId", args.accountId).eq("date", args.date))
      .first();
    if (row) {
      await ctx.db.patch(row._id, args.data);
      return row._id;
    }
    return await ctx.db.insert("crm_of_daily_earnings", args.data);
  },
});


export const upsertDailyChargebacks = internalMutation({
  args: {
    accountId: v.string(),
    date: v.string(),
    chargebackAmount: v.number(),
    chargebackCount: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("crm_of_daily_earnings")
      .withIndex("by_account_date", (q) => q.eq("accountId", args.accountId).eq("date", args.date))
      .first();

    if (row) {
      await ctx.db.patch(row._id, {
        chargebackAmount: args.chargebackAmount,
        chargebackCount: args.chargebackCount,
        netEarnings: Number(row.totalEarnings ?? 0) - args.chargebackAmount,
        syncedAt: Date.now(),
      });
      return row._id;
    }

    return await ctx.db.insert("crm_of_daily_earnings", {
      accountId: args.accountId,
      date: args.date,
      totalEarnings: 0,
      subscriptionEarnings: 0,
      tipEarnings: 0,
      messageEarnings: 0,
      streamEarnings: 0,
      referralEarnings: 0,
      transactionCount: 0,
      subscriptionCount: 0,
      tipCount: 0,
      messageCount: 0,
      chargebackAmount: args.chargebackAmount,
      chargebackCount: args.chargebackCount,
      netEarnings: 0 - args.chargebackAmount,
      syncedAt: Date.now(),
    });
  },
});

export const upsertFan = internalMutation({
  args: { accountId: v.string(), fanId: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crm_of_fans")
      .withIndex("by_fan_id", (q) => q.eq("fanId", args.fanId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args.data);
      return existing._id;
    }
    return await ctx.db.insert("crm_of_fans", args.data);
  },
});

export const upsertChatStats = internalMutation({
  args: { accountId: v.string(), chatId: v.string(), data: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crm_of_chat_stats")
      .withIndex("by_account_chat", (q) => q.eq("accountId", args.accountId).eq("chatId", args.chatId))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, args.data);
      return existing._id;
    }
    return await ctx.db.insert("crm_of_chat_stats", args.data);
  },
});

export const putForecast = internalMutation({
  args: { accountId: v.string(), data: v.any(), generatedAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crm_of_forecast_cache")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();
    const doc = {
      accountId: args.accountId,
      forecastData: args.data,
      generatedAt: args.generatedAt,
      syncedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return existing._id;
    }
    return await ctx.db.insert("crm_of_forecast_cache", doc);
  },
});

function extractNextPageOffset(payload: any): number | undefined {
  const nextPage = payload?._meta?._pagination?.next_page;
  if (!nextPage || typeof nextPage !== "string") return undefined;
  try {
    const url = new URL(nextPage);
    const offset = Number(url.searchParams.get("offset"));
    return Number.isFinite(offset) ? offset : undefined;
  } catch {
    return undefined;
  }
}

function toTrackingStats(data: any): { clicks: number; subscribers: number; conversionRate: number } {
  const clicks = Number(
    data?.clicks ?? data?.totalClicks ?? data?.visits ?? data?.total_visits ?? data?.stats?.clicks ?? 0
  );
  const subscribers = Number(
    data?.subscribers ?? data?.conversions ?? data?.totalSubscribers ?? data?.total_subscribers ?? data?.stats?.subscribers ?? 0
  );
  const conversionRate = Number(
    data?.conversionRate ?? data?.conversion_rate ?? data?.subscriberConversionRate ?? data?.stats?.conversionRate ?? 0
  );

  return {
    clicks: Number.isFinite(clicks) ? clicks : 0,
    subscribers: Number.isFinite(subscribers) ? subscribers : 0,
    conversionRate: Number.isFinite(conversionRate) ? conversionRate : 0,
  };
}

export const upsertTrackingLink = internalMutation({
  args: {
    accountId: v.string(),
    linkId: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crm_of_tracking_links")
      .withIndex("by_account_link", (q) => q.eq("accountId", args.accountId).eq("linkId", args.linkId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args.data);
      return existing._id;
    }

    return await ctx.db.insert("crm_of_tracking_links", args.data);
  },
});

export const insertTrackingLinkSnapshot = internalMutation({
  args: {
    trackingLinkId: v.id("crm_of_tracking_links"),
    accountId: v.string(),
    clicks: v.number(),
    subscribers: v.number(),
    conversionRate: v.number(),
    snapshotAt: v.number(),
  },
  handler: async (ctx, args) => {
    const dedupWindowMs = 2 * 60 * 60 * 1000;
    const recentCutoff = args.snapshotAt - dedupWindowMs;

    const existingRecent = await ctx.db
      .query("crm_tracking_link_snapshots")
      .withIndex("by_link_time", (q) => q.eq("trackingLinkId", args.trackingLinkId).gte("snapshotAt", recentCutoff))
      .first();

    if (existingRecent) {
      return existingRecent._id;
    }

    return await ctx.db.insert("crm_tracking_link_snapshots", args);
  },
});

async function withUsage(ctx: any, accountId: string, fn: () => Promise<any>) {
  return fn();
}

export const syncEarnings = internalAction({
  args: { accountId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    const allAccounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});
    const accounts = args.accountId ? allAccounts.filter((a: any) => a.accountId === args.accountId) : allAccounts;
    const date = toDateString();

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "earnings", status: "syncing", lastSyncAt: Date.now() });
        const earnings = await withUsage(ctx, account.accountId, () => getEarningsSummary(apiKey, { account_id: account.accountId, start_date: date, end_date: date }));
        const byType = await withUsage(ctx, account.accountId, () => getTransactionsByType(apiKey, { account_id: account.accountId, start_date: date, end_date: date }));
        const txSummary = await withUsage(ctx, account.accountId, () => getTransactionsSummary(apiKey, { account_id: account.accountId, start_date: date, end_date: date }));
        const chargebackTotalsByDate = await withUsage(ctx, account.accountId, () => getChargebackTotalsByDate(apiKey, account.accountId, date, date));

        // API returns {data: {...}, _meta: {...}} - extract the data payload
        const ed = earnings?.data ?? earnings ?? {};
        const bd = byType?.data ?? byType ?? {};
        const sd = txSummary?.data ?? txSummary ?? {};
        const chargebackForDate = chargebackTotalsByDate[date] ?? { amount: 0, count: 0 };
        const totalEarnings = Number(ed?.total_earnings ?? ed?.total ?? 0);
        // Use transaction summary net (after 20% fee) minus chargebacks for accurate net
        const txNet = Number(sd?.total_net ?? 0);
        const netEarnings = txNet > 0 ? txNet - chargebackForDate.amount : totalEarnings - chargebackForDate.amount;

        const row = {
          accountId: account.accountId,
          date,
          totalEarnings,
          subscriptionEarnings: Number(ed?.subscription_earnings ?? ed?.subscriptions ?? 0),
          tipEarnings: Number(ed?.tip_earnings ?? ed?.tips ?? ed?.tips_messages ?? 0) + Number(ed?.tips_posts ?? 0),
          messageEarnings: Number(ed?.message_earnings ?? ed?.messages ?? 0),
          streamEarnings: Number(ed?.stream_earnings ?? ed?.streams ?? 0),
          referralEarnings: Number(ed?.referral_earnings ?? ed?.referrals ?? 0),
          transactionCount: Number(sd?.succeeded_count ?? bd?.transaction_count ?? bd?.total_count ?? 0),
          subscriptionCount: Number(bd?.subscription_count ?? 0),
          tipCount: Number(bd?.tip_count ?? 0),
          messageCount: Number(bd?.message_count ?? bd?.ppv_count ?? 0),
          chargebackAmount: chargebackForDate.amount,
          chargebackCount: chargebackForDate.count,
          netEarnings,
          syncedAt: Date.now(),
        };

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertDailyEarnings, { accountId: account.accountId, date, data: row });
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "earnings", status: "idle", lastSyncAt: Date.now() });
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "earnings", status: "error", error: e.message, lastSyncAt: Date.now() });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncChargebacks = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    const accounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});
    const date = toDateString();

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "chargebacks", status: "syncing", lastSyncAt: Date.now() });
        const totalsByDate = await getChargebackTotalsByDate(apiKey, account.accountId, date, date);
        const day = totalsByDate[date] ?? { amount: 0, count: 0 };

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertDailyChargebacks, {
          accountId: account.accountId,
          date,
          chargebackAmount: day.amount,
          chargebackCount: day.count,
        });

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "chargebacks", status: "idle", lastSyncAt: Date.now() });
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "chargebacks", status: "error", error: e.message, lastSyncAt: Date.now() });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncTransactions = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    const accounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "transactions", status: "syncing", lastSyncAt: Date.now() });

        let marker: string | number | undefined = undefined;
        let page = 0;
        let hasMore = true;

        while (hasMore && page < 10) {
          const res = await getTransactionsList(apiKey, account.accountId, {
            limit: 100,
            marker,
            startDate: "-3days",
          });
          const txns = asList<any>(res);

          for (const t of txns) {
            await ctx.runMutation(internal.crm.ofIntegration.upsertWebhookTransaction, {
              accountId: account.accountId,
              ofTransactionId: String(t.id ?? t.transaction_id ?? `${account.accountId}:${t.createdAt ?? t.timestamp}:${t.amount}`),
              amount: Number(t.amount ?? t.net ?? 0),
              type: normalizeTransactionType(t.description ?? t.type),
              fanId: t.user?.id ? String(t.user.id) : t.fan_id ? String(t.fan_id) : undefined,
              fanUsername: t.user?.username ? String(t.user.username) : t.fan_username ? String(t.fan_username) : undefined,
              timestamp: Number((t.createdAt || t.timestamp) ? new Date(t.createdAt || t.timestamp).getTime() : Date.now()),
              metadata: t,
            });
          }

          const nextMarker = res?.data?.nextMarker ?? res?.data?.marker ?? res?.nextMarker;
          hasMore = Boolean((res?.data?.hasMore || res?.hasMore) && nextMarker);
          marker = nextMarker;
          page += 1;
        }

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "transactions", status: "idle", lastSyncAt: Date.now() });
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "transactions", status: "error", error: e.message, lastSyncAt: Date.now() });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncFans = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    const accounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "fans", status: "syncing", lastSyncAt: Date.now() });
        const res = await getFans(apiKey, account.accountId, { limit: 20, offset: 0 });
        const fans = asList<any>(res);
        for (const fan of fans) {
          const totalSpend = Number(fan.totalSpend ?? fan.total_spend ?? fan.spending?.total ?? 0);
          await ctx.runMutation(internal.crm.ofSyncJobs.upsertFan, {
            accountId: account.accountId,
            fanId: String(fan.id ?? fan.fan_id ?? fan.user?.id),
            data: {
              accountId: account.accountId,
              fanId: String(fan.id ?? fan.fan_id ?? fan.user?.id),
              username: String(fan.username ?? fan.user?.username ?? "unknown"),
              displayName: fan.display_name ?? fan.displayName ?? fan.user?.name,
              totalSpend,
              subscribedAt: fan.subscribed_at ? new Date(fan.subscribed_at).getTime() : undefined,
              expiredAt: fan.expired_at ? new Date(fan.expired_at).getTime() : undefined,
              renewsAt: fan.renews_at ? new Date(fan.renews_at).getTime() : undefined,
              subscriptionPrice: fan.subscription_price ? Number(fan.subscription_price) : undefined,
              isSubscribed: fan.is_subscribed ?? fan.isSubscribed,
              isActive: Boolean(fan.is_active ?? fan.isActive ?? true),
              lastSeen: fan.last_seen ? new Date(fan.last_seen).getTime() : undefined,
            },
          });
        }

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "fans", status: "idle", lastSyncAt: Date.now() });
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "fans", status: "error", error: e.message, lastSyncAt: Date.now() });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncChats = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    const accounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "chats", status: "syncing", lastSyncAt: Date.now() });
        const res = await getChats(apiKey, account.accountId, { limit: 100, offset: 0, order: "recent", skip_users: "none" });
        const chats = asList<any>(res);

        for (const chat of chats) {
          const chatId = String(chat.id ?? chat.withUser?.id ?? "");
          if (!chatId) continue;

          const messageRes = await getChatMessages(apiKey, account.accountId, chatId, {
            limit: 20,
            order: "desc",
            skip_users: "all",
          });
          const messages: any[] = asList<any>(messageRes);
          let fromFan = 0;
          let fromCreator = 0;
          const responseTimes: number[] = [];
          let lastFanTs: number | null = null;
          let lastCreatorReplyAt: number | undefined;
          let lastMessageAt: number | undefined;

          for (const [idx, message] of messages.entries()) {
            const ts = Number((message.createdAt || message.timestamp) ? new Date(message.createdAt || message.timestamp).getTime() : Date.now());
            const fromUserId = message.fromUser?.id ?? message.from_user?.id;
            const withUserId = chat.withUser?.id ?? chat.user?.id;
            const isFromFan = withUserId ? String(fromUserId) === String(withUserId) : Boolean(message.from_user ?? message.fromUser ?? true);
            const isFirstInThread = idx === messages.length - 1;
            if (isFromFan) {
              fromFan += 1;
              lastFanTs = ts;
            } else {
              fromCreator += 1;
              lastCreatorReplyAt = ts;
              if (lastFanTs) {
                responseTimes.push(Math.max(0, Math.floor((ts - lastFanTs) / 1000)));
                lastFanTs = null;
              }
            }
            lastMessageAt = Math.max(lastMessageAt || 0, ts);

            await ctx.runMutation(internal.crm.ofIntegration.upsertWebhookMessage, {
              accountId: account.accountId,
              chatId,
              messageId: String(message.id ?? `${chatId}:${ts}`),
              fromUser: isFromFan,
              text: typeof message.text === "string" ? message.text : undefined,
              timestamp: ts,
              isMedia: Boolean((message.media?.length ?? 0) > 0 || message.is_media || message.isMedia),
              isPPV: Boolean(message.is_ppv ?? message.isPPV ?? message.price > 0),
              responseTimeSec: undefined,
              isFirstInThread,
            });
          }

          const avgResponse = responseTimes.length
            ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
            : undefined;

          await ctx.runMutation(internal.crm.ofSyncJobs.upsertChatStats, {
            accountId: account.accountId,
            chatId,
            data: {
              accountId: account.accountId,
              chatId,
              fanUsername: String(chat.withUser?.username ?? chat.fan?.username ?? chat.username ?? "unknown"),
              fanDisplayName: chat.withUser?.name ?? chat.fan?.display_name ?? chat.display_name,
              lastMessageAt,
              lastCreatorReplyAt,
              avgResponseTimeSec: avgResponse,
              totalMessages: messages.length,
              totalFromFan: fromFan,
              totalFromCreator: fromCreator,
              hasUnread: Boolean(chat.hasUnreadTips ?? chat.has_unread ?? chat.unread ?? false),
              syncedAt: Date.now(),
            },
          });
        }

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "chats", status: "idle", lastSyncAt: Date.now() });
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "chats", status: "error", error: e.message, lastSyncAt: Date.now() });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

// ─── BACKFILL: Sync transactions for one account (paginated) ───
export const backfillTransactions = internalAction({
  args: {
    accountId: v.string(),
    startDate: v.optional(v.string()),
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { error: "No API key" };

    const maxPages = args.maxPages ?? 50;
    const startDate = args.startDate ?? "-90days";
    let marker: string | number | undefined = undefined;
    let page = 0;
    let hasMore = true;
    let total = 0;

    while (hasMore && page < maxPages) {
      const res = await getTransactionsList(apiKey, args.accountId, {
        limit: 100,
        marker,
        startDate,
      });
      const txns = asList<any>(res);

      for (const t of txns) {
        await ctx.runMutation(internal.crm.ofIntegration.upsertWebhookTransaction, {
          accountId: args.accountId,
          ofTransactionId: String(t.id ?? t.transaction_id ?? `${args.accountId}:${t.createdAt ?? t.timestamp}:${t.amount}`),
          amount: Number(t.amount ?? t.net ?? 0),
          type: normalizeTransactionType(t.description ?? t.type),
          fanId: t.user?.id ? String(t.user.id) : t.fan_id ? String(t.fan_id) : undefined,
          fanUsername: t.user?.username ? String(t.user.username) : t.fan_username ? String(t.fan_username) : undefined,
          timestamp: Number((t.createdAt || t.timestamp) ? new Date(t.createdAt || t.timestamp).getTime() : Date.now()),
          metadata: t,
        });
        total++;
      }

      const nextMarker = res?.data?.nextMarker ?? res?.data?.marker ?? res?.nextMarker;
      hasMore = Boolean((res?.data?.hasMore || res?.hasMore) && nextMarker);
      marker = nextMarker;
      page += 1;
    }

    return { accountId: args.accountId, pages: page, transactions: total, hasMore };
  },
});

// ─── BACKFILL: Sync earnings for a date range (one account at a time) ───
export const backfillEarnings = internalAction({
  args: {
    accountId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { error: "No API key" };

    // Generate list of dates
    const dates: string[] = [];
    const start = new Date(args.startDate);
    const end = new Date(args.endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    // Fetch chargebacks for the whole range once
    let cbByDate: Record<string, { amount: number; count: number }> = {};
    try {
      cbByDate = await getChargebackTotalsByDate(apiKey, args.accountId, args.startDate, args.endDate);
    } catch (_e) { /* continue with zeros */ }

    let synced = 0;
    let errors = 0;
    for (const date of dates) {
      try {
        const earnings = await getEarningsSummary(apiKey, { account_id: args.accountId, start_date: date, end_date: date });
        const byType = await getTransactionsByType(apiKey, { account_id: args.accountId, start_date: date, end_date: date });
        const txSummary = await getTransactionsSummary(apiKey, { account_id: args.accountId, start_date: date, end_date: date });

        const ed = (earnings as any)?.data ?? earnings ?? {};
        const bd = (byType as any)?.data ?? byType ?? {};
        const sd = (txSummary as any)?.data ?? txSummary ?? {};
        const cb = cbByDate[date] ?? { amount: 0, count: 0 };

        const totalEarnings = Number((ed as any)?.total_earnings ?? (ed as any)?.total ?? 0);
        const txNet = Number((sd as any)?.total_net ?? 0);
        const netEarnings = txNet > 0 ? txNet - cb.amount : totalEarnings - cb.amount;

        const row = {
          accountId: args.accountId,
          date,
          totalEarnings,
          subscriptionEarnings: Number((ed as any)?.subscription_earnings ?? (ed as any)?.subscriptions ?? 0),
          tipEarnings: Number((ed as any)?.tip_earnings ?? (ed as any)?.tips ?? (ed as any)?.tips_messages ?? 0) + Number((ed as any)?.tips_posts ?? 0),
          messageEarnings: Number((ed as any)?.message_earnings ?? (ed as any)?.messages ?? 0),
          streamEarnings: Number((ed as any)?.stream_earnings ?? (ed as any)?.streams ?? 0),
          referralEarnings: Number((ed as any)?.referral_earnings ?? (ed as any)?.referrals ?? 0),
          transactionCount: Number((sd as any)?.succeeded_count ?? (bd as any)?.transaction_count ?? (bd as any)?.total_count ?? 0),
          subscriptionCount: Number((bd as any)?.subscription_count ?? 0),
          tipCount: Number((bd as any)?.tip_count ?? 0),
          messageCount: Number((bd as any)?.message_count ?? (bd as any)?.ppv_count ?? 0),
          chargebackAmount: cb.amount,
          chargebackCount: cb.count,
          netEarnings,
          syncedAt: Date.now(),
        };

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertDailyEarnings, { accountId: args.accountId, date, data: row });
        synced++;
      } catch (e: any) {
        errors++;
      }
    }

    return { accountId: args.accountId, synced, errors, totalDays: dates.length };
  },
});

export const syncTrackingLinks = internalAction({
  args: { accountId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };

    const allAccounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});
    const accounts = args.accountId ? allAccounts.filter((a: any) => a.accountId === args.accountId) : allAccounts;

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, {
          accountId: account.accountId,
          endpoint: "tracking_links",
          status: "syncing",
          lastSyncAt: Date.now(),
        });

        const creatorId = await ctx.runQuery(internal.crm.ofSyncJobs.getAccountCreatorId, {
          accountId: account.accountId,
        });

        let offset = 0;
        let hasMore = true;
        let pages = 0;
        let syncedLinks = 0;

        while (hasMore && pages < 50) {
          const linksRes = await withUsage(ctx, account.accountId, () =>
            getTrackingLinks(apiKey, account.accountId, { limit: 20, offset })
          );
          const links = asList<any>(linksRes);

          for (const rawLink of links) {
            const linkId = String(rawLink?.id ?? rawLink?.linkId ?? rawLink?.tracking_link_id ?? "");
            if (!linkId) continue;

            // Stats from the link object itself (clicksCount, subscribersCount)
            const linkStats = {
              clicks: Number(rawLink?.clicksCount ?? rawLink?.clicks ?? 0),
              subscribers: Number(rawLink?.subscribersCount ?? rawLink?.subscribers ?? 0),
              conversionRate: 0,
            };
            if (linkStats.clicks > 0 && linkStats.subscribers > 0) {
              linkStats.conversionRate = linkStats.subscribers / linkStats.clicks;
            }
            const stats = linkStats;

            const trackingLinkId = await ctx.runMutation(internal.crm.ofSyncJobs.upsertTrackingLink, {
              accountId: account.accountId,
              linkId,
              data: {
                accountId: account.accountId,
                creatorId: creatorId ?? undefined,
                linkId,
                name: String(rawLink?.campaignName ?? rawLink?.name ?? rawLink?.title ?? "Unnamed link"),
                url: String(rawLink?.campaignUrl ?? rawLink?.url ?? rawLink?.trackingUrl ?? ""),
                clicks: stats.clicks,
                subscribers: stats.subscribers,
                conversionRate: stats.conversionRate,
                lastSyncedAt: Date.now(),
              },
            });

            await ctx.runMutation(internal.crm.ofSyncJobs.insertTrackingLinkSnapshot, {
              trackingLinkId,
              accountId: account.accountId,
              clicks: stats.clicks,
              subscribers: stats.subscribers,
              conversionRate: stats.conversionRate,
              snapshotAt: Date.now(),
            });

            syncedLinks += 1;
          }

          const nextOffset = extractNextPageOffset(linksRes);
          hasMore = typeof nextOffset === "number" && nextOffset !== offset;
          offset = nextOffset ?? offset;
          pages += 1;
        }

        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, {
          accountId: account.accountId,
          endpoint: "tracking_links",
          status: "idle",
          lastSyncAt: Date.now(),
        });

        console.log(`[OF] Synced tracking links for ${account.accountId}: ${syncedLinks}`);
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, {
          accountId: account.accountId,
          endpoint: "tracking_links",
          status: "error",
          error: e.message,
          lastSyncAt: Date.now(),
        });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncForecast = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    const accounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});

    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "forecast", status: "syncing", lastSyncAt: Date.now() });
        const forecast = await getRevenueForecast(apiKey, { account_id: account.accountId, metric: "revenue", model: "linear_regression", historical_days: 30, forecast_days: 90 });
        await ctx.runMutation(internal.crm.ofSyncJobs.putForecast, {
          accountId: account.accountId,
          data: forecast,
          generatedAt: Date.now(),
        });
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "forecast", status: "idle", lastSyncAt: Date.now() });
      } catch (e: any) {
        await ctx.runMutation(internal.crm.ofSyncJobs.upsertSyncState, { accountId: account.accountId, endpoint: "forecast", status: "error", error: e.message, lastSyncAt: Date.now() });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const reconcileDaily = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSyncJobs.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };

    const accounts = await ctx.runQuery(internal.crm.ofSyncJobs.getActiveAccounts, {});

    const yesterday = toDateString(Date.now() - 24 * 60 * 60 * 1000);

    let scanned = 0;
    let discrepancies = 0;
    let backfilled = 0;

    for (const account of accounts) {
      try {
        const summary = await withUsage(ctx, account.accountId, () =>
          getTransactionsSummary(apiKey, {
            account_id: account.accountId,
            start_date: yesterday,
            end_date: yesterday,
          })
        );

        const sd = summary?.data ?? summary ?? {};
        const apiCount = Number(sd?.succeeded_count ?? sd?.count ?? 0);
        const apiTotal = Number(sd?.total_net ?? sd?.total ?? 0);

        const dbStats = await ctx.runQuery(internal.crm.ofSyncJobs.getDbTransactionStatsForDate, {
          accountId: account.accountId,
          date: yesterday,
        });

        const dbCount = dbStats.count;
        const dbTotal = dbStats.total;

        scanned += 1;

        const countMismatch = apiCount > 0 && dbCount !== apiCount;
        const totalMismatch = apiTotal > 0 && Math.abs(dbTotal - apiTotal) > 0.01;

        if (countMismatch || totalMismatch) {
          discrepancies += 1;
          console.warn(
            `⚠️ [OF RECONCILE] ${account.accountId} ${yesterday}: api(count=${apiCount}, total=${apiTotal}) vs db(count=${dbCount}, total=${dbTotal})`
          );

          // Backfill best-effort: refetch yesterday list and insert any missing.
          const res = await withUsage(ctx, account.accountId, () =>
            getTransactionsList(apiKey, account.accountId, {
              limit: 100,
              startDate: yesterday,
            })
          );

          const txns = asList<any>(res);
          for (const t of txns) {
            const id = String(t.id ?? t.transaction_id ?? "");
            if (!id) continue;

            await ctx.runMutation(internal.crm.ofIntegration.upsertWebhookTransaction, {
              accountId: account.accountId,
              ofTransactionId: id,
              amount: Number(t.net ?? t.amount ?? 0),
              type: normalizeTransactionType(t.description ?? t.type),
              fanId: t.user?.id ? String(t.user.id) : t.fan_id ? String(t.fan_id) : undefined,
              fanUsername: t.user?.username ? String(t.user.username) : t.fan_username ? String(t.fan_username) : undefined,
              timestamp: Number((t.createdAt || t.timestamp) ? new Date(t.createdAt || t.timestamp).getTime() : Date.now()),
              metadata: t,
            });

            backfilled += 1;
          }
        }
      } catch (e: any) {
        console.warn(`⚠️ [OF RECONCILE] Failed for ${account.accountId}:`, e?.message ?? e);
      }
    }

    return { skipped: false, date: yesterday, scanned, discrepancies, backfilled };
  },
});
