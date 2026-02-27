"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

type SortKey =
  | "chatterName"
  | "totalSales"
  | "ppvSales"
  | "tipSales"
  | "impactPct"
  | "messagesSent"
  | "avgResponseTime"
  | "ppvSent"
  | "ppvSold"
  | "ppvOpenRate"
  | "ppvAvgPrice"
  | "aiReplies"
  | "templatesSent"
  | "manuallyTyped";

const KEY_METRICS: SortKey[] = ["totalSales", "ppvOpenRate", "impactPct", "avgResponseTime"];

export default function ChatterPerformancePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [selectedImportId, setSelectedImportId] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("totalSales");
  const [sortAsc, setSortAsc] = useState(false);

  const omApi = (api as any).crm.omImport;
  const ofApi = (api as any).crm.ofQueries;

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const imports = useQuery(omApi.listImportsForSelector, token ? { token } : "skip");
  const metrics = useQuery(
    omApi.getChatterMetricsByImport,
    token && selectedImportId ? { token, importId: selectedImportId } : "skip"
  );

  // OF API chat stats for response time metrics
  const ofChatStats = useQuery(ofApi.getOfChatStats, {});

  useEffect(() => {
    if (!selectedImportId && imports && imports.length > 0) {
      setSelectedImportId(imports[0].id);
    }
  }, [imports, selectedImportId]);

  const sortedRows = useMemo(() => {
    if (!metrics) return [];
    const rows = [...metrics];
    rows.sort((a: any, b: any) => {
      const aVal = a[sortKey] ?? 0;
      const bVal = b[sortKey] ?? 0;
      if (typeof aVal === "string" || typeof bVal === "string") {
        const sA = String(aVal);
        const sB = String(bVal);
        return sortAsc ? sA.localeCompare(sB) : sB.localeCompare(sA);
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return rows;
  }, [metrics, sortKey, sortAsc]);

  const summary = useMemo(() => {
    const rows = metrics || [];
    const totalRevenue = rows.reduce((sum: number, r: any) => sum + (r.totalSales || 0), 0);

    const openRateRows = rows.filter((r: any) => Number.isFinite(r.ppvOpenRate));
    const avgPpvOpenRate = openRateRows.length
      ? openRateRows.reduce((sum: number, r: any) => sum + (r.ppvOpenRate || 0), 0) / openRateRows.length
      : 0;

    const responseRows = rows.filter((r: any) => Number.isFinite(r.avgResponseTime));
    const avgResponseTime = responseRows.length
      ? responseRows.reduce((sum: number, r: any) => sum + (r.avgResponseTime || 0), 0) / responseRows.length
      : null;

    return { totalRevenue, avgPpvOpenRate, avgResponseTime };
  }, [metrics]);

  const bestWorst = useMemo(() => {
    const rows = metrics || [];
    const map: Record<string, { bestId?: string; worstId?: string }> = {};

    for (const key of KEY_METRICS) {
      const valid = rows.filter((r: any) => Number.isFinite(r[key]));
      if (!valid.length) continue;

      const sorted = [...valid].sort((a: any, b: any) => {
        const delta = (a[key] ?? 0) - (b[key] ?? 0);
        return key === "avgResponseTime" ? delta : -delta;
      });

      map[key] = {
        bestId: sorted[0]?.id,
        worstId: sorted[sorted.length - 1]?.id,
      };
    }

    return map;
  }, [metrics]);

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <div style={{ background: "var(--surface)", borderRadius: 24, padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h3 style={{ fontSize: 18, color: "var(--text)", marginBottom: 8 }}>Access Denied</h3>
        <p style={{ color: "var(--text-secondary)" }}>Admin only.</p>
      </div>
    );
  }

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
      return;
    }
    setSortKey(key);
    setSortAsc(false);
  };

  const sortGlyph = (key: SortKey) => (sortKey === key ? (sortAsc ? "↑" : "↓") : "⇅");

  const columns: Array<{ key: SortKey; label: string; align?: "left" | "right"; render?: (v: any) => string }> = [
    { key: "chatterName", label: "Chatter Name", align: "left" },
    { key: "totalSales", label: "Total Sales", render: money },
    { key: "ppvSales", label: "PPV Sales", render: money },
    { key: "tipSales", label: "Tips", render: money },
    { key: "impactPct", label: "Impact %", render: pct },
    { key: "messagesSent", label: "Messages Sent", render: int },
    { key: "avgResponseTime", label: "Avg Response Time", render: duration },
    { key: "ppvSent", label: "PPV Sent", render: int },
    { key: "ppvSold", label: "PPV Sold", render: int },
    { key: "ppvOpenRate", label: "PPV Open Rate", render: pct },
    { key: "ppvAvgPrice", label: "Avg PPV Price", render: money },
    { key: "aiReplies", label: "AI Replies", render: int },
    { key: "templatesSent", label: "Templates Sent", render: int },
    { key: "manuallyTyped", label: "Manually Typed", render: int },
  ];

  return (
    <div style={{ maxWidth: 1500 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>💬 Chatter Performance</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
          Daily morning snapshot from OnlyMonster dashboard imports.
        </p>
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
          Period / Import
        </div>
        <select
          value={selectedImportId}
          onChange={(e) => setSelectedImportId(e.target.value)}
          style={inputStyle}
        >
          {!imports?.length && <option value="">No dashboard imports found</option>}
          {(imports || []).map((imp: any) => (
            <option key={imp.id} value={imp.id}>
              {new Date(imp.importedAt).toLocaleString()} — {imp.filename}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
        <SummaryCard label="Total Agency Revenue" value={money(summary.totalRevenue)} emoji="💰" />
        <SummaryCard label="Avg PPV Open Rate" value={pct(summary.avgPpvOpenRate)} emoji="📬" />
        <SummaryCard label="Avg Response Time" value={duration(summary.avgResponseTime)} emoji="⏱️" />
      </div>

      {/* OF API Response Time Metrics */}
      {ofChatStats && (
        <div style={{
          background: "var(--surface)", borderRadius: 16, padding: 20, marginBottom: 16,
          border: "1px solid rgba(241,174,56,0.2)",
        }}>
          <div style={{ fontSize: 13, color: "#f1ae38", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 14 }}>
            📡 OF API — Real-Time Chat Metrics
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <div style={{ background: "var(--bg)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Avg Response Time</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#f1ae38" }}>
                {ofChatStats.avgResponseTimeSec ? duration(ofChatStats.avgResponseTimeSec) : "—"}
              </div>
            </div>
            <div style={{ background: "var(--bg)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Median Response Time</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#a855f7" }}>
                {ofChatStats.medianResponseTimeSec ? duration(ofChatStats.medianResponseTimeSec) : "—"}
              </div>
            </div>
            <div style={{ background: "var(--bg)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Total Chats</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
                {ofChatStats.totalChats.toLocaleString()}
              </div>
            </div>
            <div style={{ background: "var(--bg)", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 4 }}>Unread Chats</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: ofChatStats.unreadChats > 0 ? "#ef4444" : "#22c55e" }}>
                {ofChatStats.unreadChats.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "var(--surface)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1300 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => onSort(c.key)}
                    style={{
                      textAlign: c.align || "right",
                      padding: "10px 10px",
                      fontSize: 12,
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.label} {sortGlyph(c.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!metrics ? (
                <tr><td colSpan={columns.length} style={emptyStyle}>Loading...</td></tr>
              ) : sortedRows.length === 0 ? (
                <tr><td colSpan={columns.length} style={emptyStyle}>No rows for this import.</td></tr>
              ) : (
                sortedRows.map((row: any, i: number) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)", background: i % 2 ? "rgba(0,0,0,0.015)" : "transparent" }}>
                    {columns.map((c) => {
                      const value = row[c.key];
                      const formatted = c.render ? c.render(value) : String(value ?? "-");
                      const highlight = KEY_METRICS.includes(c.key)
                        ? bestWorst[c.key]?.bestId === row.id
                          ? "best"
                          : bestWorst[c.key]?.worstId === row.id
                          ? "worst"
                          : null
                        : null;

                      return (
                        <td
                          key={c.key}
                          style={{
                            padding: "10px",
                            textAlign: c.align || "right",
                            color:
                              highlight === "best"
                                ? "var(--green)"
                                : highlight === "worst"
                                ? "var(--red)"
                                : "var(--text-secondary)",
                            fontWeight: c.key === "chatterName" || highlight ? 600 : 400,
                            whiteSpace: c.key === "chatterName" ? "normal" : "nowrap",
                            background:
                              highlight === "best"
                                ? "var(--green-bg)"
                                : highlight === "worst"
                                ? "var(--red-bg)"
                                : "transparent",
                          }}
                        >
                          {formatted}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase" }}>
        {emoji} {label}
      </div>
      <div style={{ fontSize: 24, color: "var(--text)", fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg)",
  color: "var(--text)",
};

const emptyStyle: React.CSSProperties = {
  padding: "24px",
  color: "var(--text-muted)",
  textAlign: "center",
};

function money(value: any): string {
  const n = Number(value || 0);
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: any): string {
  const n = Number(value || 0);
  return `${n.toFixed(1)}%`;
}

function int(value: any): string {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : "0";
}

function duration(value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  const sec = Math.round(Number(value));
  if (!Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
