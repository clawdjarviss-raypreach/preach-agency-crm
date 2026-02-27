"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export default function ManagerDashboardPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const stats = useQuery(api.crm.managerDashboard.getSubscriberStats, token ? { token } : "skip");
  const health = useQuery(api.crm.managerDashboard.getAccountHealth, token ? { token } : "skip");
  const trends = useQuery(
    api.crm.managerDashboard.getSubTrends,
    token ? { token, period, accountId: selectedAccount || undefined } : "skip"
  );

  const maxTrend = useMemo(() => {
    const vals = (trends?.dataPoints || []).flatMap((d: any) => [d.newSubs, d.rebills]);
    return Math.max(1, ...(vals.length ? vals : [1]));
  }, [trends]);

  if (!user) return null;

  if (user.role !== "marketing_manager") {
    return <div style={{ padding: 24 }}>🔒 This dashboard is for marketing managers only.</div>;
  }

  const accounts = stats?.accounts || [];

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>📈 Manager Dashboard</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>Assigned models only • No financial data</p>

      {accounts.length === 0 ? (
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24 }}>No models assigned yet. Contact your admin.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={inputStyle}>
              <option value="">All assigned models</option>
              {accounts.map((a: any) => <option key={a.accountId} value={a.accountId}>{a.displayName}</option>)}
            </select>
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{ ...pillStyle, opacity: period === p ? 1 : 0.6 }}>{p}</button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
            <Card title="Total Subs" value={stats?.totals.totalSubs ?? 0} />
            <Card title="Active Subs" value={stats?.totals.activeSubs ?? 0} />
            <Card title="New Today" value={stats?.totals.newSubsToday ?? 0} />
            <Card title="Rebills Today" value={stats?.totals.rebillsToday ?? 0} />
          </div>

          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <h3 style={{ marginBottom: 10 }}>Sub Trends</h3>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, trends?.dataPoints?.length || 1)}, minmax(10px, 1fr))`, gap: 4, alignItems: "end", minHeight: 140 }}>
              {(trends?.dataPoints || []).map((d: any) => (
                <div key={d.date} title={`${d.date} • new ${d.newSubs} • rebills ${d.rebills}`}>
                  <div style={{ background: "#60a5fa", height: `${Math.max(4, (d.newSubs / maxTrend) * 100)}px`, borderRadius: 3 }} />
                  <div style={{ background: "#34d399", height: `${Math.max(4, (d.rebills / maxTrend) * 100)}px`, borderRadius: 3, marginTop: 2 }} />
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, overflowX: "auto" }}>
            <h3 style={{ marginBottom: 10 }}>Account Health</h3>
            <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
              <thead><tr>{["Model", "Total Fans", "Active Fans", "Avg Lifetime (d)", "Response Rate %", "Unread"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {(health?.accounts || []).map((row: any) => (
                  <tr key={row.accountId}>
                    <td style={tdStyle}>{row.displayName}</td>
                    <td style={tdStyle}>{row.totalFans}</td>
                    <td style={tdStyle}>{row.activeFans}</td>
                    <td style={tdStyle}>{row.avgFanLifetimeDays}</td>
                    <td style={tdStyle}>{row.chatResponseRate}</td>
                    <td style={tdStyle}>{row.unreadChats}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14 }}><div style={{ fontSize: 12, color: "var(--text-muted)" }}>{title}</div><div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div></div>;
}

const inputStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" };
const pillStyle: React.CSSProperties = { border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", borderRadius: 999, padding: "8px 12px", cursor: "pointer" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border)" };
const tdStyle: React.CSSProperties = { padding: "8px", borderBottom: "1px solid var(--border-subtle)" };
