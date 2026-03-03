import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const BASE_URL = process.env.OFAPI_BASE_URL || "https://app.onlyfansapi.com";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

export class OfApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "OfApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toArrayAccountBody(body: Record<string, any> | undefined) {
  if (!body) return body;
  if (body.account_id && !body.account_ids) {
    return { ...body, account_ids: [body.account_id] };
  }
  return body;
}

export async function callOfApi<T>(params: {
  apiKey: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, any>;
  query?: Record<string, string | number | undefined>;
  onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>;
}): Promise<T> {
  const url = new URL(`${BASE_URL}${params.path}`);
  Object.entries(params.query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  });

  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const calledAt = Date.now();
    try {
      const response = await fetch(url.toString(), {
        method: params.method,
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json",
        },
        body: params.method === "POST" ? JSON.stringify(toArrayAccountBody(params.body)) : undefined,
      });

      await params.onCreditUsage?.({
        endpoint: params.path.replace(/^\/api\//, ""),
        status: response.status,
        calledAt,
      });

      if (response.ok) {
        return (await response.json()) as T;
      }

      const text = await response.text();
      const retryAfterSec = Number(response.headers.get("Retry-After") || 0);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new OfApiError(
          text || `OF API ${response.status}: ${response.statusText}`,
          response.status,
          false
        );
      }

      if (attempt === MAX_RETRIES - 1) {
        throw new OfApiError(
          text || `OF API ${response.status}: ${response.statusText}`,
          response.status,
          true
        );
      }

      if (response.status === 429 && retryAfterSec > 0) {
        await sleep(retryAfterSec * 1000);
      } else {
        await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
      }
    } catch (err: any) {
      lastErr = err;
      if (err instanceof OfApiError && !err.retryable) {
        throw err;
      }

      if (attempt === MAX_RETRIES - 1) {
        if (err instanceof OfApiError) throw err;
        throw new OfApiError(err?.message || "Network error", 0, true);
      }

      await sleep(RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)]);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("OF API call failed");
}

export const trackCreditUsage = internalMutation({
  args: {
    endpoint: v.string(),
    accountId: v.string(),
    calledAt: v.number(),
    responseStatus: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("crm_of_credit_usage", {
      endpoint: args.endpoint,
      creditsUsed: 1,
      accountId: args.accountId,
      calledAt: args.calledAt,
      responseStatus: args.responseStatus,
    });
  },
});

export async function getEarningsSummary(apiKey: string, params: {
  account_id: string;
  start_date: string;
  end_date: string;
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "POST",
    path: "/api/analytics/summary/earnings",
    body: params,
    onCreditUsage,
  });
}

export async function getTransactionsSummary(apiKey: string, params: {
  account_id: string;
  start_date: string;
  end_date: string;
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "POST",
    path: "/api/analytics/financial/transactions/summary",
    body: params,
    onCreditUsage,
  });
}

export async function getTransactionsByType(apiKey: string, params: {
  account_id: string;
  start_date: string;
  end_date: string;
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "POST",
    path: "/api/analytics/financial/transactions/by-type",
    body: params,
    onCreditUsage,
  });
}

export async function getRevenueForecast(apiKey: string, params: {
  account_id: string;
  metric?: string;
  model?: string;
  historical_days?: number;
  forecast_days?: number;
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "POST",
    path: "/api/analytics/financial/forecast",
    body: params,
    onCreditUsage,
  });
}

export async function getChats(apiKey: string, accountId: string, params?: {
  limit?: number;
  offset?: number;
  order?: "recent" | "old";
  skip_users?: "all" | "none";
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "GET",
    path: `/api/${accountId}/chats`,
    query: params,
    onCreditUsage,
  });
}

export async function getChatMessages(apiKey: string, accountId: string, chatId: string, params?: {
  limit?: number;
  marker?: string | number;
  id?: string | number;
  order?: "desc" | "asc";
  skip_users?: "all" | "none";
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "GET",
    path: `/api/${accountId}/chats/${chatId}/messages`,
    query: params,
    onCreditUsage,
  });
}

export async function getFans(apiKey: string, accountId: string, params?: {
  limit?: number;
  offset?: number;
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "GET",
    path: `/api/${accountId}/fans/all`,
    query: params,
    onCreditUsage,
  });
}

