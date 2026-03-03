"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#a855f7",
];

interface Props {
  token: string;
  startDate: string;
  endDate: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().split("T")[0]);
  }
  return out;
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
          <span>{p.name}: {Number(p.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function FollowerGrowthChart({ token, startDate, endDate }: Props) {
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [allSnapshots, setAllSnapshots] = useState<Map<string, any[]>>(new Map());

  useEffect(() => {
    if (!token) return;

    async function fetchAccounts() {
      const { data } = await supabase.from("crm_ig_accounts").select("id,username");
      setAccounts(data || []);
    }

    fetchAccounts();
  }, [token]);

  useEffect(() => {
    if (!token || !accounts || accounts.length === 0) return;

    async function fetchAllSnapshots() {
      const snapshotMap = new Map<string, any[]>();
      const endPlusOne = addDays(endDate, 1);

      await Promise.all(
        accounts!.slice(0, 10).map(async (account) => {
          const { data } = await supabase
            .from("crm_ig_daily_snapshots")
            .select("date,followers")
            .eq("ig_account_id", account.id)
            .gte("date", startDate)
            .lte("date", endPlusOne)
            .order("date");
          snapshotMap.set(account.id, data || []);
        })
      );

      setAllSnapshots(snapshotMap);
    }

    fetchAllSnapshots();
  }, [token, accounts, startDate, endDate]);

  if (!accounts || accounts.length === 0) return null;

  const padded = accounts.slice(0, 10);

  const chartData = useMemo(() => {
    const rowsByDate = new Map<string, any>();
    const dates = enumerateDates(startDate, endDate);

    for (const date of dates) {
      rowsByDate.set(date, {
        date,
        label: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      });
    }

    padded.forEach((account) => {
      const snapshots = allSnapshots.get(account.id) || [];
      const name = account.username || "Account";
      const byDate = new Map(snapshots.map((s: any) => [String(s.date), s]));
      const baseline = Number(byDate.get(startDate)?.followers || 0);

      dates.forEach((date) => {
        const endpoint = addDays(date, 1);
        const endpointRow = byDate.get(endpoint);
        const endpointFollowers = Number(endpointRow?.followers || 0);
        const gained = endpointFollowers - baseline;
        rowsByDate.get(date)![name] = gained;
      });
    });

    return Array.from(rowsByDate.values()).map((r) => ({ ...r, date: r.label }));
  }, [padded, allSnapshots, startDate, endDate]);

  const accountNames = padded.map((a) => a.username || "Account");

  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "24px",
      border: "1px solid #2a2a2a", marginBottom: "24px",
    }}>
      <div style={{
        fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
        textTransform: "uppercase", letterSpacing: "0.5px",
      }}>
        📊 Follower Growth (Snapshot Endpoint Formula)
      </div>
      {chartData.length === 0 ? (
        <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>
          No follower data available for this date range
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: "12px", color: "#a0a0a0" }} />
            {accountNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
