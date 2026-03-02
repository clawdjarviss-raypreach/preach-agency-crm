"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type {
  QueueNotificationKind,
  QueueNotificationToastItem,
} from "../components/QueueNotificationToast";

export type QueueNotificationEventType =
  | "new_message"
  | "sla_warning"
  | "sla_breach"
  | "escalated";

export type QueueItemForNotifications = {
  id: string;
  creator_id: string;
  chatter_id?: string;
  escalated_to?: string;
  status: string;
  priority: "critical" | "high" | "normal" | "low";
  fan_username: string;
  fan_segment?: string;
  message_type?: string;
  received_at: string;
  sla_max_wait_sec?: number;
  updated_at?: string;
};

type SlaBucket = "ok" | "warning" | "breach";

export type QueuePersistentAlert = {
  id: string;
  severity: QueueNotificationKind;
  title: string;
  message: string;
  href?: string;
};

export type QueueNotificationsOptions = {
  token: string;
  user: { id: string; role: string };

  /**
   * If provided, notifications are derived from these items (already fetched elsewhere).
   * If omitted, this hook will poll / subscribe via Supabase.
   */
  items?: QueueItemForNotifications[] | undefined;

  /**
   * Subscription mode when `items` is omitted.
   * - "self": chatter queue (assigned to current user)
   * - "supervisor_escalations": only escalated items where escalated_to=current user
   * - "supervisor_all_open": open items for supervisors (heavier)
   */
  subscriptionMode?:
    | "self"
    | "supervisor_escalations"
    | "supervisor_all_open";

  /** Base route for navigation to a queue item. */
  baseHref?: string;

  /** Enable timer-based SLA threshold toasts. */
  enableSlaToasts?: boolean;

  /** If true, plays a (best-effort) sound for critical notifications. */
  soundForCritical?: boolean;

  /** If true, uses the browser Notification API for critical events when the tab is not focused. */
  browserNotificationsForCritical?: boolean;

  /** Request browser notification permission once on mount (optional behavior). */
  requestBrowserNotificationPermissionOnMount?: boolean;

  /**
   * If true, computes persistent, banner-friendly alerts.
   * (Only works for supervisor/admin roles.)
   */
  computePhase3Alerts?: boolean;

  /**
   * Alert config for Phase 3 persistent alerts.
   * If computePhase3Alerts is true and this is not provided,
   * the hook will attempt to fetch it from Supabase.
   */
  alertConfig?: {
    enableVipQueue?: boolean;
    vipQueueThreshold: number;
    vipQueueMinutes: number;
    enableQueueOverload?: boolean;
    queueOverloadThreshold: number;
  } | null;
};

function isSupervisorRole(role: string): boolean {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function isOpenStatus(status: string): boolean {
  return (
    status === "pending" ||
    status === "in_progress" ||
    status === "escalated"
  );
}

function computeSlaBucket(
  waitSec: number,
  maxWaitSec?: number
): SlaBucket {
  const max = maxWaitSec ?? 0;
  if (!Number.isFinite(max) || max <= 0) return "ok";
  const ratio = waitSec / max;
  if (ratio >= 1) return "breach";
  if (ratio >= 0.7) return "warning";
  return "ok";
}

function bucketRank(b: SlaBucket): number {
  switch (b) {
    case "breach":
      return 2;
    case "warning":
      return 1;
    case "ok":
    default:
      return 0;
  }
}

function kindForEvent(
  type: QueueNotificationEventType,
  priority?: string
): QueueNotificationKind {
  if (type === "sla_breach") return "critical";
  if (type === "sla_warning") return "warning";
  if (type === "escalated") return "warning";

  // new message: critical priority should be critical.
  if (type === "new_message" && priority === "critical") return "critical";
  return "info";
}

function safeNow(): number {
  return Date.now();
}

export function playCriticalQueueSound(): void {
  if (typeof window === "undefined") return;

  // Best-effort: WebAudio beep (avoids shipping an mp3).
  try {
    const AudioCtx = (window.AudioContext ||
      (window as any).webkitAudioContext) as
      | (new () => AudioContext)
      | undefined;

    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();

    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;

    o.connect(g);
    g.connect(ctx.destination);

    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);

    o.start(t0);
    o.stop(t0 + 0.5);

    const cleanup = () => {
      try {
        o.disconnect();
        g.disconnect();
      } catch {
        // ignore
      }
      void ctx.close().catch(() => {});
    };
    o.onended = cleanup;
  } catch {
    // ignore
  }
}