export async function getTrackingLinks(apiKey: string, accountId: string, params?: {
  limit?: number;
  offset?: number;
  fresh?: "true" | "false";
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "GET",
    path: `/api/${accountId}/tracking-links`,
    query: params,
    onCreditUsage,
  });
}

export async function getTrackingLinkAnalytics(apiKey: string, accountId: string, linkId: string, params?: {
  fresh?: "true" | "false";
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "GET",
    path: `/api/${accountId}/tracking-links/${linkId}/analytics`,
    query: params,
    onCreditUsage,
  });
}

export async function getTransactionsList(apiKey: string, accountId: string, params?: {
  limit?: number;
  marker?: string | number;
  startDate?: string;
  type?: "subscribes" | "tips" | "post" | "chat_messages" | "stream";
  tipsSource?: "profile" | "post_all" | "chat" | "stream" | "story";
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>) {
  return callOfApi<any>({
    apiKey,
    method: "GET",
    path: `/api/${accountId}/transactions`,
    query: params,
    onCreditUsage,
  });
}


type OfChargeback = {
  id?: string | number;
  createdAt?: string;
  paymentType?: string;
  payment?: {
    id?: string;
    createdAt?: string;
    amount?: number | string;
    net?: number | string;
    fee?: number | string;
    status?: string;
  };
};

function listFromPayload<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data?.list)) return payload.data.list as T[];
  if (Array.isArray(payload?.data?.items)) return payload.data.items as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  if (Array.isArray(payload?.items)) return payload.items as T[];
  if (Array.isArray(payload?.chargebacks)) return payload.chargebacks as T[];
  return [];
}

function parseYmd(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return toYmd(d);
}

function diffDays(start: string, end: string): number {
  const ms = parseYmd(end).getTime() - parseYmd(start).getTime();
  return Math.floor(ms / 86400000);
}

export async function getChargebacks(apiKey: string, accountId: string, params: {
  start_date: string;
  end_date: string;
  limit?: number;
}, onCreditUsage?: (usage: { endpoint: string; status: number; calledAt: number }) => Promise<void>): Promise<OfChargeback[]> {
  const pageLimit = Math.min(100, Math.max(1, Number(params.limit ?? 100)));

  const fetchRange = async (startDate: string, endDate: string): Promise<OfChargeback[]> => {
    const out: OfChargeback[] = [];
    const seen = new Set<string>();
    let offset = 0;
    let hasMore = true;
    let pages = 0;
    let paginationLooksBroken = false;

    while (hasMore && pages < 500) {
      const res = await callOfApi<any>({
        apiKey,
        method: "GET",
        path: `/api/${accountId}/chargebacks`,
        query: {
          start_date: startDate,
          end_date: endDate,
          limit: pageLimit,
          offset,
        },
        onCreditUsage,
      });

      const page = listFromPayload<OfChargeback>(res);
      if (!page.length) break;

      let newInPage = 0;
      for (const cb of page) {
        const key = String(
          cb.payment?.id ?? `${cb.createdAt ?? ""}|${cb.payment?.createdAt ?? ""}|${cb.payment?.net ?? ""}|${cb.payment?.amount ?? ""}`
        );
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(cb);
        newInPage += 1;
      }

      if (newInPage === 0) {
        paginationLooksBroken = true;
        break;
      }

      pages += 1;
      hasMore = page.length >= pageLimit;
      offset += pageLimit;
    }

    if (paginationLooksBroken && startDate < endDate) {
      const span = diffDays(startDate, endDate);
      const mid = addDays(startDate, Math.floor(span / 2));
      const left = await fetchRange(startDate, mid);
      const right = await fetchRange(addDays(mid, 1), endDate);
      const merged = new Map<string, OfChargeback>();
      for (const cb of [...left, ...right]) {
        const key = String(
          cb.payment?.id ?? `${cb.createdAt ?? ""}|${cb.payment?.createdAt ?? ""}|${cb.payment?.net ?? ""}|${cb.payment?.amount ?? ""}`
        );
        merged.set(key, cb);
      }
      return Array.from(merged.values());
    }

    return out;
  };

  return fetchRange(params.start_date, params.end_date);
}
