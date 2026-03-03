import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

function toYmd(ts: string | number): string {
  const d = new Date(typeof ts === "number" ? ts * 1000 : ts);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function toIso(ts: unknown): string {
  const d = new Date(typeof ts === "number" ? ts * 1000 : String(ts ?? ""));
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function mapTransactionType(value: unknown): string {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "new_subscription") return "new_sub";
  if (raw === "recurring_subscription" || raw.includes("recurring")) return "rebill";
  if (raw.includes("tip")) return "tip";
  if (raw.includes("stream")) return "stream";
  if (raw.includes("sub")) return "new_sub";
  return "ppv"; // message / post / other
}

function parseFanUsername(description: unknown): string | undefined {
  if (typeof description !== "string") return undefined;
  const aText = description.match(/<a[^>]*>([^<]+)<\/a>/i)?.[1]?.trim();
  if (aText) return aText.replace(/^@/, "");
  const at = description.match(/@([a-zA-Z0-9_.]+)/)?.[1];
  return at ?? undefined;
}

function resolveMessage(payload: any) {
  return payload?.message ?? payload;
}

function resolveMessageId(message: any): string {
  return String(message?.id ?? message?.message_id ?? message?.messageId ?? "").trim();
}

function resolveChatId(message: any): string {
  return String(
    message?.chat_id
      ?? message?.chatId
      ?? message?.conversation_id
      ?? message?.conversationId
      ?? message?.user?.id
      ?? message?.from_user?.id
      ?? message?.fromUser?.id
      ?? ""
  ).trim();
}

async function upsertFanFromPayload(accountId: string, payload: any) {
  const fanId = payload?.user?.id ? String(payload.user.id) : payload?.fanId ? String(payload.fanId) : payload?.fan_id ? String(payload.fan_id) : null;
  if (!fanId) return;

  const fanUsername = payload?.user?.username
    ? String(payload.user.username)
    : payload?.fanUsername
      ? String(payload.fanUsername)
      : parseFanUsername(payload?.description) ?? null;

  await supabaseAdmin.from("crm_of_fans").upsert(
    {
      account_id: accountId,
      fan_id: fanId,
      username: fanUsername ?? `fan_${fanId}`,
      display_name: payload?.user?.name ?? null,
      total_spend: payload?.totalSpend ? Number(payload.totalSpend) : null,
      is_active: true,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "fan_id" }
  );
}

async function upsertMessageFromWebhook(accountId: string, event: string, payload: any) {
  const messageObj = resolveMessage(payload);
  const messageId = resolveMessageId(messageObj);
  const chatId = resolveChatId(messageObj);

  if (!messageId || !chatId) {
    return { ok: false, skipped: true, reason: "missing_message_or_chat_id" };
  }

  const timestamp = toIso(messageObj?.createdAt ?? messageObj?.created_at ?? messageObj?.timestamp ?? Date.now());
  const isPpvEvent = event === "messages.ppv.unlocked";
  const fromUser = event === "messages.received"
    ? true
    : Boolean(messageObj?.from_user ?? messageObj?.fromUser ?? true);

  const messageRow = {
    account_id: accountId,
    chat_id: chatId,
    message_id: messageId,
    from_user: fromUser,
    text: typeof messageObj?.text === "string" ? messageObj.text : null,
    timestamp,
    is_media: Boolean(messageObj?.media?.length || messageObj?.is_media || messageObj?.isMedia),
    is_ppv: Boolean(isPpvEvent || messageObj?.is_ppv || messageObj?.isPPV || Number(messageObj?.price ?? 0) > 0),
    response_time_sec: null,
    is_first_in_thread: null,
  };

  const { error: msgErr } = await supabaseAdmin
    .from("crm_of_messages")
    .upsert(messageRow, { onConflict: "message_id" });

  if (msgErr) {
    console.error("message upsert error:", msgErr);
    return { ok: false, error: msgErr.message };
  }

  const chatRow = {
    account_id: accountId,
    chat_id: chatId,
    fan_id: messageObj?.user?.id ? String(messageObj.user.id) : null,
    fan_username: messageObj?.user?.username ?? null,
    fan_display_name: messageObj?.user?.name ?? null,
    last_message_at: timestamp,
    has_unread: event === "messages.received",
    metadata: payload,
    synced_at: new Date().toISOString(),
  };

  const { error: chatErr } = await supabaseAdmin
    .from("crm_of_chats")
    .upsert(chatRow, { onConflict: "account_id,chat_id" });

  if (chatErr) {
    console.error("chat upsert error:", chatErr);
  }

  await upsertFanFromPayload(accountId, messageObj);

  return { ok: true, action: "message", messageId, chatId, isPpv: isPpvEvent };
}

async function handleTransaction(accountId: string, payload: any) {
  const ofTxId = String(payload?.id ?? payload?.transactionId ?? `${accountId}:${Date.now()}`);
  const amount = Number(payload?.amount ?? payload?.net ?? payload?.price ?? 0);
  const type = mapTransactionType(payload?.type);
  const createdAt = payload?.createdAt ?? payload?.created_at ?? payload?.timestamp;
  const timestamp = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  const fanId = payload?.user?.id ? String(payload.user.id) : payload?.fanId ? String(payload.fanId) : null;
  const fanUsername = payload?.user?.username
    ? String(payload.user.username)
    : payload?.fanUsername
    ? String(payload.fanUsername)
    : parseFanUsername(payload?.description) ?? null;

  // Upsert transaction
  const { error: txErr } = await supabaseAdmin
    .from("crm_of_transactions")
    .upsert(
      {
        account_id: accountId,
        of_transaction_id: ofTxId,
        amount,
        type,
        fan_id: fanId,
        fan_username: fanUsername,
        timestamp,
        metadata: payload,
      },
      { onConflict: "of_transaction_id" }
    );

  if (txErr) console.error("tx upsert error:", txErr);

  // Update daily earnings
  const date = toYmd(timestamp);
  const netAmount = Number(payload?.net ?? amount);

  const { data: existing } = await supabaseAdmin
    .from("crm_of_daily_earnings")
    .select("*")
    .eq("account_id", accountId)
    .eq("date", date)
    .maybeSingle();

  if (existing) {
    const updates: Record<string, number> = {
      total_earnings: Number(existing.total_earnings ?? 0) + amount,
      net_earnings: Number(existing.net_earnings ?? 0) + netAmount,
      transaction_count: Number(existing.transaction_count ?? 0) + 1,
    };
    if (type === "new_sub" || type === "rebill") {
      updates.subscription_earnings = Number(existing.subscription_earnings ?? 0) + netAmount;
      updates.subscription_count = Number(existing.subscription_count ?? 0) + 1;
    } else if (type === "tip") {
      updates.tip_earnings = Number(existing.tip_earnings ?? 0) + netAmount;
    } else if (type === "ppv") {
      updates.message_earnings = Number(existing.message_earnings ?? 0) + netAmount;
    } else if (type === "stream") {
      updates.stream_earnings = Number(existing.stream_earnings ?? 0) + netAmount;
    }
    await supabaseAdmin.from("crm_of_daily_earnings").update(updates).eq("id", existing.id);
  } else {
    const row: Record<string, any> = {
      account_id: accountId,
      date,
      total_earnings: amount,
      net_earnings: netAmount,
      transaction_count: 1,
      subscription_earnings: 0,
      tip_earnings: 0,
      message_earnings: 0,
      stream_earnings: 0,
      referral_earnings: 0,
      subscription_count: 0,
      tip_count: 0,
      message_count: 0,
      chargeback_amount: 0,
      chargeback_count: 0,
    };
    if (type === "new_sub" || type === "rebill") {
      row.subscription_earnings = netAmount;
      row.subscription_count = 1;
    } else if (type === "tip") {
      row.tip_earnings = netAmount;
    } else if (type === "ppv") {
      row.message_earnings = netAmount;
    } else if (type === "stream") {
      row.stream_earnings = netAmount;
    }
    await supabaseAdmin.from("crm_of_daily_earnings").upsert(row, { onConflict: "account_id,date" });
  }

  // Upsert fan if we have data
  if (fanId) {
    await supabaseAdmin.from("crm_of_fans").upsert(
      {
        account_id: accountId,
        fan_id: fanId,
        username: fanUsername ?? `fan_${fanId}`,
        display_name: payload?.user?.name ?? null,
        total_spend: payload?.totalSpend ? Number(payload.totalSpend) : null,
        is_active: true,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "fan_id" }
    );
  }

  return { ok: true, action: "transaction", ofTxId };
}

async function handleSubscription(accountId: string, payload: any, isRenewal: boolean) {
  const amount = Number(payload?.amount ?? payload?.price ?? payload?.subscriptionPrice ?? 0);
  const type = isRenewal ? "rebill" : "new_sub";
  const txPayload = { ...payload, type, amount };
  return handleTransaction(accountId, txPayload);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" } });
  }

  try {
    const body = await req.json();
    const event = body?.event ?? body?.type ?? "";
    const accountId = body?.accountId ?? body?.account_id ?? body?.data?.accountId ?? "";
    const payload = body?.data ?? body?.payload ?? body;

    if (!accountId) {
      return Response.json({ ok: false, error: "missing accountId" }, { status: 400 });
    }

    let result: any;

    switch (event) {
      case "transactions.new":
        result = await handleTransaction(accountId, payload);
        break;
      case "subscriptions.new":
        result = await handleSubscription(accountId, payload, false);
        break;
      case "subscriptions.renewed":
        result = await handleSubscription(accountId, payload, true);
        break;
      case "messages.received":
      case "messages.ppv.unlocked":
        result = await upsertMessageFromWebhook(accountId, event, payload);
        break;
      case "messages.sent":
        result = { ok: true, skipped: true, event };
        break;
      default:
        console.warn(`Unhandled OF webhook event: ${event}`);
        result = { ok: true, unhandled: true, event };
    }

    return Response.json(result);
  } catch (err) {
    console.error("Webhook error:", err);
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
