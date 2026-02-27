"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  // Convex returns Id types; in UI we normalize them to strings.
  return {
    ...raw,
    _id: String(raw._id),
    creatorId: String(raw.creatorId),
    chatterId: raw.chatterId ? String(raw.chatterId) : undefined,
    originalChatterId: raw.originalChatterId ? String(raw.originalChatterId) : undefined,
    escalatedTo: raw.escalatedTo ? String(raw.escalatedTo) : undefined,
  } as QueueItemLike;
}

function QueueData({
  token,
  canLoadChatters,
  children,
}: {
  token: string;
  canLoadChatters: boolean;
  children: (data: {
    items: QueueItemLike[] | undefined;
    creators: CreatorListItem[] | undefined;
    chatters: ChatterListItem[] | undefined;
  }) => React.ReactNode;
}) {
  const itemsRaw = useQuery(
    api.crm.queue.getQueueItems,
    token ? { token, includeClosed: true, limit: 200 } : "skip"
  );
  const creators = useQuery(
    api.crm.creators.list,
    token ? { token, includeArchived: false } : "skip"
  );
  const chatters = useQuery(api.crm.chatters.list, token && canLoadChatters ? { token } : "skip");

  const items = useMemo(() => {
    if (!itemsRaw) return itemsRaw;
    return (itemsRaw as any[]).map(normalizeQueueItem);
  }, [itemsRaw]);

  return <>{children({ items, creators: creators as any, chatters: chatters as any })}</>;
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

  const claimMessage = useMutation(api.crm.queue.claimMessage);
  const escalateMessage = useMutation(api.crm.queue.escalateMessage);
  const resolveMessage = useMutation(api.crm.queue.resolveMessage);

  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});

  const setBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((prev) => {
      if (prev[id] === busy) return prev;
      return { ...prev, [id]: busy };
    });
  }, []);

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
        await claimMessage({ token, queueId: id as any });
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

    const escalateTo = user?.id ? (String(user.id) as Id<"crm_chatters">) : undefined;

    for (const id of selectedIds) {
      setBusy(id, true);
      try {
        await escalateMessage({
          token,
          queueId: id as any,
          reason: reason.trim(),
          escalateTo: escalateTo as any,
        });
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
        await resolveMessage({ token, queueId: id as any });
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
        <QueueData key={refreshKey} token={token} canLoadChatters={isSupervisor}>
          {({ items, creators, chatters }) => {
            const creatorsList: CreatorListItem[] = (creators ?? []).map((c: any) => ({
              id: String(c.id),
              name: String(c.name),
            }));

            const chattersList: ChatterListItem[] = (chatters ?? []).map((c: any) => ({
              id: String(c.id),
              name: String(c.name),
            }));

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
            const endMs = endOfDayMs(filters.endDate);

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
              if (endMs !== null && it.receivedAt > endMs) return false;

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
              <>
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
                        Connected to real-time updates.
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
                              await claimMessage({ token, queueId: it._id as any });
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
                              await escalateMessage({
                                token,
                                queueId: it._id as any,
                                reason: reason.trim(),
                                escalateTo: (user?.id ? String(user.id) : undefined) as any,
                              });
                            } finally {
                              setBusy(id, false);
                            }
                          }}
                          onResolve={async () => {
                            if (!token) return;
                            if (!window.confirm("Mark as resolved/responded?") ) return;

                            setBusy(id, true);
                            try {
                              await resolveMessage({ token, queueId: it._id as any });
                            } finally {
                              setBusy(id, false);
                            }
                          }}
                        />
                      );
                    })
                  )}
                </div>
              </>
            );
          }}
        </QueueData>
      </div>
    </div>
  );
}
