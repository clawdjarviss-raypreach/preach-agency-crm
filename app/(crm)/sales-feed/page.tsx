"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type FilterType = "all" | "ppv" | "tip" | "new_sub" | "rebill" | "stream";

const PAGE_SIZE = 50;

const FILTERS: Array<{ key: FilterType; label: string }> = [
  { key: "all", label: "All" },
  { key: "ppv", label: "PPV" },
  { key: "tip", label: "Tips" },
  { key: "new_sub", label: "New Subs" },
  { key: "rebill", label: "Rebills" },
  { key: "stream", label: "Streams" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 10_000) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function typeMeta(type: string) {
  if (type === "tip") return { emoji: "💵", label: "Tip", bg: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (type === "new_sub") return { emoji: "⭐", label: "New Sub", bg: "rgba(59,130,246,0.12)", color: "#3b82f6" };
  if (type === "rebill") return { emoji: "🔄", label: "Rebill", bg: "rgba(34,197,94,0.12)", color: "#22c55e" };
  if (type === "subscription") return { emoji: "⭐", label: "Subscription", bg: "rgba(59,130,246,0.12)", color: "#3b82f6" };
  if (type === "ppv") return { emoji: "📩", label: "PPV / Message", bg: "rgba(168,85,247,0.12)", color: "#a855f7" };
  if (type === "stream") return { emoji: "🎥", label: "Stream", bg: "rgba(244,114,182,0.12)", color: "#f472b6" };
  return { emoji: "💳", label: "Other", bg: "rgba(148,163,184,0.12)", color: "#94a3b8" };
}

export default function SalesFeedPage() {
  const [user, setUser] = useState<any>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [newCount, setNewCount] = useState(0);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const u = localStorage.getItem("crm_user");
    if (u) {
      try { setUser(JSON.parse(u)); } catch { setUser(null); }
    }
  }, []);

  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      let query = supabase
        .from("crm_of_transactions")
        .select("id, account_id, amount, type, fan_id, fan_username, timestamp", { count: "exact" })
        .order("timestamp", { ascending: false })
        .limit(200);

      if (filter !== "all") {
        query = query.eq("type", filter);
      }

      const { data, count, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error("Failed loading sales feed", error);
        setItems([]);
        setTotalCount(0);
      } else {
        setItems(data ?? []);
        setTotalCount(count ?? 0);
      }
      setLoading(false);
    }

    load();

    const channel = supabase
      .channel(`sales-feed-${filter}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "crm_of_transactions" },
        (payload) => {
          const row: any = payload.new;
          if (!row?.id) return;
          if (filter !== "all" && row.type !== filter) return;

          setItems((prev) => {
            const exists = prev.some((p) => p.id === row.id);
            if (exists) return prev;
            return [row, ...prev].slice(0, 200);
          });
          setTotalCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [filter]);

  // Track new items for animation
  useEffect(() => {
    if (!items.length) return;
    const currentIds = new Set<string>(items.map((i: any) => i.id));
    const prevIds = prevIdsRef.current;
    if (prevIds.size > 0) {
      const fresh = items.filter((i: any) => !prevIds.has(i.id));
      if (fresh.length > 0) {
        setNewIds(new Set<string>(fresh.map((i: any) => i.id)));
        const list = listRef.current;
        const atTop = !list || list.scrollTop < 40;
        if (!atTop) setNewCount((c) => c + fresh.length);
      }
    }
    prevIdsRef.current = currentIds;
  }, [items]);

  // Items visible with "load more"
  const visibleItems = useMemo(() => {
    return items.slice(0, visibleCount);
  }, [items, visibleCount]);

  const hasMore = visibleCount < items.length;

  const todayTotal = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.getTime();
    return items
      .filter((i: any) => new Date(i.timestamp).getTime() >= ts)
      .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
  }, [items]);

  const todayCount = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const ts = todayStart.getTime();
    return items.filter((i: any) => new Date(i.timestamp).getTime() >= ts).length;
  }, [items]);

  const onScroll = () => {
    const list = listRef.current;
    if (!list) return;
    if (list.scrollTop < 40) setNewCount(0);
  };

  const scrollToTop = () => {
    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewCount(0);
  };

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + PAGE_SIZE, items.length));
  }, [items.length]);

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter]);

  if (user && !["admin", "manager", "supervisor"].includes(user.role)) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: 24, padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h3 style={{ color: "var(--text)", marginBottom: 8 }}>Access Denied</h3>
        <p style={{ color: "var(--text-secondary)" }}>You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>🔔 Live Sales Feed</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Real-time transactions from OF API • Auto-refreshes via Supabase</p>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: "16px 18px",
        marginBottom: 14,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div style={{ fontSize: 15, color: "var(--text)" }}>
          <strong>Today:</strong>{" "}
          <span style={{ color: "#f1ae38", fontWeight: 700 }}>{formatMoney(todayTotal)}</span>
          <span style={{ color: "var(--text-secondary)" }}> across {todayCount.toLocaleString()} transactions</span>
          <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 12 }}>
            ({totalCount} total in database)
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: active ? "1px solid #f1ae38" : "1px solid var(--border)",
                  background: active ? "rgba(241,174,56,0.15)" : "var(--bg)",
                  color: active ? "#f1ae38" : "var(--text-secondary)",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {newCount > 0 && (
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={scrollToTop}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid rgba(34,197,94,0.45)",
              background: "rgba(34,197,94,0.16)",
              color: "#86efac",
              fontWeight: 700,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {newCount} new transaction{newCount > 1 ? "s" : ""} ↑
          </button>
        </div>
      )}

      <div
        ref={listRef}
        onScroll={onScroll}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          maxHeight: "70vh",
          overflowY: "auto",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 10px" }}>Loading transactions...</div>
        ) : visibleItems.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "30px 10px" }}>No transactions found.</div>
        ) : (
          <>
            {visibleItems.map((txn: any) => {
              const meta = typeMeta(txn.type);
              const fan = txn.fan_username || txn.fan_id || "Unknown";
              const isNew = newIds.has(txn.id);
              const amount = Number(txn.amount || 0);
              const timestampMs = new Date(txn.timestamp).getTime();
              // OF takes 20% platform fee — show estimated net
              const netAmount = amount * 0.8;

              return (
                <div
                  key={txn.id}
                  style={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    padding: "12px 14px",
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: 12,
                    animation: isNew ? "feedIn 420ms ease" : undefined,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: meta.bg, color: meta.color, fontSize: 18,
                  }}>
                    {meta.emoji}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 800, color: "var(--text)", fontSize: 16 }}>{formatMoney(amount)}</span>
                      <span style={{ fontWeight: 500, color: "var(--text-muted)", fontSize: 12 }}>
                        (net ~{formatMoney(netAmount)})
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: meta.color, background: meta.bg,
                        padding: "3px 8px", borderRadius: 999, textTransform: "uppercase",
                      }}>
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      @{fan}
                      {txn.account_id && <span style={{ color: "var(--text-muted)" }}> · {txn.account_id}</span>}
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>{relativeTime(timestampMs)}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 11, whiteSpace: "nowrap", marginTop: 2 }}>{formatTimestamp(timestampMs)}</div>
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <button
                  onClick={loadMore}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  Load More ({items.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes feedIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
