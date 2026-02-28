"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import DateRangePicker, { DateRange } from "../../../components/DateRangePicker";
import TrackingLinksCard from "./TrackingLinksCard";

const CREATOR_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#a855f7",
];

function toDateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e1e1e", border: "1px solid #333", borderRadius: "8px",
      padding: "10px 14px", fontSize: "12px", color: "#fff",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    }}>
      <div style={{ color: "#a0a0a0", marginBottom: "4px" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: p.color }} />
          <span>{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "24px",
      border: "1px solid #2a2a2a", ...style,
    }}>
      {children}
    </div>
  );
}

export default function ManagerDashboardPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);

  // Default range: last 7 days
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(6));

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const trendPeriod = useMemo((): "7d" | "30d" | "90d" => {
    // Derive trend period from date range span
    const start = new Date(dateRange.start + "T00:00:00");
    const end = new Date(dateRange.end + "T23:59:59");
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    return "90d";
  }, [dateRange]);

  const subscriberStats = useQuery(
    api.crm.managerDashboard.getSubscriberStats,
    token ? { token, startDate: dateRange.start, endDate: dateRange.end } : "skip"
  );

  const subTrends = useQuery(
    api.crm.managerDashboard.getSubTrends,
    token ? { token, period: trendPeriod } : "skip"
  );

  const chartData = useMemo(() => {
    if (!subTrends?.dataPoints) return [];
    return subTrends.dataPoints.map((dp: any) => ({
      date: new Date(dp.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      }),
      "New Subs": dp.newSubs,
    }));
  }, [subTrends]);

  if (!user) return null;
  if (user.role !== "marketing_manager" && user.role !== "admin") {
    return (
      <div style={{ padding: 24, color: "var(--text)" }}>
        🔒 This dashboard is for marketing managers only.
      </div>
    );
  }

  const accounts = subscriberStats?.accounts || [];
  const totals = subscriberStats?.totals || { newSubsInRange: 0 };
  const rangeLabelText = `${new Date(dateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(dateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "28px", flexWrap: "wrap", gap: "16px",
      }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#fff", margin: 0 }}>
            {getGreeting()}, {user.name || "Manager"}! 📊
          </h1>
          <p style={{ fontSize: "14px", color: "#a0a0a0", marginTop: "6px", margin: 0 }}>
            Acquisition metrics for your creators
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Summary Card — New Subs in Range */}
      <div style={{ marginBottom: "24px" }}>
        <Card>
          <div style={{
            fontSize: "11px", color: "#a0a0a0", fontWeight: "500",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px",
          }}>
            🆕 New Subscribers ({rangeLabelText})
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#f1ae38" }}>
            {totals.newSubsInRange.toLocaleString()}
          </div>
        </Card>
      </div>

      {/* New Subs Per Creator Table */}
      <Card style={{ marginBottom: "24px", overflowX: "auto" }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          New Subscribers Per Creator
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "400px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {["Creator", "New Subs"].map((h) => (
                <th key={h} style={{ padding: "12px 10px", fontSize: "12px", color: "#a0a0a0", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ padding: "24px", textAlign: "center", color: "#666", fontSize: "13px" }}>
                  No creators assigned
                </td>
              </tr>
            ) : (
              accounts.map((row: any, i: number) => (
                <tr key={row.accountId} style={{ borderBottom: "1px solid #242424" }}>
                  <td style={{ padding: "12px 10px", color: "#fff", fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "10px", height: "10px", borderRadius: "3px",
                        background: CREATOR_COLORS[i % CREATOR_COLORS.length], flexShrink: 0,
                      }} />
                      {row.creatorName}
                    </div>
                  </td>
                  <td style={{ padding: "12px 10px", color: "#fff", fontWeight: 600, fontSize: "16px" }}>{row.newSubsInRange}</td>
                </tr>
              ))
            )}
            {accounts.length > 1 && (
              <tr style={{ borderTop: "2px solid #333" }}>
                <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700, fontSize: "16px" }}>
                  {accounts.reduce((s: number, r: any) => s + r.newSubsInRange, 0)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Daily Sub Trend Chart */}
      <Card style={{ marginBottom: "24px" }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          Daily New Subscribers — Last {trendPeriod === "7d" ? "7" : trendPeriod === "30d" ? "30" : "90"} Days
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(241,174,56,0.08)" }} />
              <Bar dataKey="New Subs" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>
            No data available
          </div>
        )}
      </Card>

      {/* Tracking Links */}
      <div style={{ marginBottom: "24px" }}>
        <TrackingLinksCard token={token} isAdmin={user.role === "admin"} />
      </div>
    </div>
  );
}
