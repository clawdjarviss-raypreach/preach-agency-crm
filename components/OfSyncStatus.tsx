"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SyncState = {
  id: string;
  account_id: string;
  endpoint: string;
  last_sync_at: string | null;
  status: string;
  error: string | null;
};

type CreditUsage = {
  endpoint: string;
  credits_used: number;
};

function relativeTime(ts?: string | null) {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function endpointLabel(ep: string) {
  const labels: Record<string, string> = {
    transactions: "💰 Transactions",
    fans: "👥 Fans",
    messages: "💬 Messages",
    chats: "💬 Chats",
    earnings: "📊 Earnings",
    subscribers: "⭐ Subscribers",
    tracking_links: "🔗 Tracking Links",
    chargebacks: "↩️ Chargebacks",
  };
  return labels[ep] || ep;
}

export default function OfSyncStatus() {
  const [syncStates, setSyncStates] = useState<SyncState[] | null>(null);
  const [creditsRows, setCreditsRows] = useState<CreditUsage[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [{ data: syncData, error: syncErr }, { data: creditData, error: creditErr }] = await Promise.all([
        supabase
          .from("crm_of_sync_state")
          .select("id, account_id, endpoint, last_sync_at, status, error")
          .order("last_sync_at", { ascending: false })
          .limit(400),
        supabase
          .from("crm_of_credit_usage")
          .select("endpoint, credits_used")
          .gte("called_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(5000),
      ]);

      if (!mounted) return;
      if (syncErr) console.error("Failed loading OF sync state", syncErr);
      if (creditErr) console.error("Failed loading OF credit usage", creditErr);

      setSyncStates(syncData ?? []);
      setCreditsRows((creditData ?? []) as CreditUsage[]);
    }

    load();

    const channel = supabase
      .channel("of-sync-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_of_sync_state" },
        () => load()
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const byEndpoint = useMemo(() => {
    const map = new Map<string, { ts?: string | null; status?: string; error?: string | null }>();
    for (const row of syncStates ?? []) {
      const prev = map.get(row.endpoint);
      const prevTs = prev?.ts ? new Date(prev.ts).getTime() : 0;
      const curTs = row.last_sync_at ? new Date(row.last_sync_at).getTime() : 0;
      if (!prev || curTs >= prevTs) {
        map.set(row.endpoint, { ts: row.last_sync_at, status: row.status, error: row.error });
      }
    }
    return map;
  }, [syncStates]);

  const credits = useMemo(() => {
    const byEndpoint: Record<string, number> = {};
    let total = 0;
    for (const row of creditsRows) {
      const used = Number(row.credits_used || 0);
      total += used;
      byEndpoint[row.endpoint] = (byEndpoint[row.endpoint] || 0) + used;
    }
    return { total, byEndpoint };
  }, [creditsRows]);

  const hasErrors = (syncStates ?? []).some((s) => s.status === "error" || !!s.error);

  if (!syncStates) {
    return (
      <div style={{ background: "#1e1e1e", borderRadius: 16, padding: 20, border: "1px solid #2a2a2a" }}>
        <div style={{ fontSize: 13, color: "#a0a0a0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
          🔄 OF Sync Status
        </div>
        <div style={{ color: "#666", fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#1e1e1e",
        borderRadius: 16,
        padding: 20,
        border: hasErrors ? "1px solid rgba(239,68,68,0.3)" : "1px solid #2a2a2a",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "#a0a0a0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          🔄 OF Sync Status
        </div>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: hasErrors ? "#ef4444" : "#22c55e",
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {Array.from(byEndpoint.entries()).map(([endpoint, state]) => (
          <div
            key={endpoint}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 12px",
              background: "#2a2a2a",
              borderRadius: 10,
            }}
          >
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{endpointLabel(endpoint)}</span>
            <span style={{ fontSize: 12, color: "#a0a0a0" }}>{relativeTime(state.ts)}</span>
          </div>
        ))}
        {byEndpoint.size === 0 && (
          <div style={{ fontSize: 13, color: "#666", textAlign: "center", padding: 8 }}>No sync data yet</div>
        )}
      </div>

      <div
        style={{
          padding: "10px 14px",
          background: "rgba(241,174,56,0.08)",
          borderRadius: 10,
          border: "1px solid rgba(241,174,56,0.15)",
        }}
      >
        <div style={{ fontSize: 11, color: "#f1ae38", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
          API Credits Used (30d)
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1ae38" }}>{credits.total.toLocaleString()}</div>
        {Object.entries(credits.byEndpoint).length > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            {Object.entries(credits.byEndpoint).map(([ep, count]) => (
              <span key={ep} style={{ fontSize: 11, color: "#a0a0a0" }}>
                {ep}: {count.toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>

      {(syncStates ?? []).filter((s) => s.error).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
            ⚠️ Recent Errors
          </div>
          {(syncStates ?? [])
            .filter((s) => s.error)
            .slice(0, 3)
            .map((s) => (
              <div
                key={s.id}
                style={{
                  fontSize: 12,
                  color: "#ef4444",
                  padding: "6px 10px",
                  background: "rgba(239,68,68,0.08)",
                  borderRadius: 8,
                  marginBottom: 4,
                }}
              >
                {s.endpoint}: {s.error}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
