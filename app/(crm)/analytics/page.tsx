"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";

// ── Period Helpers ──

function getToday() {
  const now = new Date();
  const d = now.toISOString().split("T")[0];
  return { start: d, end: d };
}

function getYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const s = d.toISOString().split("T")[0];
  return { start: s, end: s };
}

function getWeekRange(offset: number = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.toISOString().split("T")[0], end: sunday.toISOString().split("T")[0] };
}

function getMonthRange(offset: number = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: start.toISOString().split("T")[0], end: now.toISOString().split("T")[0] };
}

const PERIOD_OPTIONS = [
  { key: "today", label: "Today", ...getToday() },
  { key: "yesterday", label: "Yesterday", ...getYesterday() },
  { key: "this_week", label: "This Week", ...getWeekRange(0) },
  { key: "last_week", label: "Last Week", ...getWeekRange(-1) },
  { key: "this_month", label: "This Month", ...getMonthRange(0) },
  { key: "last_30", label: "Last 30 Days", ...getDaysAgoRange(30) },
  { key: "last_90", label: "Last 90 Days", ...getDaysAgoRange(90) },
];

function getPreviousPeriod(start: string, end: string) {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const durationMs = e.getTime() - s.getTime();
  const prevEnd = new Date(s.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return {
    start: prevStart.toISOString().split("T")[0],
    end: prevEnd.toISOString().split("T")[0],
  };
}

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function formatDelta(current: number, previous: number): { text: string; color: string; arrow: string } {
  if (previous === 0) return { text: "—", color: "var(--text-muted)", arrow: "" };
  const pct = ((current - previous) / previous) * 100;
  const isPos = pct >= 0;
  return {
    text: `${Math.abs(pct).toFixed(1)}%`,
    color: isPos ? "#22c55e" : "#ef4444",
    arrow: isPos ? "▲" : "▼",
  };
}

export default function AnalyticsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [periodKey, setPeriodKey] = useState("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState("");
  const [importError, setImportError] = useState("");
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isAdmin = user && ["admin", "manager"].includes(user.role);

  const dateRange = useMemo(() => {
    if (periodKey === "custom") return { start: customStart, end: customEnd };
    const p = PERIOD_OPTIONS.find((o) => o.key === periodKey);
    return p ? { start: p.start, end: p.end } : { start: "", end: "" };
  }, [periodKey, customStart, customEnd]);

  const prevPeriod = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return { start: "", end: "" };
    return getPreviousPeriod(dateRange.start, dateRange.end);
  }, [dateRange]);

  // ── V2 Queries ──
  const dashboard = useQuery(
    api.crm.analyticsV2.getDashboard,
    token && dateRange.start && dateRange.end
      ? { token, startDate: dateRange.start, endDate: dateRange.end }
      : "skip"
  );

  const prevDashboard = useQuery(
    api.crm.analyticsV2.getDashboard,
    token && prevPeriod.start && prevPeriod.end
      ? { token, startDate: prevPeriod.start, endDate: prevPeriod.end }
      : "skip"
  );

  const trend = useQuery(
    api.crm.analyticsV2.getRevenueTrend,
    token && dateRange.start && dateRange.end
      ? { token, startDate: dateRange.start, endDate: dateRange.end }
      : "skip"
  );

  const creatorBreakdown = useQuery(
    api.crm.analyticsV2.getCreatorBreakdown,
    token && dateRange.start && dateRange.end
      ? { token, startDate: dateRange.start, endDate: dateRange.end }
      : "skip"
  );

  const topFans = useQuery(
    api.crm.analyticsV2.getTopFans,
    token && dateRange.start && dateRange.end
      ? { token, startDate: dateRange.start, endDate: dateRange.end, limit: 20 }
      : "skip"
  );

  const syncStatus = useQuery(
    api.crm.analyticsV2.getSyncStatus,
    token ? { token } : "skip"
  );

  // Legacy: keep import working
  const omImports = useQuery(
    api.crm.analytics.listOMImports,
    token ? { token } : "skip"
  );

  const importOMData = useMutation(api.crm.analytics.importOMData);

  // ── Sync trigger (OF API) ──
  const syncNow = useAction((api as any).crm.ofIntegration.syncNow);
  const handleSync = useCallback(async () => {
    if (!token || syncing) return;
    setSyncing(true);
    try {
      await syncNow({ token, accountId: "acct_f1540df2d1134b7d9c900e34685ee938", endpoint: "earnings" });
    } catch (err) {
      console.error("Sync error:", err);
    } finally {
      setSyncing(false);
    }
  }, [token, syncing, syncNow]);

  // ── Import handler ──
  const handleImportCSV = useCallback(async () => {
    if (!importFile || !token) return;
    setImporting(true);
    setImportError("");
    setImportSuccess("");
    try {
      const text = await importFile.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV file is empty or has no data rows");
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      const records: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const char of lines[i]) {
          if (char === '"') { inQuotes = !inQuotes; continue; }
          if (char === "," && !inQuotes) { values.push(current.trim()); current = ""; continue; }
          current += char;
        }
        values.push(current.trim());
        const record: Record<string, string> = {};
        headers.forEach((h, idx) => { record[h] = values[idx] || ""; });
        records.push(record);
      }
      await importOMData({ token, filename: importFile.name, data: records, recordCount: records.length });
      setImportSuccess(`Imported ${records.length} records from ${importFile.name}`);
      setImportFile(null);
      setShowImport(false);
    } catch (err: any) {
      setImportError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }, [importFile, token, importOMData]);

  // ── Derived data ──
  const maxTrendRevenue = trend
    ? Math.max(...trend.map((d) => d.totalRevenue), 1)
    : 1;

  const totalTypeRevenue = dashboard
    ? dashboard.subscriptionRevenue + dashboard.messageRevenue + dashboard.tipRevenue
    : 0;

  const typeBreakdown = dashboard && totalTypeRevenue > 0
    ? {
        subPct: (dashboard.subscriptionRevenue / totalTypeRevenue) * 100,
        msgPct: (dashboard.messageRevenue / totalTypeRevenue) * 100,
        tipPct: (dashboard.tipRevenue / totalTypeRevenue) * 100,
      }
    : { subPct: 0, msgPct: 0, tipPct: 0 };

  // ── Sync status text ──
  const syncStatusText = useMemo(() => {
    if (!syncStatus?.lastSyncAt) return "Never synced";
    const mins = Math.floor((Date.now() - syncStatus.lastSyncAt) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m ago`;
  }, [syncStatus]);

  if (!user) return null;
  if (!isAdmin) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>Access Denied</h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Admin access required</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* ─── Header ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>📊 Analytics</h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Real-time revenue from OnlyMonster API
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: syncStatus?.creatorsWithErrors ? "#ef4444" : "#22c55e",
            }} />
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Last synced: {syncStatusText}
              {syncStatus ? ` · ${syncStatus.totalTransactionsSynced.toLocaleString()} transactions` : ""}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: "600",
              color: "#fff", background: syncing ? "var(--text-muted)" : "#22c55e",
              border: "none", borderRadius: "12px", cursor: syncing ? "not-allowed" : "pointer",
            }}
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync Now"}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: "600",
              color: "var(--text-secondary)", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: "12px", cursor: "pointer",
            }}
          >
            📁 Import CSV
          </button>
        </div>
      </div>

      {/* ─── Period Selector ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px", flexWrap: "wrap" }}>
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodKey(p.key)}
            style={{
              padding: "8px 18px", fontSize: "13px", fontWeight: "600",
              color: periodKey === p.key ? "#fff" : "var(--text-secondary)",
              background: periodKey === p.key ? "var(--accent)" : "var(--surface)",
              border: periodKey === p.key ? "none" : "1px solid var(--border)",
              borderRadius: "20px", cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPeriodKey("custom")}
          style={{
            padding: "8px 18px", fontSize: "13px", fontWeight: "600",
            color: periodKey === "custom" ? "#fff" : "var(--text-secondary)",
            background: periodKey === "custom" ? "var(--accent)" : "var(--surface)",
            border: periodKey === "custom" ? "none" : "1px solid var(--border)",
            borderRadius: "20px", cursor: "pointer",
          }}
        >
          Custom
        </button>
        {periodKey === "custom" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} style={dateInputStyle} />
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} style={dateInputStyle} />
          </div>
        )}
      </div>

      {/* ─── Import Section ─── */}
      {showImport && (
        <div style={{
          background: "var(--surface)", borderRadius: "20px", padding: "24px",
          marginBottom: "24px", border: "2px solid var(--accent)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            📁 Import OnlyMonster Export
          </h3>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <label style={{
              padding: "10px 20px", fontSize: "13px", fontWeight: "600",
              color: "var(--accent)", background: "rgba(196,149,106,0.1)",
              border: "2px dashed var(--accent)", borderRadius: "12px",
              cursor: "pointer", display: "inline-block",
            }}>
              {importFile ? `📄 ${importFile.name}` : "Choose CSV File..."}
              <input type="file" accept=".csv" onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportError(""); setImportSuccess(""); }} style={{ display: "none" }} />
            </label>
            {importFile && (
              <button onClick={handleImportCSV} disabled={importing} style={{
                padding: "10px 20px", fontSize: "13px", fontWeight: "600",
                color: "#fff", background: importing ? "var(--text-muted)" : "#22c55e",
                border: "none", borderRadius: "12px", cursor: importing ? "not-allowed" : "pointer",
              }}>
                {importing ? "Importing..." : "⬆️ Upload & Import"}
              </button>
            )}
          </div>
          {importError && <div style={{ color: "#ef4444", fontSize: "13px", marginTop: "8px" }}>❌ {importError}</div>}
          {importSuccess && <div style={{ color: "#22c55e", fontSize: "13px", marginTop: "8px" }}>✅ {importSuccess}</div>}
          {omImports && omImports.length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "8px" }}>Import History</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {omImports.slice(0, 5).map((imp: any) => (
                  <div key={imp.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: "var(--bg)", borderRadius: "10px", fontSize: "12px",
                  }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ color: "var(--text)" }}>📄 {imp.filename}</span>
                      <span style={{ color: "var(--text-muted)" }}>{imp.recordCount} records</span>
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                      {new Date(imp.importedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" by "}{imp.importedByName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── KPI Cards Row 1: Revenue ─── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "14px", marginBottom: "14px",
      }}>
        {[
          { label: "Total Revenue", value: dashboard?.totalRevenue, prev: prevDashboard?.totalRevenue, emoji: "💰", color: "var(--accent)" },
          { label: "Sales (PPV)", value: dashboard?.messageRevenue, prev: prevDashboard?.messageRevenue, emoji: "📨", color: "#f59e0b" },
          { label: "Subscriptions", value: dashboard?.subscriptionRevenue, prev: prevDashboard?.subscriptionRevenue, emoji: "🔄", color: "#3b82f6" },
          { label: "Tips", value: dashboard?.tipRevenue, prev: prevDashboard?.tipRevenue, emoji: "💝", color: "#22c55e" },
          { label: "Chargebacks", value: dashboard?.chargebackAmount, prev: prevDashboard?.chargebackAmount, emoji: "📉", color: "#ef4444", invert: true },
        ].map((stat) => {
          const delta = stat.value !== undefined && stat.prev !== undefined
            ? formatDelta(stat.value, stat.prev)
            : null;
          return (
            <div key={stat.label} style={{
              background: "var(--surface)", borderRadius: "20px", padding: "20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "18px" }}>{stat.emoji}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: "26px", fontWeight: "700", color: stat.color }}>
                {stat.value !== undefined
                  ? ((stat as any).invert ? `-${formatCurrency(stat.value)}` : formatCurrency(stat.value))
                  : "..."}
              </div>
              {delta && delta.text !== "—" && (
                <div style={{ fontSize: "12px", color: (stat as any).invert ? (delta.arrow === "▲" ? "#ef4444" : "#22c55e") : delta.color, marginTop: "4px", fontWeight: "600" }}>
                  {delta.arrow} {delta.text} vs prev
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── KPI Cards Row 2: Fan Metrics ─── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "14px", marginBottom: "24px",
      }}>
        {[
          {
            label: "Unique Spenders",
            value: dashboard?.uniqueSpenders !== undefined ? String(dashboard.uniqueSpenders) : "...",
            prev: prevDashboard?.uniqueSpenders,
            current: dashboard?.uniqueSpenders,
            emoji: "👥", color: "#8b5cf6",
          },
          {
            label: "APC (Avg/Customer)",
            value: dashboard?.avgPerCustomer !== undefined ? `$${dashboard.avgPerCustomer.toFixed(2)}` : "...",
            prev: prevDashboard?.avgPerCustomer,
            current: dashboard?.avgPerCustomer,
            emoji: "💵", color: "var(--accent)",
          },
          {
            label: "Transactions",
            value: dashboard?.totalTransactions !== undefined ? String(dashboard.totalTransactions) : "...",
            prev: prevDashboard?.totalTransactions,
            current: dashboard?.totalTransactions,
            emoji: "📊", color: "#06b6d4",
          },
          {
            label: "ARPPU",
            value: dashboard?.avgPerCustomer !== undefined ? `$${dashboard.avgPerCustomer.toFixed(2)}` : "...",
            prev: prevDashboard?.avgPerCustomer,
            current: dashboard?.avgPerCustomer,
            emoji: "💎", color: "#f59e0b",
          },
        ].map((stat) => {
          const delta = stat.current !== undefined && stat.prev !== undefined
            ? formatDelta(stat.current, stat.prev)
            : null;
          return (
            <div key={stat.label} style={{
              background: "var(--surface)", borderRadius: "20px", padding: "20px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "18px" }}>{stat.emoji}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: "26px", fontWeight: "700", color: stat.color }}>{stat.value}</div>
              {delta && delta.text !== "—" && (
                <div style={{ fontSize: "12px", color: delta.color, marginTop: "4px", fontWeight: "600" }}>
                  {delta.arrow} {delta.text} vs prev
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Revenue Trend Chart ─── */}
      {trend && trend.length > 0 && (
        <div style={{
          background: "var(--surface)", borderRadius: "20px", padding: "24px",
          marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>
            📈 Revenue Trend
          </h2>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginRight: "12px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#3b82f6", display: "inline-block" }} />
              Subs
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", marginRight: "12px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f59e0b", display: "inline-block" }} />
              PPV/Messages
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#22c55e", display: "inline-block" }} />
              Tips
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: "180px", paddingBottom: "28px", position: "relative" }}>
            {trend.map((d, i) => {
              const total = d.subscriptionRevenue + d.messageRevenue + d.tipRevenue;
              const totalHeight = maxTrendRevenue > 0 ? (total / maxTrendRevenue) * 100 : 0;
              const subH = total > 0 ? (d.subscriptionRevenue / total) * totalHeight : 0;
              const msgH = total > 0 ? (d.messageRevenue / total) * totalHeight : 0;
              const tipH = total > 0 ? (d.tipRevenue / total) * totalHeight : 0;
              const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" });
              const dateNum = new Date(d.date + "T12:00:00").getDate();

              return (
                <div key={d.date} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "flex-end", height: "100%", position: "relative",
                }} title={`${d.date}: $${total.toFixed(2)} (Subs: $${d.subscriptionRevenue.toFixed(0)}, PPV: $${d.messageRevenue.toFixed(0)}, Tips: $${d.tipRevenue.toFixed(0)})`}>
                  {total > 0 && (
                    <span style={{ fontSize: "8px", color: "var(--text-muted)", fontWeight: "600", marginBottom: "2px" }}>
                      {formatCurrency(total)}
                    </span>
                  )}
                  <div style={{ width: "100%", maxWidth: "28px", display: "flex", flexDirection: "column" }}>
                    {/* Tips (top) */}
                    <div style={{
                      width: "100%", height: `${Math.max(tipH, total > 0 ? 1 : 0)}%`,
                      background: "#22c55e", borderRadius: "3px 3px 0 0", minHeight: tipH > 0 ? "2px" : "0",
                    }} />
                    {/* Messages (middle) */}
                    <div style={{
                      width: "100%", height: `${Math.max(msgH, total > 0 ? 1 : 0)}%`,
                      background: "#f59e0b", minHeight: msgH > 0 ? "2px" : "0",
                    }} />
                    {/* Subscriptions (bottom) */}
                    <div style={{
                      width: "100%", height: `${Math.max(subH, total > 0 ? 1 : 0)}%`,
                      background: "#3b82f6", borderRadius: "0 0 3px 3px",
                      minHeight: total > 0 ? "2px" : "2px",
                    }} />
                  </div>
                  <span style={{
                    fontSize: "8px", color: "var(--text-muted)", position: "absolute", bottom: "-20px",
                  }}>
                    {trend.length <= 14 ? `${dayLabel}${dateNum}` : (i % 3 === 0 ? dateNum : "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Two columns: Creator Breakdown + Revenue Donut / Top Fans ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "24px" }}>

        {/* Creator Breakdown 3×2 grid */}
        <div style={{
          background: "var(--surface)", borderRadius: "20px", padding: "24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            👤 Creator Breakdown
          </h2>
          {!creatorBreakdown ? (
            <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>Loading...</p>
          ) : creatorBreakdown.length === 0 ? (
            <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>No data for this period</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
              {creatorBreakdown.map((c) => {
                const total = c.subscriptionRevenue + c.messageRevenue + c.tipRevenue;
                const subPct = total > 0 ? (c.subscriptionRevenue / total) * 100 : 0;
                const msgPct = total > 0 ? (c.messageRevenue / total) * 100 : 0;
                const tipPct = total > 0 ? (c.tipRevenue / total) * 100 : 0;

                return (
                  <div key={c.creatorId} style={{
                    padding: "16px", background: "var(--bg)", borderRadius: "16px",
                    border: "1px solid var(--border)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt="" style={{ width: "36px", height: "36px", borderRadius: "10px", objectFit: "cover" }} />
                      ) : (
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "10px",
                          background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "16px", color: "#fff", fontWeight: "700",
                        }}>
                          {c.creatorName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>{c.creatorName}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{c.transactionCount} txns · {c.uniqueFans} fans</div>
                      </div>
                    </div>
                    <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--accent)", marginBottom: "8px" }}>
                      {formatCurrency(c.totalRevenue)}
                    </div>
                    {/* Stacked bar */}
                    <div style={{ height: "8px", borderRadius: "4px", overflow: "hidden", display: "flex", marginBottom: "6px" }}>
                      <div style={{ width: `${subPct}%`, background: "#3b82f6", minWidth: subPct > 0 ? "2px" : "0" }} />
                      <div style={{ width: `${msgPct}%`, background: "#f59e0b", minWidth: msgPct > 0 ? "2px" : "0" }} />
                      <div style={{ width: `${tipPct}%`, background: "#22c55e", minWidth: tipPct > 0 ? "2px" : "0" }} />
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", display: "flex", gap: "8px" }}>
                      <span>S:{subPct.toFixed(0)}%</span>
                      <span>M:{msgPct.toFixed(0)}%</span>
                      <span>T:{tipPct.toFixed(0)}%</span>
                    </div>
                    {c.chargebackAmount > 0 && (
                      <div style={{ fontSize: "10px", color: "#ef4444", marginTop: "4px" }}>
                        CB: -${c.chargebackAmount.toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Donut + Top Fans */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Revenue Type Donut */}
          <div style={{
            background: "var(--surface)", borderRadius: "20px", padding: "24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
              Revenue by Type
            </h2>
            {totalTypeRevenue > 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                {/* CSS Donut */}
                <div style={{
                  width: "120px", height: "120px", borderRadius: "50%", flexShrink: 0,
                  background: `conic-gradient(
                    #3b82f6 0% ${typeBreakdown.subPct}%,
                    #f59e0b ${typeBreakdown.subPct}% ${typeBreakdown.subPct + typeBreakdown.msgPct}%,
                    #22c55e ${typeBreakdown.subPct + typeBreakdown.msgPct}% 100%
                  )`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <div style={{
                    width: "70px", height: "70px", borderRadius: "50%",
                    background: "var(--surface)", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: "12px", fontWeight: "700", color: "var(--text)",
                  }}>
                    {formatCurrency(totalTypeRevenue)}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#3b82f6" }} />
                    <span style={{ color: "var(--text)" }}>Subs {typeBreakdown.subPct.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#f59e0b" }} />
                    <span style={{ color: "var(--text)" }}>PPV {typeBreakdown.msgPct.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                    <div style={{ width: "10px", height: "10px", borderRadius: "2px", background: "#22c55e" }} />
                    <span style={{ color: "var(--text)" }}>Tips {typeBreakdown.tipPct.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>No revenue data</p>
            )}
          </div>

          {/* Top Fans */}
          <div style={{
            background: "var(--surface)", borderRadius: "20px", padding: "24px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)", flex: 1,
          }}>
            <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "12px" }}>
              🏆 Top Fans
            </h2>
            {!topFans || topFans.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>No fan data</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "260px", overflow: "auto" }}>
                {topFans.slice(0, 10).map((fan, i) => (
                  <div key={fan.fanId} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 10px", background: "var(--bg)", borderRadius: "10px", fontSize: "12px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: "700", color: i < 3 ? "var(--accent)" : "var(--text-muted)", fontSize: "13px" }}>
                        {i + 1}.
                      </span>
                      <span style={{ color: "var(--text)" }}>Fan #{fan.fanId.slice(-6)}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>{fan.transactionCount} txns</span>
                    </div>
                    <span style={{ fontWeight: "700", color: "var(--accent)" }}>
                      ${fan.totalSpent.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const dateInputStyle: React.CSSProperties = {
  padding: "6px 12px", fontSize: "13px",
  border: "1px solid var(--border)", borderRadius: "8px",
  background: "var(--surface)", color: "var(--text)", outline: "none",
};
