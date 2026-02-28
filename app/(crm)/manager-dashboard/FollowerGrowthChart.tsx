"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
  const accounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token } : "skip"
  );

  // We need to fetch snapshots for each account. Since we can't do dynamic queries,
  // we'll fetch all snapshots via overview and reconstruct per-account data.
  // Actually, getIgDailySnapshots requires a specific igAccountId, so we fetch per account.
  // But hooks can't be conditional. We'll use a wrapper approach.

  if (!accounts || accounts.length === 0) return null;

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
      <FollowerGrowthChartInner
        token={token}
        startDate={startDate}
        endDate={endDate}
        accounts={accounts}
      />
    </div>
  );
}

function FollowerGrowthChartInner({
  token,
  startDate,
  endDate,
  accounts,
}: {
  token: string;
  startDate: string;
  endDate: string;
  accounts: any[];
}) {
  // Fetch snapshots for up to 10 accounts using individual hooks
  // We always call all 10 hooks to satisfy React's rules of hooks
  const MAX_ACCOUNTS = 10;
  const padded = accounts.slice(0, MAX_ACCOUNTS);

  const s0 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[0] ? { token, igAccountId: padded[0]._id, startDate, endDate } : "skip");
  const s1 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[1] ? { token, igAccountId: padded[1]._id, startDate, endDate } : "skip");
  const s2 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[2] ? { token, igAccountId: padded[2]._id, startDate, endDate } : "skip");
  const s3 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[3] ? { token, igAccountId: padded[3]._id, startDate, endDate } : "skip");
  const s4 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[4] ? { token, igAccountId: padded[4]._id, startDate, endDate } : "skip");
  const s5 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[5] ? { token, igAccountId: padded[5]._id, startDate, endDate } : "skip");
  const s6 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[6] ? { token, igAccountId: padded[6]._id, startDate, endDate } : "skip");
  const s7 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[7] ? { token, igAccountId: padded[7]._id, startDate, endDate } : "skip");
  const s8 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[8] ? { token, igAccountId: padded[8]._id, startDate, endDate } : "skip");
  const s9 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[9] ? { token, igAccountId: padded[9]._id, startDate, endDate } : "skip");

  const allSnapshots = [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9];

  const chartData = useMemo(() => {
    const dateMap = new Map<string, any>();

    padded.forEach((account, i) => {
      const snapshots = allSnapshots[i];
      if (!snapshots) return;
      const name = account.creatorName || account.username || `Account ${i + 1}`;

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
  }, [padded, ...allSnapshots]);

  const accountNames = padded.map((a, i) => a.creatorName || a.username || `Account ${i + 1}`);

  if (chartData.length === 0) {
    return (
      <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>
        No follower data available for this date range
      </div>
    );
  }

  return (
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
  );
}
