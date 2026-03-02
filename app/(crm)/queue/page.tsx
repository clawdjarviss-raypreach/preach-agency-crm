"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import QueueFilters, {
  type QueueFiltersState,
  type QueuePriorityFilter,
  type QueueStatusFilter,
} from "../../../components/QueueFilters";
import QueueItemCard, {
  type QueueItemLike,
  type QueuePriority,
} from "../../../components/QueueItemCard";
import QueueStatsBar from "../../../components/QueueStatsBar";

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  const html = el as HTMLElement;
  return html.isContentEditable;
}

type CreatorListItem = { id: string; name: string };
type ChatterListItem = { id: string; name: string };

type SortKey = "wait" | "priority" | "received";

type SortState = {
  key: SortKey;
  dir: "asc" | "desc";
};

function priorityRank(p: QueuePriorityFilter): number {
  switch (p) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "normal":
      return 1;
    case "low":
    default:
      return 0;
  }
}

function computeWaitSec(item: { receivedAt: number; respondedAt?: number }, nowMs: number): number {
  const end = item.respondedAt ?? nowMs;
  return Math.max(0, Math.floor((end - item.receivedAt) / 1000));
}

function startOfDayMs(yyyyMmDd: string): number | null {
  if (!yyyyMmDd) return null;
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function endOfDayMs(yyyyMmDd: string): number | null {
  if (!yyyyMmDd) return null;
  const d = new Date(`${yyyyMmDd}T23:59:59.999`);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function normalizeQueueItem(raw: any): QueueItemLike {
  return {
    ...raw,
    _id: String(raw.id),
    creatorId: String(raw.creator_id),
    chatterId: raw.chatter_id ? String(raw.chatter_id) : undefined,
    originalChatterId: raw.original_chatter_id ? String(raw.original_chatter_id) : undefined,
    escalatedTo: raw.escalated_to ? String(raw.escalated_to) : undefined,
    fanUsername: raw.fan_username,
    fanDisplayName: raw.fan_display_name,
    fanSegment: raw.fan_segment,
    fanSpendTier: raw.fan_spend_tier,
    messagePreview: raw.message_preview,
    messageType: raw.message_type,
    priority: raw.priority,
    status: raw.status,
    receivedAt: new Date(raw.received_at).getTime(),
    firstViewedAt: raw.first_viewed_at ? new Date(raw.first_viewed_at).getTime() : undefined,
    respondedAt: raw.responded_at ? new Date(raw.responded_at).getTime() : undefined,
    waitTimeSec: raw.wait_time_sec,
    handleTimeSec: raw.handle_time_sec,
    escalatedAt: raw.escalated_at ? new Date(raw.escalated_at).getTime() : undefined,
    escalationReason: raw.escalation_reason,
    source: raw.source,
    notes: raw.notes,
    tags: raw.tags,
  } as QueueItemLike;
}

export default function SupervisorQueuePage() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const isSupervisor = !!user && ["admin", "manager", "supervisor"].includes(user.role);

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastRefreshAtRef = useRef<number>(Date.now());

  // Data state
  const [items, setItems] = useState<QueueItemLike[] | undefined>(undefined);
  const [creators, setCreators] = useState<CreatorListItem[] | undefined>(undefined);
  const [chatters, setChatters] = useState<ChatterListItem[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [queueRes, creatorsRes, chattersRes] = await Promise.all([
        supabase
          .from("crm_message_queue")
          .select("*")
          .order("received_at", { ascending: false })
          .limit(200),
        supabase
          .from("crm_creators")
          .select("*")
          .eq("status", "active"),
        isSupervisor
          ? supabase.from("crm_chatters").select("*")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (queueRes.data) {
        setItems(queueRes.data.map(normalizeQueueItem));
      }
      if (creatorsRes.data) {
        setCreators(creatorsRes.data.map((c: any) => ({ id: c.id, name: c.name })));
      }
      if (chattersRes.data) {
        setChatters(chattersRes.data.map((c: any) => ({ id: c.id, name: c.name })));
      }
    } catch (err) {
      console.error("Failed to fetch queue data:", err);
    } finally {
      setLoading(false);
    }
  }, [token, isSupervisor]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const refreshNow = useCallback(() => {
    lastRefreshAtRef.current = Date.now();
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const t = setInterval(() => {
      refreshNow();
    }, 10_000);
    return () => clearInterval(t);
  }, [autoRefreshEnabled, refreshNow]);

  const [filters, setFilters] = useState<QueueFiltersState>(() => ({
    statuses: ["pending", "in_progress", "escalated"],
    priorities: ["critical", "high", "normal", "low"],
    creatorId: "all",
    chatterId: "all",
    startDate: "",
    endDate: "",
  }));

  const [sort, setSort] = useState<SortState>({ key: "wait", dir: "desc" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      if (prev[id] === busy) return prev;
      return { ...prev, [id]: busy };
    });
  }, []);

  const claimMessage = useCallback(async (queueId: string) => {
    const { error } = await supabase
      .from("crm_message_queue")
      .update({ status: "in_progress", chatter_id: user?.id })
      .eq("id", queueId);
    if (error) throw error;
    refreshNow();
  }, [user?.id, refreshNow]);

  const escalateMessage = useCallback(async (queueId: string, reason: string, escalateTo?: string) => {
    const { error } = await supabase
      .from("crm_message_queue")
      .update({
        status: "escalated",
        escalation_reason: reason,
        escalated_to: escalateTo || null,
        escalated_at: new Date().toISOString(),
      })
      .eq("id", queueId);
    if (error) throw error;
    refreshNow();
  }, [refreshNow]);

  const resolveMessage = useCallback(async (queueId: string) => {
    const { error } = await supabase
      .from("crm_message_queue")
      .update({ status: "responded", responded_at: new Date().toISOString() })
      .eq("id", queueId);
    if (error) throw error;
    refreshNow();
  }, [refreshNow]);

  const resetFilters = useCallback(() => {
    setFilters({
      statuses: ["pending", "in_progress", "escalated"],
      priorities: ["critical", "high", "normal", "low"],
      creatorId: "all",
      chatterId: "all",
      startDate: "",
      endDate: "",
    });
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const bulkClaim = useCallback(async () => {
    if (!token) return;
    if (selectedIds.length === 0) return;

    for (const id of selectedIds) {
      setBusy(id, true);
      try {
        await claimMessage(id);
      } catch (err) {
        console.error(err);
      } finally {
        setBusy(id, false);
      }
    }
  }, [claimMessage, selectedIds, setBusy, token]);

  const bulkEscalate = useCallback(async () => {
    if (!token) return;
    if (selectedIds.length === 0) return;

    const reason = window.prompt("Escalation reason (applies to all selected items):", "Needs supervisor attention");
    if (!reason || !reason.trim()) return;

    const escalateTo = user?.id ? String(user.id) : undefined;

    for (const id of selectedIds) {
      setBusy(id, true);
      try {
        await escalateMessage(id, reason.trim(), escalateTo);
      } catch (err) {
        console.error(err);
      } finally {
        setBusy(id, false);
      }
    }
  }, [escalateMessage, selectedIds, setBusy, token, user?.id]);

  const bulkResolve = useCallback(async () => {
    if (!token) return;
    if (selectedIds.length === 0) return;

    if (!window.confirm(`Resolve ${selectedIds.length} selected item(s)?`)) return;

    for (const id of selectedIds) {
      setBusy(id, true);
      try {
        await resolveMessage(id);
      } catch (err) {
        console.error(err);
      } finally {
        setBusy(id, false);
      }
    }
  }, [resolveMessage, selectedIds, setBusy, token]);

  // Keyboard shortcuts: R refresh, C claim selected, E escalate selected.
  useEffect(() => {
    if (!isSupervisor) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableElement(document.activeElement)) return;

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        refreshNow();
      }
      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        void bulkClaim();
      }
      if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        void bulkEscalate();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bulkClaim, bulkEscalate, isSupervisor, refreshNow]);

  if (!user) {
    return (
      <div style={{ maxWidth: 1400, padding: 24 }}>
        <div style={{ background: "var(--surface)", borderRadius: 24, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>Loading…</h3>
        </div>
      </div>
    );
  }

  if (!isSupervisor) {
    return (
      <div style={{ maxWidth: 1400, padding: 24 }}>
        <div style={{ background: "var(--surface)", borderRadius: 24, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>Access Denied</h3>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 10 }}>
            Supervisor/admin access required to view the queue dashboard.
          </p>
        </div>
      </div>
    );
  }

  const creatorsList: CreatorListItem[] = creators ?? [];
  const chattersList: ChatterListItem[] = chatters ?? [];

  const creatorsById = creatorsList.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  const chattersById = chattersList.reduce<Record<string, string>>((acc, c) => {
    acc[c.id] = c.name;
    return acc;
  }, {});

  const all = (items ?? []) as QueueItemLike[];

  const startMs = startOfDayMs(filters.startDate);
  const endMs_ = endOfDayMs(filters.endDate);

  const selectedStatuses = new Set<QueueStatusFilter>(filters.statuses);
  const selectedPriorities = new Set<QueuePriorityFilter>(filters.priorities);

  const filtered = all.filter((it) => {
    const statusOk = selectedStatuses.size === 0 ? true : selectedStatuses.has(it.status as any);
    if (!statusOk) return false;

    const priOk = selectedPriorities.size === 0 ? true : selectedPriorities.has(it.priority as any);
    if (!priOk) return false;

    if (filters.creatorId !== "all" && String(it.creatorId) !== filters.creatorId) return false;
    if (filters.chatterId !== "all" && String(it.chatterId ?? "") !== filters.chatterId) return false;

    if (startMs !== null && it.receivedAt < startMs) return false;
    if (endMs_ !== null && it.receivedAt > endMs_) return false;

    return true;
  });

  const dir = sort.dir === "asc" ? 1 : -1;

  const filteredSorted = [...filtered].sort((a, b) => {
    if (sort.key === "priority") {
      const d = (priorityRank(a.priority as any) - priorityRank(b.priority as any)) * dir;
      if (d !== 0) return d;
      const w = (computeWaitSec(a, nowMs) - computeWaitSec(b, nowMs)) * dir;
      if (w !== 0) return w;
      return (a.receivedAt - b.receivedAt) * dir;
    }

    if (sort.key === "received") {
      const d = (a.receivedAt - b.receivedAt) * dir;
      if (d !== 0) return d;
      const w = (computeWaitSec(a, nowMs) - computeWaitSec(b, nowMs)) * dir;
      if (w !== 0) return w;
      return (priorityRank(a.priority as any) - priorityRank(b.priority as any)) * -dir;
    }

    // wait
    const w = (computeWaitSec(a, nowMs) - computeWaitSec(b, nowMs)) * dir;
    if (w !== 0) return w;
    const p = (priorityRank(a.priority as any) - priorityRank(b.priority as any)) * -dir;
    if (p !== 0) return p;
    return (a.receivedAt - b.receivedAt) * dir;
  });

  const shownCount = filteredSorted.length;
  const toolbarVisible = selectedIds.length > 0;

  return (
    <div style={{ maxWidth: 1400, padding: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "var(--text)", margin: 0 }}>
            👁️ Supervisor Queue
          </h1>
          <p style={{ margin: "6px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Shortcuts: <b>R</b>=refresh, <b>C</b>=claim selected, <b>E</b>=escalate selected
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={refreshNow}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 900,
            }}
            title="Refresh (R)"
          >
            Refresh
          </button>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-secondary)", fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
            />
            Auto-refresh (10s)
          </label>

          <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 800 }}>
            Last refresh: {Math.max(0, Math.floor((nowMs - lastRefreshAtRef.current) / 1000))}s ago
          </div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ marginTop: 16 }}>
          <QueueStatsBar items={filteredSorted as any} nowMs={nowMs} />
        </div>

        <div style={{ marginTop: 16 }}>
          <QueueFilters
            value={filters}
            creators={creatorsList}
            chatters={chattersList}
            onChange={setFilters}
            onReset={resetFilters}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", fontWeight: 800 }}>
            Showing <b style={{ color: "var(--text)" }}>{shownCount}</b> item(s)
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 900 }}>Sort</div>
            <select
              value={sort.key}
              onChange={(e) => setSort((s) => ({ ...s, key: e.target.value as SortKey }))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                fontWeight: 900,
              }}
            >
              <option value="wait">Wait time</option>
              <option value="priority">Priority</option>
              <option value="received">Received time</option>
            </select>

            <button
              onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                cursor: "pointer",
                fontWeight: 900,
              }}
              title="Toggle sort direction"
            >
              {sort.dir === "asc" ? "↑ Asc" : "↓ Desc"}
            </button>
          </div>
        </div>

        {toolbarVisible ? (
          <div
            style={{
              marginTop: 14,
              background: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.25)",
              borderRadius: 16,
              padding: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 900 }}>
              {selectedIds.length} selected
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => void bulkClaim()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                  background: "rgba(59, 130, 246, 0.10)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Claim (C)
              </button>
              <button
                onClick={() => void bulkEscalate()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(245, 158, 11, 0.45)",
                  background: "rgba(245, 158, 11, 0.10)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Escalate (E)
              </button>
              <button
                onClick={() => void bulkResolve()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(34, 197, 94, 0.45)",
                  background: "rgba(34, 197, 94, 0.10)",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Resolve
              </button>
              <button
                onClick={clearSelection}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Clear
              </button>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          {!items ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, padding: "42px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 42, marginBottom: 14 }}>📡</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)" }}>Loading queue…</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                Fetching data from Supabase.
              </div>
            </div>
          ) : filteredSorted.length === 0 ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, padding: "42px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 42, marginBottom: 14 }}>🪹</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--text)" }}>
                No items match your filters
              </div>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                Try widening status/priority filters or clearing creator/chatter.
              </div>
              <button
                onClick={resetFilters}
                style={{
                  marginTop: 14,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            filteredSorted.map((it) => {
              const id = String(it._id);
              return (
                <QueueItemCard
                  key={id}
                  item={it}
                  nowMs={nowMs}
                  creatorsById={creatorsById}
                  chattersById={chattersById}
                  selected={selectedIds.includes(id)}
                  onToggleSelected={() => toggleSelected(id)}
                  expanded={expandedId === id}
                  onToggleExpanded={() => setExpandedId((cur) => (cur === id ? null : id))}
                  loading={!!busyIds[id]}
                  onClaim={async () => {
                    if (!token) return;
                    setBusy(id, true);
                    try {
                      await claimMessage(id);
                    } finally {
                      setBusy(id, false);
                    }
                  }}
                  onEscalate={async () => {
                    if (!token) return;
                    const reason = window.prompt("Escalation reason:", it.escalationReason ?? "Needs supervisor attention");
                    if (!reason || !reason.trim()) return;

                    setBusy(id, true);
                    try {
                      await escalateMessage(id, reason.trim(), user?.id ? String(user.id) : undefined);
                    } finally {
                      setBusy(id, false);
                    }
                  }}
                  onResolve={async () => {
                    if (!token) return;
                    if (!window.confirm("Mark as resolved/responded?") ) return;

                    setBusy(id, true);
                    try {
                      await resolveMessage(id);
                    } finally {
                      setBusy(id, false);
                    }
                  }}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
