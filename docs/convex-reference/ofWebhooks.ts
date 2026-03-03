import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

function normalizeTransactionType(value: unknown): "ppv" | "tip" | "subscription" | "stream" {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("tip")) return "tip";
  if (raw.includes("sub") || raw === "subscribe") return "subscription";
  if (raw.includes("stream")) return "stream";
  return "ppv";
}

async function upsertTransaction(ctx: any, payload: any, accountId: string, fallbackType: "ppv" | "tip" | "subscription") {
  const ofTransactionId = String(
    payload?.transactionId ?? payload?.id ?? payload?.tipId ?? payload?.subscriptionId ?? payload?.ppvId ?? `${accountId}:${Date.now()}`
  );

  const doc = {
    accountId,
    ofTransactionId,
    amount: Number(payload?.amount ?? payload?.price ?? payload?.value ?? 0),
    type: normalizeTransactionType(payload?.type ?? fallbackType),
    fanId: payload?.fanId ? String(payload.fanId) : payload?.user?.id ? String(payload.user.id) : undefined,
    fanUsername:
      payload?.fanUsername ? String(payload.fanUsername) : payload?.user?.username ? String(payload.user.username) : undefined,
    timestamp: Number(payload?.timestamp ? new Date(payload.timestamp).getTime() : Date.now()),
    metadata: payload,
  };

  const existing = await ctx.db
    .query("crm_of_transactions")
    .withIndex("by_of_transaction_id", (q: any) => q.eq("ofTransactionId", doc.ofTransactionId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("crm_of_transactions", doc);
}

async function upsertFan(ctx: any, payload: any, accountId: string) {
  const fanId = String(payload?.fanId ?? payload?.user?.id ?? payload?.fromUserId ?? "");
  if (!fanId) return null;

  const existing = await ctx.db.query("crm_of_fans").withIndex("by_fan_id", (q: any) => q.eq("fanId", fanId)).first();
  const doc = {
    accountId,
    fanId,
    username: String(payload?.fanUsername ?? payload?.user?.username ?? `fan_${fanId}`),
    displayName: payload?.displayName ?? payload?.user?.name,
    totalSpend: payload?.totalSpend ? Number(payload.totalSpend) : existing?.totalSpend,
    subscribedAt: payload?.subscribedAt ? new Date(payload.subscribedAt).getTime() : existing?.subscribedAt,
    expiredAt: payload?.expiredAt ? new Date(payload.expiredAt).getTime() : existing?.expiredAt,
    renewsAt: payload?.renewsAt ? new Date(payload.renewsAt).getTime() : existing?.renewsAt,
    subscriptionPrice: payload?.subscriptionPrice ? Number(payload.subscriptionPrice) : existing?.subscriptionPrice,
    isSubscribed: payload?.isSubscribed ?? existing?.isSubscribed ?? false,
    isActive: payload?.isActive ?? existing?.isActive ?? true,
    lastSeen: Date.now(),
  };

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("crm_of_fans", doc);
}

async function upsertMessage(ctx: any, payload: any, accountId: string) {
  const messageId = String(payload?.messageId ?? payload?.id ?? "");
  const chatId = String(payload?.chatId ?? payload?.conversationId ?? payload?.user?.id ?? "");
  if (!messageId || !chatId) return null;

  const doc = {
    accountId,
    chatId,
    messageId,
    fromUser: Boolean(payload?.fromUser ?? payload?.isFromFan ?? true),
    text: typeof payload?.text === "string" ? payload.text : undefined,
    timestamp: Number(payload?.timestamp ? new Date(payload.timestamp).getTime() : Date.now()),
    isMedia: Boolean(payload?.isMedia ?? ((payload?.media?.length ?? 0) > 0)),
    isPPV: Boolean(payload?.isPPV ?? (Number(payload?.price ?? 0) > 0)),
    responseTimeSec: payload?.responseTimeSec ? Number(payload.responseTimeSec) : undefined,
    isFirstInThread: payload?.isFirstInThread,
  };

  const existing = await ctx.db
    .query("crm_of_messages")
    .withIndex("by_message_id", (q: any) => q.eq("messageId", messageId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, doc);
    return existing._id;
  }

  return await ctx.db.insert("crm_of_messages", doc);
}

async function processEvent(ctx: any, event: any) {
  const accountId = event.accountId ?? String(event.payload?.accountId ?? "");
  if (!accountId) {
    await ctx.db.patch(event._id, { processed: true });
    return { processed: false, reason: "missing_account_id", eventType: event.eventType };
  }

  const payload = event.payload || {};

  if (event.eventType === "new_tip") {
    await upsertTransaction(ctx, payload, accountId, "tip");
    await upsertFan(ctx, payload, accountId);
  } else if (event.eventType === "new_subscription") {
    await upsertTransaction(ctx, payload, accountId, "subscription");
    await upsertFan(ctx, { ...payload, isSubscribed: true, isActive: true }, accountId);
  } else if (event.eventType === "new_message") {
    await upsertMessage(ctx, payload, accountId);
    await upsertFan(ctx, payload, accountId);
  } else if (event.eventType === "ppv_purchased") {
    await upsertTransaction(ctx, payload, accountId, "ppv");
    await upsertMessage(ctx, { ...payload, isPPV: true }, accountId);
    await upsertFan(ctx, payload, accountId);
  }

  await ctx.db.patch(event._id, { processed: true });
  return { processed: true, eventType: event.eventType, eventId: event._id };
}

export const processWebhookEvent = internalMutation({
  args: { eventId: v.id("crm_of_webhook_events") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.processed) {
      return { processed: false, reason: "not_found_or_already_processed" };
    }
    return await processEvent(ctx, event);
  },
});

export const processPendingWebhookEvents = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const events = await ctx.db
      .query("crm_of_webhook_events")
      .withIndex("by_received_at")
      .filter((q) => q.eq(q.field("processed"), false))
      .order("asc")
      .take(limit);

    let processed = 0;
    for (const event of events) {
      await processEvent(ctx, event);
      processed += 1;
    }

    return { scanned: events.length, processed };
  },
});