function canUseBrowserNotifications(): boolean {
  return (
    typeof window !== "undefined" && typeof Notification !== "undefined"
  );
}

function requestBrowserNotificationPermissionOnce(): void {
  if (!canUseBrowserNotifications()) return;
  try {
    const key = "queue_browser_notifications_requested_v1";
    if (localStorage.getItem(key) === "1") return;
    localStorage.setItem(key, "1");

    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    // ignore
  }
}

function maybeSendBrowserNotification(opts: {
  title: string;
  body: string;
}): void {
  if (!canUseBrowserNotifications()) return;
  if (document && document.hidden !== true) return;
  if (Notification.permission !== "granted") return;

  try {
    // eslint-disable-next-line no-new
    new Notification(opts.title, { body: opts.body });
  } catch {
    // ignore
  }
}

function normalizeQueueItem(raw: any): QueueItemForNotifications {
  return {
    id: String(raw.id),
    creator_id: String(raw.creator_id),
    chatter_id: raw.chatter_id ? String(raw.chatter_id) : undefined,
    escalated_to: raw.escalated_to
      ? String(raw.escalated_to)
      : undefined,
    status: String(raw.status),
    priority: raw.priority as QueueItemForNotifications["priority"],
    fan_username: String(raw.fan_username ?? ""),
    fan_segment: raw.fan_segment ? String(raw.fan_segment) : undefined,
    message_type: raw.message_type
      ? String(raw.message_type)
      : undefined,
    received_at: String(raw.received_at ?? ""),
    sla_max_wait_sec: raw.sla_max_wait_sec
      ? Number(raw.sla_max_wait_sec)
      : undefined,
    updated_at: raw.updated_at ? String(raw.updated_at) : undefined,
  };
}

function receivedAtMs(item: QueueItemForNotifications): number {
  return new Date(item.received_at).getTime();
}

function shouldSeeNewMessageToast(
  user: { id: string; role: string },
  item: QueueItemForNotifications
): boolean {
  // Assigned chatter should be notified.
  if (user.role === "chatter") {
    return item.chatter_id === user.id;
  }

  // Supervisors: only notify for escalations (handled separately).
  return false;
}

function shouldSeeEscalationToast(
  user: { id: string; role: string },
  item: QueueItemForNotifications
): boolean {
  if (!isSupervisorRole(user.role)) return false;
  if (item.status !== "escalated") return false;
  if (!item.escalated_to) return false;
  return item.escalated_to === user.id;
}

function toastTitleForEvent(
  type: QueueNotificationEventType,
  item: QueueItemForNotifications
): string {
  switch (type) {
    case "new_message":
      return `New message from @${item.fan_username}`;
    case "sla_warning":
      return `SLA warning: @${item.fan_username}`;
    case "sla_breach":
      return `SLA breached: @${item.fan_username}`;
    case "escalated":
      return `Escalated item: @${item.fan_username}`;
    default:
      return `Queue update: @${item.fan_username}`;
  }
}

function toastMessageForEvent(
  type: QueueNotificationEventType,
  item: QueueItemForNotifications
): string {
  const seg = item.fan_segment
    ? `${item.fan_segment.toUpperCase()} • `
    : "";
  const pri = item.priority
    ? `${String(item.priority).toUpperCase()} • `
    : "";
  const msgType = item.message_type ? `${item.message_type} • ` : "";

  switch (type) {
    case "new_message":
      return `${seg}${pri}${msgType}Status: ${item.status}`;
    case "sla_warning":
      return `${seg}${pri}Approaching SLA breach`;
    case "sla_breach":
      return `${seg}${pri}SLA breach occurred`;
    case "escalated":
      return item.status === "escalated"
        ? `Reason: ${item.status === "escalated" ? "Needs attention" : ""}`
        : `${seg}${pri}`;
    default:
      return `${seg}${pri}`;
  }
}

/**
 * Fetch queue items from Supabase based on subscription mode.
 */
async function fetchQueueItems(
  mode: string,
  userId: string
): Promise<QueueItemForNotifications[]> {
  let query = supabase
    .from("crm_message_queue")
    .select("*")
    .in("status", ["pending", "in_progress", "escalated"]);

  if (mode === "supervisor_escalations") {
    query = query
      .eq("status", "escalated")
      .eq("escalated_to", userId)
      .limit(200);
  } else if (mode === "supervisor_all_open") {
    query = query.limit(500);
  } else {
    // "self" mode
    query = query.limit(200);
  }

  const { data } = await query;
  if (!data) return [];
  return data.map(normalizeQueueItem);
}

