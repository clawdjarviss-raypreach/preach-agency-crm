import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal as _internal } from "../_generated/api";

const internal = _internal as any;

type InternalTxType = "ppv" | "tip" | "subscription" | "new_sub" | "rebill" | "stream";

function toYmd(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function parseFanUsernameFromDescription(description: unknown): string | undefined {
  if (typeof description !== "string" || !description) return undefined;

  // Often looks like: ... <a href="/...">username</a>
  const aText = description.match(/<a[^>]*>([^<]+)<\/a>/i)?.[1]?.trim();
  if (aText) return aText.replace(/^@/, "");

  // Fallback: any @username in text.
  const at = description.match(/@([a-zA-Z0-9_.]+)/)?.[1];
  if (at) return at;

  return undefined;
}

function mapOfapiTransactionType(value: unknown): InternalTxType {
  switch (String(value ?? "").toLowerCase()) {
    case "new_subscription":
      return "new_sub";
    case "recurring_subscription":
      return "rebill";
    case "tip":
      return "tip";
    case "message":
      return "ppv";
    case "post":
      return "ppv";
    case "stream":
      return "stream";
    case "other":
      return "ppv";
    default:
      return "ppv";
  }
}

function earningsDeltaForType(type: InternalTxType, amount: number) {
  const base = {
    totalEarnings: amount,
    netEarnings: amount,
    transactionCount: 1,
    subscriptionEarnings: 0,
    tipEarnings: 0,
    messageEarnings: 0,
    streamEarnings: 0,
    referralEarnings: 0,
    subscriptionCount: 0,
    tipCount: 0,
    messageCount: 0,
  };

  if (type === "new_sub" || type === "rebill" || type === "subscription") {
    return {
      ...base,
      subscriptionEarnings: amount,
      subscriptionCount: 1,
    };
  }

  if (type === "tip") {
    return { ...base, tipEarnings: amount, tipCount: 1 };
  }

  if (type === "stream") {
    return { ...base, streamEarnings: amount };
  }

  // ppv
  return { ...base, messageEarnings: amount, messageCount: 1 };
}

async function incrementDailyEarnings(ctx: any, args: { accountId: string; timestamp: number; type: InternalTxType; amount: number }) {
  const date = toYmd(args.timestamp);
  const existing = await ctx.db
    .query("crm_of_daily_earnings")
    .withIndex("by_account_date", (q: any) => q.eq("accountId", args.accountId).eq("date", date))
    .first();

  const delta = earningsDeltaForType(args.type, args.amount);

  if (!existing) {
    await ctx.db.insert("crm_of_daily_earnings", {
      accountId: args.accountId,
      date,
      totalEarnings: delta.totalEarnings,
      subscriptionEarnings: delta.subscriptionEarnings,
      tipEarnings: delta.tipEarnings,
      messageEarnings: delta.messageEarnings,
      streamEarnings: delta.streamEarnings,
      referralEarnings: 0,
      transactionCount: 1,
      subscriptionCount: delta.subscriptionCount,
      tipCount: delta.tipCount,
      messageCount: delta.messageCount,
      chargebackAmount: 0,
      chargebackCount: 0,
      netEarnings: delta.netEarnings,
      syncedAt: Date.now(),
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    totalEarnings: Number(existing.totalEarnings ?? 0) + delta.totalEarnings,
    subscriptionEarnings: Number(existing.subscriptionEarnings ?? 0) + delta.subscriptionEarnings,
    tipEarnings: Number(existing.tipEarnings ?? 0) + delta.tipEarnings,
    messageEarnings: Number(existing.messageEarnings ?? 0) + delta.messageEarnings,
    streamEarnings: Number(existing.streamEarnings ?? 0) + delta.streamEarnings,
    referralEarnings: Number(existing.referralEarnings ?? 0),
    transactionCount: Number(existing.transactionCount ?? 0) + 1,
    subscriptionCount: Number(existing.subscriptionCount ?? 0) + delta.subscriptionCount,
    tipCount: Number(existing.tipCount ?? 0) + delta.tipCount,
    messageCount: Number(existing.messageCount ?? 0) + delta.messageCount,
    netEarnings: Number(existing.netEarnings ?? 0) + delta.netEarnings,
    syncedAt: Date.now(),
  });
}

async function decrementDailyEarnings(ctx: any, args: { accountId: string; timestamp: number; type: InternalTxType; amount: number }) {
  const date = toYmd(args.timestamp);
  const existing = await ctx.db
    .query("crm_of_daily_earnings")
    .withIndex("by_account_date", (q: any) => q.eq("accountId", args.accountId).eq("date", date))
    .first();

  if (!existing) return;

  const delta = earningsDeltaForType(args.type, args.amount);

  await ctx.db.patch(existing._id, {
    totalEarnings: Number(existing.totalEarnings ?? 0) - delta.totalEarnings,
    subscriptionEarnings: Number(existing.subscriptionEarnings ?? 0) - delta.subscriptionEarnings,
    tipEarnings: Number(existing.tipEarnings ?? 0) - delta.tipEarnings,
    messageEarnings: Number(existing.messageEarnings ?? 0) - delta.messageEarnings,
    streamEarnings: Number(existing.streamEarnings ?? 0) - delta.streamEarnings,
    referralEarnings: Number(existing.referralEarnings ?? 0),
    transactionCount: Math.max(0, Number(existing.transactionCount ?? 0) - 1),
    subscriptionCount: Math.max(0, Number(existing.subscriptionCount ?? 0) - delta.subscriptionCount),
    tipCount: Math.max(0, Number(existing.tipCount ?? 0) - delta.tipCount),
    messageCount: Math.max(0, Number(existing.messageCount ?? 0) - delta.messageCount),
    netEarnings: Number(existing.netEarnings ?? 0) - delta.netEarnings,
    syncedAt: Date.now(),
  });
}

export const handleTransactionWebhook = internalMutation({
  args: {
    event: v.string(),
    accountId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload || {};

    const ofTransactionId = String(payload.id ?? "");
    if (!ofTransactionId) throw new Error("Missing payload.id");

    const existing = await ctx.db
      .query("crm_of_transactions")
      .withIndex("by_of_transaction_id", (q: any) => q.eq("ofTransactionId", ofTransactionId))
      .first();

    if (existing) return { ok: true, deduped: true };

    const timestamp = new Date(payload.created_at ?? payload.createdAt ?? Date.now()).getTime();
    const amount = Number(payload.net_amount ?? payload.netAmount ?? 0);
    const type = mapOfapiTransactionType(payload.type);

    await ctx.db.insert("crm_of_transactions", {
      accountId: args.accountId,
      ofTransactionId,
      amount,
      type,
      fanId: payload.user?.id ? String(payload.user.id) : payload.fan_id ? String(payload.fan_id) : undefined,
      fanUsername:
        payload.user?.username ? String(payload.user.username) : parseFanUsernameFromDescription(payload.description),
      timestamp,
      metadata: payload,
    });

    await incrementDailyEarnings(ctx, { accountId: args.accountId, timestamp, type, amount });

    // Best-effort fan upsert (webhook payloads vary)
    const fanId = payload.user?.id ? String(payload.user.id) : payload.fan_id ? String(payload.fan_id) : undefined;
    if (fanId) {
      await ctx.runMutation(internal.crm.ofSyncJobs.upsertFan, {
        accountId: args.accountId,
        fanId,
        data: {
          accountId: args.accountId,
          fanId,
          username: String(payload.user?.username ?? parseFanUsernameFromDescription(payload.description) ?? `fan_${fanId}`),
          displayName: payload.user?.name,
          isActive: true,
          lastSeen: Date.now(),
        },
      });
    }

    return { ok: true, deduped: false };
  },
});

export const handleSubscriptionWebhook = internalMutation({
  args: {
    event: v.string(),
    accountId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload || {};

    const fanId = payload.user?.id ? String(payload.user.id) : payload.fan_id ? String(payload.fan_id) : undefined;
    if (fanId) {
      await ctx.runMutation(internal.crm.ofSyncJobs.upsertFan, {
        accountId: args.accountId,
        fanId,
        data: {
          accountId: args.accountId,
          fanId,
          username: String(payload.user?.username ?? parseFanUsernameFromDescription(payload.description) ?? `fan_${fanId}`),
          displayName: payload.user?.name,
          isSubscribed: true,
          isActive: true,
          lastSeen: Date.now(),
        },
      });
    }

    return { ok: true };
  },
});

export const handleMessageWebhook = internalMutation({
  args: {
    event: v.string(),
    accountId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload || {};

    const messageId = String(payload.id ?? payload.message_id ?? payload.messageId ?? "");
    const chatId = String(payload.chat_id ?? payload.chatId ?? payload.user?.id ?? payload.from_user?.id ?? "");
    if (!messageId || !chatId) {
      console.warn(`⚠️ Skipping message webhook — missing id (messageId=${messageId}, chatId=${chatId})`);
      return { ok: false, reason: "missing_id" };
    }

    const existing = await ctx.db
      .query("crm_of_messages")
      .withIndex("by_message_id", (q: any) => q.eq("messageId", messageId))
      .first();

    if (!existing) {
      const timestamp = new Date(payload.created_at ?? payload.createdAt ?? payload.timestamp ?? Date.now()).getTime();
      await ctx.db.insert("crm_of_messages", {
        accountId: args.accountId,
        chatId,
        messageId,
        fromUser: true,
        text: typeof payload.text === "string" ? payload.text : undefined,
        timestamp,
        isMedia: Boolean(payload.media?.length || payload.is_media || payload.isMedia),
        isPPV: Boolean(payload.is_ppv || payload.isPPV || Number(payload.price ?? 0) > 0),
        responseTimeSec: undefined,
        isFirstInThread: undefined,
      });
    }

    const fanId = payload.user?.id ? String(payload.user.id) : payload.fan_id ? String(payload.fan_id) : undefined;
    if (fanId) {
      await ctx.runMutation(internal.crm.ofSyncJobs.upsertFan, {
        accountId: args.accountId,
        fanId,
        data: {
          accountId: args.accountId,
          fanId,
          username: String(payload.user?.username ?? parseFanUsernameFromDescription(payload.description) ?? `fan_${fanId}`),
          displayName: payload.user?.name,
          isActive: true,
          lastSeen: Date.now(),
        },
      });
    }

    return { ok: true };
  },
});

export const handlePPVWebhook = internalMutation({
  args: {
    event: v.string(),
    accountId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload || {};

    // Do NOT write financial records here. messages.ppv.unlocked can arrive
    // alongside transactions.new, and this payload may not contain net_amount.
    // Financial tracking is handled exclusively by transactions.new.
    const ofTransactionId = String(payload.id ?? "");

    // Message insert (deduped on message id)
    const messageObj = payload.message ?? payload;
    const messageId = String(messageObj.id ?? payload.message_id ?? payload.messageId ?? ofTransactionId ?? "");
    const chatId = String(messageObj.chat_id ?? payload.chat_id ?? payload.chatId ?? payload.user?.id ?? "");
    if (messageId && chatId) {
      const existingMsg = await ctx.db
        .query("crm_of_messages")
        .withIndex("by_message_id", (q: any) => q.eq("messageId", messageId))
        .first();

      if (!existingMsg) {
        const msgTs = new Date(messageObj.created_at ?? messageObj.createdAt ?? payload.created_at ?? Date.now()).getTime();
        await ctx.db.insert("crm_of_messages", {
          accountId: args.accountId,
          chatId,
          messageId,
          fromUser: true,
          text: typeof messageObj.text === "string" ? messageObj.text : undefined,
          timestamp: msgTs,
          isMedia: Boolean(messageObj.media?.length || messageObj.is_media || messageObj.isMedia),
          isPPV: true,
          responseTimeSec: undefined,
          isFirstInThread: undefined,
        });
      }
    }

    const fanId = payload.user?.id ? String(payload.user.id) : payload.fan_id ? String(payload.fan_id) : undefined;
    if (fanId) {
      await ctx.runMutation(internal.crm.ofSyncJobs.upsertFan, {
        accountId: args.accountId,
        fanId,
        data: {
          accountId: args.accountId,
          fanId,
          username: String(payload.user?.username ?? parseFanUsernameFromDescription(payload.description) ?? `fan_${fanId}`),
          displayName: payload.user?.name,
          isActive: true,
          lastSeen: Date.now(),
        },
      });
    }

    return { ok: true };
  },
});

export const cleanupZeroSubscriptionTransactions = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("crm_of_transactions").paginate({
      cursor: args.cursor ?? null,
      numItems: args.numItems ?? 100,
    });

    let deleted = 0;
    for (const row of page.page) {
      if (Number(row.amount) === 0 && (row.type === "new_sub" || row.type === "rebill")) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return {
      ok: true,
      deleted,
      scanned: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const cleanupZeroPpvTransactions = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("crm_of_transactions").paginate({
      cursor: args.cursor ?? null,
      numItems: args.numItems ?? 100,
    });

    let deleted = 0;
    for (const row of page.page) {
      if (Number(row.amount) === 0 && row.type === "ppv") {
        await decrementDailyEarnings(ctx, {
          accountId: row.accountId,
          timestamp: Number(row.timestamp ?? Date.now()),
          type: "ppv",
          amount: 0,
        });
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }

    return {
      ok: true,
      deleted,
      scanned: page.page.length,
      continueCursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

export const handleOfapiWebhook = internalMutation({
  args: {
    event: v.string(),
    accountId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    switch (args.event) {
      case "transactions.new":
        return await ctx.runMutation(internal.crm.ofWebhookHandler.handleTransactionWebhook, args);
      case "subscriptions.new":
      case "subscriptions.renewed":
        return await ctx.runMutation(internal.crm.ofWebhookHandler.handleSubscriptionWebhook, args);
      case "messages.received":
        return await ctx.runMutation(internal.crm.ofWebhookHandler.handleMessageWebhook, args);
      case "messages.ppv.unlocked":
        return await ctx.runMutation(internal.crm.ofWebhookHandler.handlePPVWebhook, args);
      case "messages.sent":
        // Outbound messages — log but don't store for now
        console.log(`ℹ️ messages.sent event from ${args.accountId} — skipped (outbound)`);
        return { ok: true, skipped: true };
      default:
        console.warn(`⚠️ Unhandled OF API webhook event: ${args.event}`);
        return { ok: false, reason: `unsupported_event: ${args.event}` };
    }
  },
});
