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

  // Fetch accounts
  useEffect(() => {
    if (!token) return;

    async function fetchAccounts() {
      const { data } = await supabase.from("crm_ig_accounts").select("*");
      setAccounts(data || []);
    }

    fetchAccounts();
  }, [token]);

  // Fetch snapshots for all accounts in a single useEffect
  useEffect(() => {
    if (!token || !accounts || accounts.length === 0) return;

    async function fetchAllSnapshots() {
      const snapshotMap = new Map<string, any[]>();

      await Promise.all(
        accounts!.slice(0, 10).map(async (account) => {
          const { data } = await supabase
            .from("crm_ig_daily_snapshots")
            .select("*")
            .eq("ig_account_id", account.id)
            .gte("date", startDate)
            .lte("date", endDate)
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
    const dateMap = new Map<string, any>();

    padded.forEach((account) => {
      const snapshots = allSnapshots.get(account.id);
      if (!snapshots) return;
      const name = account.username || `Account`;

      for (const snap of snapshots) {
        if (!dateMap.has(snap.date)) {
          dateMap.set(snap.date, { date: snap.date });
        }
        const row = dateMap.get(snap.date)!;
        row[name] = snap.followers ?? 0;
      }
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({
      ...row,
      date: new Date(row.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }));
  }, [padded, allSnapshots]);

  const accountNames = padded.map((a) => a.username || `Account`);

  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "24px",
      border: "1px solid #2a2a2a", marginBottom: "24px",
    }}>
      <div style={{
        fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
        textTransform: "uppercase", letterSpacing: "0.5px",
      }}>
        📊 Follower Growth
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
            <Legend
              wrapperStyle={{ fontSize: "12px", color: "#a0a0a0" }}
            />
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
