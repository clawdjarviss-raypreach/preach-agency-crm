export type OfChat = { id: string; title?: string; updatedAt?: string };
export type OfMessage = {
  id: string;
  chatId: string;
  text?: string;
  fromUser?: boolean;
  timestamp?: string;
  isMedia?: boolean;
  isPPV?: boolean;
};
export type OfTransaction = {
  id: string;
  amount: number;
  type: "ppv" | "tip" | "subscription" | "stream";
  fanId?: string;
  fanUsername?: string;
  timestamp?: string;
};
export type OfFan = {
  id: string;
  username: string;
  displayName?: string;
  totalSpend?: number;
  subscribedAt?: string;
  expiredAt?: string;
  isActive?: boolean;
  lastSeen?: string;
};
export type OfEarningStats = Record<string, unknown>;

type OfListResponse<T> = { items: T[]; nextCursor?: string };

export class OnlyFansApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly minIntervalMs: number;
  private lastRequestAt = 0;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || process.env.OFAPI_KEY || "";
    this.baseUrl = baseUrl || process.env.OFAPI_BASE_URL || "https://api.onlyfansapi.com/v1";
    this.minIntervalMs = 300;
  }

  hasApiKey() {
    return Boolean(this.apiKey);
  }

  private async waitForRateLimit() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  private async request<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    if (!this.apiKey) {
      throw new Error("OF API key is not configured");
    }

    const url = new URL(`${this.baseUrl}${path}`);
    Object.entries(query || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    let retries = 0;
    while (retries < 3) {
      await this.waitForRateLimit();

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) return (await response.json()) as T;

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) {
        throw new Error(`OF API error ${response.status}: ${response.statusText}`);
      }

      retries += 1;
      await new Promise((r) => setTimeout(r, 1000 * retries));
    }

    throw new Error("OF API request failed after retries");
  }

  async listChats(params?: { cursor?: string; limit?: number }): Promise<OfListResponse<OfChat>> {
    return this.request("/chats", params);
  }

  async listMessages(chatId: string, params?: { cursor?: string; limit?: number }): Promise<OfListResponse<OfMessage>> {
    return this.request(`/chats/${chatId}/messages`, params);
  }

  async getEarningStats(params?: { startDate?: string; endDate?: string }): Promise<OfEarningStats> {
    return this.request("/earnings/stats", params);
  }

  async listTransactions(params?: { cursor?: string; limit?: number; startDate?: string; endDate?: string }): Promise<OfListResponse<OfTransaction>> {
    return this.request("/transactions", params);
  }

  async listFans(params?: { cursor?: string; limit?: number }): Promise<OfListResponse<OfFan>> {
    return this.request("/fans", params);
  }

  async listActiveFans(params?: { cursor?: string; limit?: number }): Promise<OfListResponse<OfFan>> {
    return this.request("/fans", { ...params, status: "active" });
  }

  async listExpiredFans(params?: { cursor?: string; limit?: number }): Promise<OfListResponse<OfFan>> {
    return this.request("/fans", { ...params, status: "expired" });
  }
}
