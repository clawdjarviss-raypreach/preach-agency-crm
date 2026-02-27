"use client";

import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function relativeTime(ts: number) {
  if (!ts) return "Never";
  const diff = Date.now() - ts;
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
    earnings: "📊 Earnings",
    subscribers: "⭐ Subscribers",
  };
  return labels[ep] || ep;
}

export default function OfSyncStatus() {
  const syncData = useQuery((api as any).crm.ofQueries.getOfSyncStatus);

  if (!syncData) {
    return (
      <div style={{
        background: "#1e1e1e", borderRadius: 16, padding: 20,
        border: "1px solid #2a2a2a",
      }}>
        <div style={{ fontSize: 13, color: "#a0a0a0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
          🔄 OF Sync Status
        </div>
        <div style={{ color: "#666", fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  const { syncStates, latestByEndpoint, credits } = syncData;

  // Group sync states by endpoint
  const endpoints = Object.entries(latestByEndpoint).map(([key, ts]) => {
    const [, endpoint] = key.split(":");
    return { key, endpoint: endpoint || key, lastSync: ts as number };
  });

  // Dedupe by endpoint (take latest)
  const byEndpoint = new Map<string, number>();
  for (const ep of endpoints) {
    const prev = byEndpoint.get(ep.endpoint) || 0;
    if ((ep.lastSync as number) > prev) byEndpoint.set(ep.endpoint, ep.lastSync);
  }

  const hasErrors = syncStates.some((s: any) => s.status === "error" || s.lastError);

  return (
    <div style={{
      background: "#1e1e1e", borderRadius: 16, padding: 20,
      border: hasErrors ? "1px solid rgba(239,68,68,0.3)" : "1px solid #2a2a2a",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16,
      }}>
        <div style={{ fontSize: 13, color: "#a0a0a0", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          🔄 OF Sync Status
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: hasErrors ? "#ef4444" : "#22c55e",
        }} />
      </div>

      {/* Sync times per endpoint */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {Array.from(byEndpoint.entries()).map(([endpoint, ts]) => (
          <div key={endpoint} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", background: "#2a2a2a", borderRadius: 10,
          }}>
            <span style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>
              {endpointLabel(endpoint)}
            </span>
            <span style={{ fontSize: 12, color: "#a0a0a0" }}>
              {relativeTime(ts)}
            </span>
          </div>
        ))}
        {byEndpoint.size === 0 && (
          <div style={{ fontSize: 13, color: "#666", textAlign: "center", padding: 8 }}>
            No sync data yet
          </div>
        )}
      </div>

      {/* Credit usage */}
      <div style={{
        padding: "10px 14px", background: "rgba(241,174,56,0.08)", borderRadius: 10,
        border: "1px solid rgba(241,174,56,0.15)",
      }}>
        <div style={{ fontSize: 11, color: "#f1ae38", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>
          API Credits Used
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#f1ae38" }}>
          {credits.total.toLocaleString()}
        </div>
        {Object.entries(credits.byEndpoint).length > 0 && (
          <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
            {Object.entries(credits.byEndpoint).map(([ep, count]) => (
              <span key={ep} style={{ fontSize: 11, color: "#a0a0a0" }}>
                {ep}: {(count as number).toLocaleString()}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Errors */}
      {syncStates.filter((s: any) => s.lastError).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>
            ⚠️ Recent Errors
          </div>
          {syncStates.filter((s: any) => s.lastError).slice(0, 3).map((s: any, i: number) => (
            <div key={i} style={{
              fontSize: 12, color: "#ef4444", padding: "6px 10px",
              background: "rgba(239,68,68,0.08)", borderRadius: 8, marginBottom: 4,
            }}>
              {s.endpoint}: {s.lastError}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
