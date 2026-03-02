"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PIPCard, { type PIPCardPip, type PIPCardChatter, type PipStatus } from "../../../../components/PIPCard";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

const STATUS_OPTIONS: PipStatus[] = ["draft", "active", "completed", "extended", "failed", "cancelled"];

export default function PipsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [filterChatter, setFilterChatter] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const [pipsRaw, setPipsRaw] = useState<any[] | undefined>(undefined);
  const [chattersRaw, setChattersRaw] = useState<any[] | undefined>(undefined);

  useEffect(() => {
    const t = localStorage.getItem("crm_token");
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isSupervisor = isSupervisorRole(user?.role);

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [pipsRes, chattersRes] = await Promise.all([
        supabase.from("crm_coaching_pips").select("*"),
        supabase.from("crm_chatters").select("*"),
      ]);
      if (pipsRes.error) throw pipsRes.error;
      if (chattersRes.error) throw chattersRes.error;
      setPipsRaw(pipsRes.data ?? []);
      setChattersRaw(chattersRes.data ?? []);
    } catch (e) {
      console.error("Failed to load data:", e);
      setPipsRaw([]);
      setChattersRaw([]);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, loadData]);

  const chattersMap = useMemo(() => {
    const map: Record<string, PIPCardChatter> = {};
    if (chattersRaw && Array.isArray(chattersRaw)) {
      for (const c of chattersRaw) {
        map[c.id] = { id: c.id, name: c.name, avatarEmoji: c.avatar_emoji };
      }
    }
    return map;
  }, [chattersRaw]);

  const pips: PIPCardPip[] = useMemo(() => {
    if (!pipsRaw || !Array.isArray(pipsRaw)) return [];
    return pipsRaw.map((p: any) => ({
      id: p.id,
      chatterId: p.chatter_id,
      title: p.title || p.reason || "Performance Improvement Plan",
      status: p.status as PipStatus,
      endDate: p.end_date ? new Date(p.end_date).getTime() : 0,
      milestones: p.milestones || [],
    }));
  }, [pipsRaw]);

  const filteredPips = useMemo(() => {
    return pips.filter((p) => {
      if (filterChatter !== "all" && p.chatterId !== filterChatter) return false;
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      return true;
    });
  }, [pips, filterChatter, filterStatus]);

  const activePips = filteredPips.filter((p) => p.status === "active" || p.status === "draft" || p.status === "extended");
  const completedPips = filteredPips.filter((p) => p.status === "completed" || p.status === "failed" || p.status === "cancelled");

  if (!token) {
    return <div style={{ padding: 32 }}>Loading...</div>;
  }

  if (!isSupervisor) {
    return (
      <div style={{ padding: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>Performance Improvement Plans</h1>
        <p style={{ color: "var(--text-secondary)" }}>Only supervisors can view PIPs.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>Performance Improvement Plans</h1>
        <button
          onClick={() => router.push("/coaching/pips/new")}
          style={{
            padding: "10px 20px",
            background: "var(--primary)",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          + New PIP
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <select
          value={filterChatter}
          onChange={(e) => setFilterChatter(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            minWidth: 180,
          }}
        >
          <option value="all">All Chatters</option>
          {Object.values(chattersMap).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: "8px 12px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            minWidth: 140,
          }}
        >
          <option value="all">All Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Active PIPs */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
          Active PIPs ({activePips.length})
        </h2>
        {activePips.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: 16 }}>No active PIPs.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {activePips.map((pip) => (
              <PIPCard
                key={pip.id}
                pip={pip}
                chatter={chattersMap[pip.chatterId]}
              />
            ))}
          </div>
        )}
      </section>

      {/* Completed/Failed PIPs */}
      <section>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
          Completed / Failed ({completedPips.length})
        </h2>
        {completedPips.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", padding: 16 }}>No completed PIPs.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {completedPips.map((pip) => (
              <PIPCard
                key={pip.id}
                pip={pip}
                chatter={chattersMap[pip.chatterId]}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
