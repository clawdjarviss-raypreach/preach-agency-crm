import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { internal as _internal } from "../_generated/api";
const internal = _internal as any;

type OfEndpoint = "earnings" | "messages" | "fans" | "transactions";

type OfFetchResult<T> = {
  items: T[];
  nextCursor?: string;
};

const BASE_URL = process.env.OFAPI_BASE_URL || "https://app.onlyfansapi.com";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callOfApi<T>(params: {
  apiKey: string;
  path: string;
  query?: Record<string, string | number | undefined>;
}): Promise<T> {
  const url = new URL(`${BASE_URL}${params.path}`);
  Object.entries(params.query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) return (await response.json()) as T;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) {
      throw new Error(`OF API ${response.status}: ${response.statusText}`);
    }

    attempt += 1;
    if (attempt >= MAX_RETRIES) {
      throw new Error(`OF API failed after retries (${response.status})`);
    }

    await sleep(RETRY_DELAY_MS * attempt);
  }

  throw new Error("Unexpected OF API failure");
}

export const getApiKey = internalQuery({
  args: {},
  handler: async (ctx) => {
    const config = await ctx.db
      .query("crm_of_api_config")
      .withIndex("by_updated_at")
      .order("desc")
      .first();

    return config?.apiKey ?? process.env.OFAPI_KEY ?? null;
  },
});

export const getActiveAccounts = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("crm_of_accounts")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

export const getAccountByAccountId = internalQuery({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("crm_of_accounts")
      .withIndex("by_account_id", (q) => q.eq("accountId", args.accountId))
      .first();
  },
});

export const getSyncState = internalQuery({
  args: {
    accountId: v.string(),
    endpoint: v.union(v.literal("earnings"), v.literal("messages"), v.literal("fans"), v.literal("transactions")),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("crm_of_sync_state")
      .withIndex("by_account_endpoint", (q) => q.eq("accountId", args.accountId).eq("endpoint", args.endpoint))
      .first();
  },
});

export const upsertSyncState = internalMutation({
  args: {
    accountId: v.string(),
    endpoint: v.union(v.literal("earnings"), v.literal("messages"), v.literal("fans"), v.literal("transactions")),
    lastSyncAt: v.optional(v.number()),
    cursor: v.optional(v.string()),
    status: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("crm_of_sync_state")
      .withIndex("by_account_endpoint", (q) => q.eq("accountId", args.accountId).eq("endpoint", args.endpoint))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSyncAt: args.lastSyncAt,
        cursor: args.cursor,
        status: args.status,
        error: args.error,
      });
      return existing._id;
    }

    return await ctx.db.insert("crm_of_sync_state", {
      accountId: args.accountId,
      endpoint: args.endpoint,
      lastSyncAt: args.lastSyncAt,
      cursor: args.cursor,
      status: args.status,
      error: args.error,
    });
  },
});

export const upsertAccountSyncMeta = internalMutation({
  args: {
    accountId: v.string(),
    syncStatus: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    lastSyncAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("crm_of_accounts")
      .withIndex("by_account_id", (q) => q.eq("accountId", args.accountId))
      .first();

    if (!account) return null;

    await ctx.db.patch(account._id, {
      syncStatus: args.syncStatus,
      lastSyncAt: args.lastSyncAt,
    });
    return account._id;
  },
});

async function runSyncTransactions(ctx: any, apiKey: string, accountId: string) {
  const sync = await ctx.runQuery(internal.crm.ofSync.getSyncState, {
    accountId,
    endpoint: "transactions",
  });

  await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
    accountId,
    endpoint: "transactions",
    status: "syncing",
    cursor: sync?.cursor,
    lastSyncAt: sync?.lastSyncAt,
    error: undefined,
  });

  const res = await callOfApi<OfFetchResult<any>>({
    apiKey,
    path: "/transactions",
    query: { cursor: sync?.cursor, limit: 100, accountId },
  });

  for (const item of res.items || []) {
    await ctx.runMutation(internal.crm.ofIntegration.upsertWebhookTransaction, {
      accountId,
      ofTransactionId: String(item.id ?? item.transactionId),
      amount: Number(item.amount ?? 0),
      type: (item.type ?? "ppv") as "ppv" | "tip" | "subscription" | "stream",
      fanId: item.fanId ? String(item.fanId) : undefined,
      fanUsername: item.fanUsername ? String(item.fanUsername) : undefined,
      timestamp: Number(item.timestamp ? new Date(item.timestamp).getTime() : Date.now()),
      metadata: item,
    });
  }

  await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
    accountId,
    endpoint: "transactions",
    status: "idle",
    cursor: res.nextCursor,
    lastSyncAt: Date.now(),
    error: undefined,
  });
}

async function runSyncMessages(ctx: any, apiKey: string, accountId: string) {
  const sync = await ctx.runQuery(internal.crm.ofSync.getSyncState, {
    accountId,
    endpoint: "messages",
  });

  await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
    accountId,
    endpoint: "messages",
    status: "syncing",
    cursor: sync?.cursor,
    lastSyncAt: sync?.lastSyncAt,
    error: undefined,
  });

  const chats = await callOfApi<OfFetchResult<any>>({ apiKey, path: "/chats", query: { limit: 100, accountId } });

  for (const chat of chats.items || []) {
    const messages = await callOfApi<OfFetchResult<any>>({
      apiKey,
      path: `/chats/${chat.id}/messages`,
      query: { limit: 100 },
    });

    for (const msg of messages.items || []) {
      await ctx.runMutation(internal.crm.ofIntegration.upsertWebhookMessage, {
        accountId,
        chatId: String(chat.id),
        messageId: String(msg.id),
        fromUser: Boolean(msg.fromUser ?? msg.from_user ?? false),
        text: typeof msg.text === "string" ? msg.text : undefined,
        timestamp: Number(msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now()),
        isMedia: Boolean(msg.isMedia ?? msg.is_media ?? false),
        isPPV: Boolean(msg.isPPV ?? msg.is_ppv ?? false),
      });
    }
  }

  await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
    accountId,
    endpoint: "messages",
    status: "idle",
    cursor: sync?.cursor,
    lastSyncAt: Date.now(),
    error: undefined,
  });
}