export function useQueueNotifications(opts: QueueNotificationsOptions): {
  notifications: QueueNotificationToastItem[];
  dismissNotification: (id: string) => void;
  persistentAlerts: QueuePersistentAlert[];
  subscribedItems: QueueItemForNotifications[] | undefined;
} {
  const {
    token,
    user,
    items: itemsProp,
    subscriptionMode = "self",
    baseHref = "/queue",
    enableSlaToasts = true,
    soundForCritical = false,
    browserNotificationsForCritical = true,
    requestBrowserNotificationPermissionOnMount = false,
    computePhase3Alerts = false,
    alertConfig: alertConfigProp = null,
  } = opts;

  const supervisor = isSupervisorRole(user.role);

  // ─── Supabase subscription / polling state ─────────────────
  const [fetchedItems, setFetchedItems] = useState<
    QueueItemForNotifications[] | undefined
  >(undefined);

  // Poll for queue items if not provided via prop.
  // Also set up a Supabase realtime channel for live INSERT/UPDATE notifications.
  useEffect(() => {
    if (itemsProp !== undefined) return; // items provided externally
    if (!token) return;

    let cancelled = false;

    // Initial fetch
    fetchQueueItems(subscriptionMode, user.id).then((items) => {
      if (!cancelled) setFetchedItems(items);
    });

    // Realtime subscription for live updates
    const channel = supabase
      .channel("queue-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_message_queue",
        },
        () => {
          // Re-fetch on any change to the queue table
          fetchQueueItems(subscriptionMode, user.id).then((items) => {
            if (!cancelled) setFetchedItems(items);
          });
        }
      )
      .subscribe();

    // Also poll every 30 seconds as a fallback
    const pollInterval = window.setInterval(() => {
      fetchQueueItems(subscriptionMode, user.id).then((items) => {
        if (!cancelled) setFetchedItems(items);
      });
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [itemsProp, token, subscriptionMode, user.id]);

  const subscribedItems = useMemo(() => {
    if (itemsProp !== undefined) return itemsProp;
    return fetchedItems;
  }, [itemsProp, fetchedItems]);

  // ─── Alert config fetch (Phase 3) ─────────────────────────
  const [alertConfig, setAlertConfig] = useState(alertConfigProp);

  useEffect(() => {
    if (!computePhase3Alerts || !supervisor || !token) return;
    if (alertConfigProp) {
      setAlertConfig(alertConfigProp);
      return;
    }

    // TODO: Fetch alert config from a settings table if needed.
    // For now, use sensible defaults.
    setAlertConfig({
      enableVipQueue: true,
      vipQueueThreshold: 3,
      vipQueueMinutes: 10,
      enableQueueOverload: true,
      queueOverloadThreshold: 20,
    });
  }, [
    alertConfigProp,
    computePhase3Alerts,
    supervisor,
    token,
  ]);

  const [notifications, setNotifications] = useState<
    QueueNotificationToastItem[]
  >([]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Keep items in a ref for the SLA interval effect.
  const itemsRef = useRef<QueueItemForNotifications[]>([]);
  useEffect(() => {
    itemsRef.current = subscribedItems ?? [];
  }, [subscribedItems]);

  // Track last-seen item state to detect diffs.
  const initializedRef = useRef(false);
  const lastByIdRef = useRef(
    new Map<
      string,
      {
        status: string;
        slaBucket: SlaBucket;
      }
    >()
  );

  // Request browser notification permission (optional) on mount.
  useEffect(() => {
    if (!requestBrowserNotificationPermissionOnMount) return;
    requestBrowserNotificationPermissionOnce();
  }, [requestBrowserNotificationPermissionOnMount]);

  // Diff-based notifications (new items, escalations).
  useEffect(() => {
    if (!subscribedItems) return;

    const now = safeNow();

    const nextById = new Map<
      string,
      { status: string; slaBucket: SlaBucket }
    >();

    for (const item of subscribedItems) {
      const waitSec = Math.max(
        0,
        Math.floor((now - receivedAtMs(item)) / 1000)
      );
      const slaBucket = computeSlaBucket(
        waitSec,
        item.sla_max_wait_sec
      );
      nextById.set(item.id, { status: item.status, slaBucket });
    }

    if (!initializedRef.current) {
      lastByIdRef.current = nextById;
      initializedRef.current = true;
      return;
    }

    const prevById = lastByIdRef.current;
    const newToasts: QueueNotificationToastItem[] = [];

    // New items.
    for (const item of subscribedItems) {
      const prev = prevById.get(item.id);
      if (!prev) {
        if (shouldSeeNewMessageToast(user, item)) {
          const type: QueueNotificationEventType = "new_message";
          const kind = kindForEvent(type, item.priority);
          newToasts.push({
            id: `${type}:${item.id}:${item.received_at}`,
            kind,
            title: toastTitleForEvent(type, item),
            message: toastMessageForEvent(type, item),
            href: `${baseHref}?focus=${encodeURIComponent(item.id)}`,
            createdAt: now,
          });

          if (kind === "critical" && soundForCritical)
            playCriticalQueueSound();
          if (kind === "critical" && browserNotificationsForCritical) {
            maybeSendBrowserNotification({
              title: "Queue: Critical message",
              body: `@${item.fan_username} (${item.fan_segment ?? "unknown"})`,
            });
          }
        }

        // Escalations can show up as new items in an escalations-only subscription.
        if (shouldSeeEscalationToast(user, item)) {
          const type: QueueNotificationEventType = "escalated";
          const kind = kindForEvent(type, item.priority);
          newToasts.push({
            id: `${type}:${item.id}:${item.updated_at ?? item.received_at}`,
            kind,
            title: toastTitleForEvent(type, item),
            message: (item as any).escalation_reason
              ? `Reason: ${String((item as any).escalation_reason)}`
              : toastMessageForEvent(type, item),
            href: `${baseHref}?focus=${encodeURIComponent(item.id)}`,
            createdAt: now,
          });
          if (kind === "critical" && soundForCritical)
            playCriticalQueueSound();
          if (kind === "critical" && browserNotificationsForCritical) {
            maybeSendBrowserNotification({
              title: "Queue: Escalation",
              body: `Escalated item for @${item.fan_username}`,
            });
          }
        }

        continue;
      }

      // Status transitions -> escalated
      if (
        item.status === "escalated" &&
        prev.status !== "escalated"
      ) {
        if (shouldSeeEscalationToast(user, item)) {
          const type: QueueNotificationEventType = "escalated";
          const kind = kindForEvent(type, item.priority);
          newToasts.push({
            id: `${type}:${item.id}:${item.updated_at ?? String(now)}`,
            kind,
            title: toastTitleForEvent(type, item),
            message: (item as any).escalation_reason
              ? `Reason: ${String((item as any).escalation_reason)}`
              : toastMessageForEvent(type, item),
            href: `${baseHref}?focus=${encodeURIComponent(item.id)}`,
            createdAt: now,
          });
          if (kind === "critical" && soundForCritical)
            playCriticalQueueSound();
          if (kind === "critical" && browserNotificationsForCritical) {
            maybeSendBrowserNotification({
              title: "Queue: Escalation",
              body: `Escalated item for @${item.fan_username}`,
            });
          }
        }
      }
    }

    if (newToasts.length > 0) {
      setNotifications((prev) => {
        // De-duplicate by id.
        const seen = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        for (const t of newToasts) {
          if (seen.has(t.id)) continue;
          merged.push(t);
          seen.add(t.id);
        }
        // Keep bounded.
        const sorted = merged.sort((a, b) => a.createdAt - b.createdAt);
        return sorted.slice(Math.max(0, sorted.length - 20));
      });
    }

    lastByIdRef.current = nextById;
  }, [
    baseHref,
    browserNotificationsForCritical,
    soundForCritical,
    subscribedItems,
    user,
  ]);

  // Timer-based SLA threshold notifications.
  useEffect(() => {
    if (!enableSlaToasts) return;
    if (!initializedRef.current) return;

    const intervalMs = 1000;
    const t = window.setInterval(() => {
      const now = safeNow();
      const items = itemsRef.current;

      if (!items || items.length === 0) return;

      const byId = lastByIdRef.current;
      const toAdd: QueueNotificationToastItem[] = [];

      for (const item of items) {
        if (!isOpenStatus(item.status)) continue;

        // Only warn chatters about their own queue; supervisors only if they're in "all open" mode.
        if (user.role === "chatter") {
          if (item.chatter_id !== user.id) continue;
        } else {
          if (subscriptionMode !== "supervisor_all_open") continue;
        }

        const waitSec = Math.max(
          0,
          Math.floor((now - receivedAtMs(item)) / 1000)
        );
        const bucket = computeSlaBucket(
          waitSec,
          item.sla_max_wait_sec
        );

        const prev = byId.get(item.id);
        const prevBucket = prev?.slaBucket ?? "ok";

        if (bucketRank(bucket) <= bucketRank(prevBucket)) continue;

        // bucket has escalated.
        const type: QueueNotificationEventType =
          bucket === "breach" ? "sla_breach" : "sla_warning";
        const kind = kindForEvent(type, item.priority);

        toAdd.push({
          id: `${type}:${item.id}:${bucket}:${Math.floor(now / 1000)}`,
          kind,
          title: toastTitleForEvent(type, item),
          message: toastMessageForEvent(type, item),
          href: `${baseHref}?focus=${encodeURIComponent(item.id)}`,
          createdAt: now,
        });

        if (kind === "critical" && soundForCritical)
          playCriticalQueueSound();
        if (kind === "critical" && browserNotificationsForCritical) {
          maybeSendBrowserNotification({
            title: "Queue: SLA breach",
            body: `@${item.fan_username} (${item.fan_segment ?? "unknown"})`,
          });
        }

        // Update stored bucket so we don't keep firing.
        byId.set(item.id, { status: item.status, slaBucket: bucket });
      }

      if (toAdd.length > 0) {
        setNotifications((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          const merged = [...prev];
          for (const toast of toAdd) {
            if (seen.has(toast.id)) continue;
            merged.push(toast);
            seen.add(toast.id);
          }
          const sorted = merged.sort(
            (a, b) => a.createdAt - b.createdAt
          );
          return sorted.slice(Math.max(0, sorted.length - 20));
        });
      }
    }, intervalMs);

    return () => window.clearInterval(t);
  }, [
    baseHref,
    browserNotificationsForCritical,
    enableSlaToasts,
    soundForCritical,
    subscriptionMode,
    user.role,
    user.id,
  ]);

  const persistentAlerts = useMemo<QueuePersistentAlert[]>(() => {
    if (!computePhase3Alerts || !supervisor) return [];
    if (!subscribedItems) return [];
    if (!alertConfig) return [];

    const now = safeNow();

    const alerts: QueuePersistentAlert[] = [];

    // A) SLA breaches anywhere in open queue.
    const open = subscribedItems.filter((i) => isOpenStatus(i.status));
    let breaches = 0;
    for (const i of open) {
      const waitSec = Math.max(
        0,
        Math.floor((now - receivedAtMs(i)) / 1000)
      );
      const bucket = computeSlaBucket(
        waitSec,
        i.sla_max_wait_sec
      );
      if (bucket === "breach") breaches += 1;
    }

    if (breaches > 0) {
      alerts.push({
        id: "queue_sla_breaches",
        severity: "critical",
        title: "SLA breaches",
        message: `${breaches} open item(s) have breached SLA`,
        href: baseHref,
      });
    }

    // B) VIP queue backup
    if (alertConfig.enableVipQueue) {
      const minWaitSec = Math.max(
        0,
        Math.floor(alertConfig.vipQueueMinutes * 60)
      );
      const vipCount = open
        .filter((i) => i.fan_segment === "vip")
        .filter(
          (i) =>
            Math.floor((now - receivedAtMs(i)) / 1000) >= minWaitSec
        ).length;

      if (vipCount >= alertConfig.vipQueueThreshold) {
        alerts.push({
          id: "vip_queue_backup",
          severity:
            vipCount >= alertConfig.vipQueueThreshold * 2
              ? "critical"
              : "warning",
          title: "VIP queue backup",
          message: `${vipCount} VIP fan(s) waiting >= ${alertConfig.vipQueueMinutes} min`,
          href: baseHref,
        });
      }
    }

    // C) Queue overload
    if (alertConfig.enableQueueOverload) {
      const pending = open.filter((i) => i.status === "pending");
      const byChatter = new Map<string, number>();
      for (const i of pending) {
        const cid = i.chatter_id ?? "unassigned";
        byChatter.set(cid, (byChatter.get(cid) ?? 0) + 1);
      }

      let max = 0;
      let maxChatter: string | null = null;
      for (const [cid, count] of byChatter.entries()) {
        if (count > max) {
          max = count;
          maxChatter = cid;
        }
      }

      if (maxChatter && max > alertConfig.queueOverloadThreshold) {
        alerts.push({
          id: "queue_overload",
          severity: "warning",
          title: "Queue overload",
          message: `Highest pending load: ${max} item(s) (threshold ${alertConfig.queueOverloadThreshold})`,
          href: baseHref,
        });
      }
    }

    return alerts;
  }, [
    alertConfig,
    baseHref,
    computePhase3Alerts,
    subscribedItems,
    supervisor,
  ]);

  return {
    notifications,
    dismissNotification,
    persistentAlerts,
    subscribedItems,
  };
}
