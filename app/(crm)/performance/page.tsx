"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";

// ── Period Helpers ──

function getWeekRange(offset: number = 0): { start: string; end: string; label: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().split("T")[0],
    end: sunday.toISOString().split("T")[0],
    label: offset === 0 ? "This Week" : "Last Week",
  };
}

function getMonthRange(offset: number = 0): { start: string; end: string; label: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
    label: offset === 0 ? "This Month" : "Last Month",
  };
}

type SortKey = "chatterName" | "shiftCount" | "totalHours" | "totalBreakHours" | "netWorkHours" | "reportCount" | "totalSales" | "salesPerHour" | "attendanceRate";

const PERIOD_OPTIONS = [
  { key: "this_week", ...getWeekRange(0) },
  { key: "last_week", ...getWeekRange(-1) },
  { key: "this_month", ...getMonthRange(0) },
  { key: "last_month", ...getMonthRange(-1) },
];

export default function PerformancePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [periodKey, setPeriodKey] = useState("this_week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalSales");
  const [sortAsc, setSortAsc] = useState(false);
  const [performance, setPerformance] = useState<any[] | null>(null);
  const [dailySales, setDailySales] = useState<any[] | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isAdmin = user && ["admin", "manager", "supervisor"].includes(user.role);

  const dateRange = useMemo(() => {
    if (periodKey === "custom") {
      return { start: customStart, end: customEnd };
    }
    const p = PERIOD_OPTIONS.find((o) => o.key === periodKey);
    return p ? { start: p.start, end: p.end } : { start: "", end: "" };
  }, [periodKey, customStart, customEnd]);

  // Fetch performance data
  useEffect(() => {
    if (!token || !dateRange.start || !dateRange.end) return;

    async function fetchPerformance() {
      // TODO: Implement full performance aggregation server-side
      // Best effort: query crm_shifts and crm_sales_reports for period, aggregate client-side

      // Get all chatters
      const { data: chatters } = await supabase
        .from("crm_chatters")
        .select("id, name, avatar_emoji, profile_picture_url");

      // Get shifts in range
      const { data: shifts } = await supabase
        .from("crm_shifts")
        .select("*")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end);

      // Get sales reports in range
      const { data: reports } = await supabase
        .from("crm_sales_reports")
        .select("*")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end);

      // Count scheduled days for attendance
      const { data: schedules } = await supabase
        .from("crm_schedules")
        .select("chatter_id, date")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end);

      const perfData = (chatters || []).map((c: any) => {
        const chatterShifts = (shifts || []).filter((s: any) => s.chatter_id === c.id);
        const chatterReports = (reports || []).filter((r: any) => r.chatter_id === c.id);
        const scheduledDays = (schedules || []).filter((s: any) => s.chatter_id === c.id).length;

        const totalMinutes = chatterShifts.reduce((s: number, sh: any) => s + (sh.total_minutes || 0), 0);
        const totalBreakMinutes = chatterShifts.reduce((s: number, sh: any) => s + (sh.total_break_minutes || 0), 0);
        const totalHours = parseFloat((totalMinutes / 60).toFixed(1));
        const totalBreakHours = parseFloat((totalBreakMinutes / 60).toFixed(1));
        const netWorkHours = parseFloat(((totalMinutes - totalBreakMinutes) / 60).toFixed(1));
        const totalSales = chatterReports.reduce((s: number, r: any) => s + (r.total_sales || 0), 0);
        const salesPerHour = netWorkHours > 0 ? parseFloat((totalSales / netWorkHours).toFixed(2)) : 0;
        const workedDays = new Set(chatterShifts.map((s: any) => s.date)).size;
        const attendanceRate = scheduledDays > 0 ? Math.round((workedDays / scheduledDays) * 100) : 0;

        return {
          chatterId: c.id,
          chatterName: c.name,
          avatarEmoji: c.avatar_emoji,
          profilePictureUrl: c.profile_picture_url,
          shiftCount: chatterShifts.length,
          totalHours,
          totalBreakHours,
          netWorkHours,
          reportCount: chatterReports.length,
          totalSales,
          salesPerHour,
          attendanceRate,
        };
      }).filter((p: any) => p.shiftCount > 0 || p.reportCount > 0);

      setPerformance(perfData);
    }

    async function fetchDailySales() {
      const { data: reports } = await supabase
        .from("crm_sales_reports")
        .select("date, total_sales")
        .gte("date", dateRange.start)
        .lte("date", dateRange.end)
        .order("date");

      // Aggregate by date
      const dateMap = new Map<string, number>();
      for (const r of (reports || [])) {
        dateMap.set(r.date, (dateMap.get(r.date) || 0) + (r.total_sales || 0));
      }

      setDailySales(
        Array.from(dateMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, sales]) => ({ date, sales }))
      );
    }

    fetchPerformance();
    fetchDailySales();
  }, [token, dateRange.start, dateRange.end]);

  // Sort performance data
  const sortedPerformance = useMemo(() => {
    if (!performance) return [];
    const sorted = [...performance].sort((a: any, b: any) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string") {
        return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [performance, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const totalSales = sortedPerformance.reduce((s, p) => s + p.totalSales, 0);
  const totalHours = sortedPerformance.reduce((s, p) => s + p.netWorkHours, 0);
  const totalReports = sortedPerformance.reduce((s, p) => s + p.reportCount, 0);
  const avgSalesPerHour = totalHours > 0 ? totalSales / totalHours : 0;

  // Daily sales chart
  const maxDailySales = dailySales ? Math.max(...dailySales.map((d) => d.sales), 1) : 1;

  if (!user) return null;
  if (!isAdmin) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>Access Denied</h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Admin or supervisor access required</p>
      </div>
    );
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span style={{ opacity: 0.3, fontSize: "10px" }}>⇅</span>;
    return <span style={{ fontSize: "10px" }}>{sortAsc ? "↑" : "↓"}</span>;
  };

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>📈 Performance</h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          Team performance metrics and analytics
        </p>
      </div>

      {/* Period Selector */}
      <div style={{
        display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px", flexWrap: "wrap",
      }}>
        {PERIOD_OPTIONS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodKey(p.key)}
            style={{
              padding: "8px 18px", fontSize: "13px", fontWeight: "600",
              color: periodKey === p.key ? "#fff" : "var(--text-secondary)",
              background: periodKey === p.key ? "var(--accent)" : "var(--surface)",
              border: periodKey === p.key ? "none" : "1px solid var(--border)",
              borderRadius: "20px", cursor: "pointer", transition: "all 0.15s",
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
            borderRadius: "20px", cursor: "pointer", transition: "all 0.15s",
          }}
        >
          Custom
        </button>
        {periodKey === "custom" && (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              style={dateInputStyle}
            />
            <span style={{ color: "var(--text-muted)" }}>→</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              style={dateInputStyle}
            />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "14px", marginBottom: "24px",
      }}>
        {[
          { label: "Total Sales", value: `$${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, emoji: "💰", color: "var(--accent)" },
          { label: "Net Work Hours", value: `${totalHours.toFixed(1)}h`, emoji: "⏱️", color: "#22c55e" },
          { label: "Avg $/Hour", value: `$${avgSalesPerHour.toFixed(2)}`, emoji: "📊", color: "#8b5cf6" },
          { label: "Reports", value: String(totalReports), emoji: "📝", color: "#f59e0b" },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: "var(--surface)", borderRadius: "20px", padding: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "18px" }}>{stat.emoji}</span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stat.label}</span>
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Daily Sales Chart (CSS bars) */}
      {dailySales && dailySales.length > 0 && (
        <div style={{
          background: "var(--surface)", borderRadius: "20px", padding: "24px",
          marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            📊 Daily Sales Trend
          </h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "140px", paddingBottom: "24px", position: "relative" }}>
            {dailySales.map((d) => {
              const height = maxDailySales > 0 ? (d.sales / maxDailySales) * 100 : 0;
              const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "narrow" });
              const dateNum = new Date(d.date + "T12:00:00").getDate();
              return (
                <div key={d.date} style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
                  justifyContent: "flex-end", height: "100%",
                }}>
                  {d.sales > 0 && (
                    <span style={{ fontSize: "9px", color: "var(--text-muted)", fontWeight: "600" }}>
                      ${d.sales >= 1000 ? `${(d.sales / 1000).toFixed(1)}k` : d.sales.toFixed(0)}
                    </span>
                  )}
                  <div style={{
                    width: "100%", maxWidth: "32px", minHeight: "2px",
                    height: `${Math.max(height, 2)}%`,
                    background: d.sales > 0
                      ? "linear-gradient(180deg, var(--accent), #f1ae38)"
                      : "var(--border)",
                    borderRadius: "4px 4px 0 0",
                    transition: "height 0.3s ease",
                  }} />
                  <span style={{ fontSize: "9px", color: "var(--text-muted)", position: "absolute", bottom: "0" }}>
                    {dailySales.length <= 14 ? `${dayLabel}${dateNum}` : (dateNum % 3 === 1 ? dateNum : "")}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Performance Table */}
      <div style={{
        background: "var(--surface)", borderRadius: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)", overflow: "hidden",
      }}>
        <div style={{ padding: "20px 24px 0" }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            👥 Per-Chatter Performance
          </h2>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)" }}>
                {[
                  { key: "chatterName" as SortKey, label: "Chatter" },
                  { key: "shiftCount" as SortKey, label: "Shifts" },
                  { key: "totalHours" as SortKey, label: "Total Hours" },
                  { key: "totalBreakHours" as SortKey, label: "Break Time" },
                  { key: "netWorkHours" as SortKey, label: "Net Work" },
                  { key: "reportCount" as SortKey, label: "Reports" },
                  { key: "totalSales" as SortKey, label: "Total Sales" },
                  { key: "salesPerHour" as SortKey, label: "$/Hour" },
                  { key: "attendanceRate" as SortKey, label: "Attendance" },
                ].map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      padding: "12px 16px", fontSize: "11px", fontWeight: "700",
                      color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px",
                      textAlign: col.key === "chatterName" ? "left" : "right",
                      cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
                      position: "sticky", top: 0, background: "var(--surface)", zIndex: 1,
                    }}
                  >
                    {col.label} <SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!performance ? (
                <tr>
                  <td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Loading...
                  </td>
                </tr>
              ) : sortedPerformance.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No data for this period
                  </td>
                </tr>
              ) : (
                sortedPerformance.map((p, i) => (
                  <tr key={p.chatterId} style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.015)",
                  }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {p.profilePictureUrl ? (
                          <img
                            src={p.profilePictureUrl}
                            alt={p.chatterName}
                            style={{ width: "28px", height: "28px", borderRadius: "8px", objectFit: "cover" }}
                          />
                        ) : (
                          <span style={{ fontSize: "20px" }}>{p.avatarEmoji}</span>
                        )}
                        <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>{p.chatterName}</span>
                      </div>
                    </td>
                    <td style={cellRight}>{p.shiftCount}</td>
                    <td style={cellRight}>{p.totalHours}h</td>
                    <td style={cellRight}>{p.totalBreakHours}h</td>
                    <td style={{ ...cellRight, fontWeight: "600", color: "var(--green)" }}>{p.netWorkHours}h</td>
                    <td style={cellRight}>{p.reportCount}</td>
                    <td style={{ ...cellRight, fontWeight: "700", color: "var(--accent)" }}>
                      ${p.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...cellRight, fontWeight: "600", color: "#8b5cf6" }}>
                      ${p.salesPerHour.toFixed(2)}
                    </td>
                    <td style={cellRight}>
                      <span style={{
                        padding: "3px 10px", fontSize: "12px", fontWeight: "600",
                        borderRadius: "8px",
                        color: p.attendanceRate >= 80 ? "var(--green)" : p.attendanceRate >= 50 ? "var(--orange)" : "var(--red)",
                        background: p.attendanceRate >= 80 ? "var(--green-bg)" : p.attendanceRate >= 50 ? "var(--orange-bg)" : "var(--red-bg)",
                      }}>
                        {p.attendanceRate}%
                      </span>
                    </td>
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

const cellRight: React.CSSProperties = {
  padding: "14px 16px",
  fontSize: "14px",
  textAlign: "right",
  color: "var(--text-secondary)",
  fontVariantNumeric: "tabular-nums",
};

const dateInputStyle: React.CSSProperties = {
  padding: "6px 12px", fontSize: "13px",
  border: "1px solid var(--border)", borderRadius: "8px",
  background: "var(--surface)", color: "var(--text)", outline: "none",
};