async function runSyncFans(ctx: any, apiKey: string, accountId: string) {
  const sync = await ctx.runQuery(internal.crm.ofSync.getSyncState, {
    accountId,
    endpoint: "fans",
  });

  await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
    accountId,
    endpoint: "fans",
    status: "syncing",
    cursor: sync?.cursor,
    lastSyncAt: sync?.lastSyncAt,
    error: undefined,
  });

  const res = await callOfApi<OfFetchResult<any>>({ apiKey, path: "/fans", query: { limit: 200, accountId } });

  for (const fan of res.items || []) {
    const existing = await ctx.runQuery(internal.crm.ofSync.getFanByFanId, {
      fanId: String(fan.id),
      accountId,
    });

    const data = {
      accountId,
      fanId: String(fan.id),
      username: String(fan.username ?? "unknown"),
      displayName: fan.displayName ? String(fan.displayName) : undefined,
      totalSpend: fan.totalSpend ? Number(fan.totalSpend) : undefined,
      subscribedAt: fan.subscribedAt ? new Date(fan.subscribedAt).getTime() : undefined,
      expiredAt: fan.expiredAt ? new Date(fan.expiredAt).getTime() : undefined,
      isActive: Boolean(fan.isActive ?? true),
      lastSeen: fan.lastSeen ? new Date(fan.lastSeen).getTime() : undefined,
    };

    if (existing) {
      await ctx.runMutation(internal.crm.ofSync.patchFan, { id: existing._id, data });
    } else {
      await ctx.runMutation(internal.crm.ofSync.insertFan, { data });
    }
  }

  await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
    accountId,
    endpoint: "fans",
    status: "idle",
    cursor: res.nextCursor,
    lastSyncAt: Date.now(),
    error: undefined,
  });
}

export const getFanByFanId = internalQuery({
  args: { accountId: v.string(), fanId: v.string() },
  handler: async (ctx, args) => {
    const fans = await ctx.db
      .query("crm_of_fans")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .collect();
    return fans.find((f) => f.fanId === args.fanId) ?? null;
  },
});

export const patchFan = internalMutation({
  args: { id: v.id("crm_of_fans"), data: v.any() },
  handler: async (ctx, args) => ctx.db.patch(args.id, args.data),
});

export const insertFan = internalMutation({
  args: { data: v.any() },
  handler: async (ctx, args) => ctx.db.insert("crm_of_fans", args.data),
});

export const syncTransactions = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };

    const accounts = await ctx.runQuery(internal.crm.ofSync.getActiveAccounts, {});
    for (const account of accounts) {
      try {
        await ctx.runMutation(internal.crm.ofSync.upsertAccountSyncMeta, {
          accountId: account.accountId,
          syncStatus: "syncing",
          lastSyncAt: account.lastSyncAt,
        });
        await runSyncTransactions(ctx, apiKey, account.accountId);
        await ctx.runMutation(internal.crm.ofSync.upsertAccountSyncMeta, {
          accountId: account.accountId,
          syncStatus: "idle",
          lastSyncAt: Date.now(),
        });
      } catch (error: any) {
        await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
          accountId: account.accountId,
          endpoint: "transactions",
          status: "error",
          error: error.message,
          cursor: undefined,
          lastSyncAt: Date.now(),
        });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncMessages = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };

    const accounts = await ctx.runQuery(internal.crm.ofSync.getActiveAccounts, {});
    for (const account of accounts) {
      try {
        await runSyncMessages(ctx, apiKey, account.accountId);
      } catch (error: any) {
        await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
          accountId: account.accountId,
          endpoint: "messages",
          status: "error",
          error: error.message,
          cursor: undefined,
          lastSyncAt: Date.now(),
        });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncFans = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };

    const accounts = await ctx.runQuery(internal.crm.ofSync.getActiveAccounts, {});
    for (const account of accounts) {
      try {
        await runSyncFans(ctx, apiKey, account.accountId);
      } catch (error: any) {
        await ctx.runMutation(internal.crm.ofSync.upsertSyncState, {
          accountId: account.accountId,
          endpoint: "fans",
          status: "error",
          error: error.message,
          cursor: undefined,
          lastSyncAt: Date.now(),
        });
      }
    }

    return { skipped: false, accountsSynced: accounts.length };
  },
});

export const syncTransactionsForAccount = internalAction({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    await runSyncTransactions(ctx, apiKey, args.accountId);
    return { success: true };
  },
});

export const syncMessagesForAccount = internalAction({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    await runSyncMessages(ctx, apiKey, args.accountId);
    return { success: true };
  },
});

export const syncFansForAccount = internalAction({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { skipped: true, reason: "OF API key not configured" };
    await runSyncFans(ctx, apiKey, args.accountId);
    return { success: true };
  },
});

export const checkApiHealth = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = await ctx.runQuery(internal.crm.ofSync.getApiKey, {});
    if (!apiKey) return { ok: false, message: "OF API key not configured" };

    try {
      await callOfApi<any>({ apiKey, path: "/chats", query: { limit: 1 } });
      return { ok: true, message: "API key is valid" };
    } catch (error: any) {
      return { ok: false, message: error.message };
    }
  },
});
