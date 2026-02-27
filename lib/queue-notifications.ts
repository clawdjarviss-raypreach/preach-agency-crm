"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { QueueNotificationKind, QueueNotificationToastItem } from "../components/QueueNotificationToast";

export type QueueNotificationEventType =
  | "new_message"
  | "sla_warning"
  | "sla_breach"
  | "escalated";

export type QueueItemForNotifications = {
  _id: string;
  creatorId: string;
  chatterId?: string;
  escalatedTo?: string;
  status: string;
  priority: "critical" | "high" | "normal" | "low";
  fanUsername: string;
  fanSegment?: string;
  messageType?: string;
  receivedAt: number;
  slaMaxWaitSec?: number;
  updatedAt?: number;
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
   * If provided, notifications are derived from these items (already subscribed elsewhere).
   * If omitted, this hook will subscribe using Convex.
   */
  items?: QueueItemForNotifications[] | undefined;

  /**
   * Convex subscription mode when `items` is omitted.
   * - "self": chatter queue (assigned to current user)
   * - "supervisor_escalations": only escalated items where escalatedTo=current user
   * - "supervisor_all_open": open items for supervisors (heavier)
   */
  subscriptionMode?: "self" | "supervisor_escalations" | "supervisor_all_open";

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
   * If true, computes persistent, banner-friendly alerts using Phase 3 config.
   * (Only works for supervisor/admin roles due to permissions.)
   */
  computePhase3Alerts?: boolean;
};

function isSupervisorRole(role: string): boolean {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function isOpenStatus(status: string): boolean {
  return status === "pending" || status === "in_progress" || status === "escalated";
}

function computeSlaBucket(waitSec: number, maxWaitSec?: number): SlaBucket {
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

function kindForEvent(type: QueueNotificationEventType, priority?: string): QueueNotificationKind {
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
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as
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
  return typeof window !== "undefined" && typeof Notification !== "undefined";
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

function maybeSendBrowserNotification(opts: { title: string; body: string }): void {
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

function normalizeQueueItemLike(raw: any): QueueItemForNotifications {
  return {
    _id: String(raw._id),
    creatorId: String(raw.creatorId),
    chatterId: raw.chatterId ? String(raw.chatterId) : undefined,
    escalatedTo: raw.escalatedTo ? String(raw.escalatedTo) : undefined,
    status: String(raw.status),
    priority: raw.priority as QueueItemForNotifications["priority"],
    fanUsername: String(raw.fanUsername ?? ""),
    fanSegment: raw.fanSegment ? String(raw.fanSegment) : undefined,
    messageType: raw.messageType ? String(raw.messageType) : undefined,
    receivedAt: Number(raw.receivedAt ?? 0),
    slaMaxWaitSec: raw.slaMaxWaitSec ? Number(raw.slaMaxWaitSec) : undefined,
    updatedAt: raw.updatedAt ? Number(raw.updatedAt) : undefined,
  };
}

function shouldSeeNewMessageToast(user: { id: string; role: string }, item: QueueItemForNotifications): boolean {
  // Assigned chatter should be notified.
  if (user.role === "chatter") {
    return item.chatterId === user.id;
  }

  // Supervisors: only notify for escalations (handled separately).
  return false;
}

function shouldSeeEscalationToast(user: { id: string; role: string }, item: QueueItemForNotifications): boolean {
  if (!isSupervisorRole(user.role)) return false;
  if (item.status !== "escalated") return false;
  if (!item.escalatedTo) return false;
  return item.escalatedTo === user.id;
}

function toastTitleForEvent(type: QueueNotificationEventType, item: QueueItemForNotifications): string {
  switch (type) {
    case "new_message":
      return `New message from @${item.fanUsername}`;
    case "sla_warning":
      return `SLA warning: @${item.fanUsername}`;
    case "sla_breach":
      return `SLA breached: @${item.fanUsername}`;
    case "escalated":
      return `Escalated item: @${item.fanUsername}`;
    default:
      return `Queue update: @${item.fanUsername}`;
  }
}

function toastMessageForEvent(type: QueueNotificationEventType, item: QueueItemForNotifications): string {
  const seg = item.fanSegment ? `${item.fanSegment.toUpperCase()} • ` : "";
  const pri = item.priority ? `${String(item.priority).toUpperCase()} • ` : "";
  const msgType = item.messageType ? `${item.messageType} • ` : "";

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
  } = opts;

  const supervisor = isSupervisorRole(user.role);

  const subscribedRaw = useQuery(
    api.crm.queue.getQueueItems,
    itemsProp
      ? "skip"
      : token
        ? (() => {
            if (subscriptionMode === "supervisor_all_open") {
              return { token, includeClosed: false, limit: 500 } as const;
            }
            if (subscriptionMode === "supervisor_escalations") {
              return {
                token,
                includeClosed: false,
                status: "escalated" as const,
                escalatedTo: user.id as unknown as Id<"crm_chatters">,
                limit: 200,
              } as const;
            }
            // self
            return { token, includeClosed: false, limit: 200 } as const;
          })()
        : "skip"
  );

  const subscribedItems = useMemo(() => {
    if (itemsProp) return itemsProp;
    if (!subscribedRaw) return subscribedRaw as undefined;
    const rawList = subscribedRaw as any[];
    return rawList.map(normalizeQueueItemLike);
  }, [itemsProp, subscribedRaw]);

  const alertConfig = useQuery(
    api.crm.alertConfig.get,
    computePhase3Alerts && supervisor && token ? { token } : "skip"
  );

  const [notifications, setNotifications] = useState<QueueNotificationToastItem[]>([]);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((t) => t.id !== id));
  };

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

    const nextById = new Map<string, { status: string; slaBucket: SlaBucket }>();

    for (const item of subscribedItems) {
      const waitSec = Math.max(0, Math.floor((now - item.receivedAt) / 1000));
      const slaBucket = computeSlaBucket(waitSec, item.slaMaxWaitSec);
      nextById.set(item._id, { status: item.status, slaBucket });
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
      const prev = prevById.get(item._id);
      if (!prev) {
        if (shouldSeeNewMessageToast(user, item)) {
          const type: QueueNotificationEventType = "new_message";
          const kind = kindForEvent(type, item.priority);
          newToasts.push({
            id: `${type}:${item._id}:${item.receivedAt}`,
            kind,
            title: toastTitleForEvent(type, item),
            message: toastMessageForEvent(type, item),
            href: `${baseHref}?focus=${encodeURIComponent(item._id)}`,
            createdAt: now,
          });

          if (kind === "critical" && soundForCritical) playCriticalQueueSound();
          if (kind === "critical" && browserNotificationsForCritical) {
            maybeSendBrowserNotification({
              title: "Queue: Critical message",
              body: `@${item.fanUsername} (${item.fanSegment ?? "unknown"})`,
            });
          }
        }

        // Escalations can show up as new items in an escalations-only subscription.
        if (shouldSeeEscalationToast(user, item)) {
          const type: QueueNotificationEventType = "escalated";
          const kind = kindForEvent(type, item.priority);
          newToasts.push({
            id: `${type}:${item._id}:${item.updatedAt ?? item.receivedAt}`,
            kind,
            title: toastTitleForEvent(type, item),
            message: (item as any).escalationReason
              ? `Reason: ${String((item as any).escalationReason)}`
              : toastMessageForEvent(type, item),
            href: `${baseHref}?focus=${encodeURIComponent(item._id)}`,
            createdAt: now,
          });
          if (kind === "critical" && soundForCritical) playCriticalQueueSound();
          if (kind === "critical" && browserNotificationsForCritical) {
            maybeSendBrowserNotification({
              title: "Queue: Escalation",
              body: `Escalated item for @${item.fanUsername}`,
            });
          }
        }

        continue;
      }

      // Status transitions → escalated
      if (item.status === "escalated" && prev.status !== "escalated") {
        if (shouldSeeEscalationToast(user, item)) {
          const type: QueueNotificationEventType = "escalated";
          const kind = kindForEvent(type, item.priority);
          newToasts.push({
            id: `${type}:${item._id}:${item.updatedAt ?? now}`,
            kind,
            title: toastTitleForEvent(type, item),
            message: (item as any).escalationReason
              ? `Reason: ${String((item as any).escalationReason)}`
              : toastMessageForEvent(type, item),
            href: `${baseHref}?focus=${encodeURIComponent(item._id)}`,
            createdAt: now,
          });
          if (kind === "critical" && soundForCritical) playCriticalQueueSound();
          if (kind === "critical" && browserNotificationsForCritical) {
            maybeSendBrowserNotification({
              title: "Queue: Escalation",
              body: `Escalated item for @${item.fanUsername}`,
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
  }, [baseHref, browserNotificationsForCritical, soundForCritical, subscribedItems, user]);

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
          if (item.chatterId !== user.id) continue;
        } else {
          if (subscriptionMode !== "supervisor_all_open") continue;
        }

        const waitSec = Math.max(0, Math.floor((now - item.receivedAt) / 1000));
        const bucket = computeSlaBucket(waitSec, item.slaMaxWaitSec);

        const prev = byId.get(item._id);
        const prevBucket = prev?.slaBucket ?? "ok";

        if (bucketRank(bucket) <= bucketRank(prevBucket)) continue;

        // bucket has escalated.
        const type: QueueNotificationEventType = bucket === "breach" ? "sla_breach" : "sla_warning";
        const kind = kindForEvent(type, item.priority);

        toAdd.push({
          id: `${type}:${item._id}:${bucket}:${Math.floor(now / 1000)}`,
          kind,
          title: toastTitleForEvent(type, item),
          message: toastMessageForEvent(type, item),
          href: `${baseHref}?focus=${encodeURIComponent(item._id)}`,
          createdAt: now,
        });

        if (kind === "critical" && soundForCritical) playCriticalQueueSound();
        if (kind === "critical" && browserNotificationsForCritical) {
          maybeSendBrowserNotification({
            title: "Queue: SLA breach",
            body: `@${item.fanUsername} (${item.fanSegment ?? "unknown"})`,
          });
        }

        // Update stored bucket so we don't keep firing.
        byId.set(item._id, { status: item.status, slaBucket: bucket });
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
          const sorted = merged.sort((a, b) => a.createdAt - b.createdAt);
          return sorted.slice(Math.max(0, sorted.length - 20));
        });
      }
    }, intervalMs);

    return () => window.clearInterval(t);
  }, [baseHref, browserNotificationsForCritical, enableSlaToasts, soundForCritical, subscriptionMode, user.role, user.id]);

  const persistentAlerts = useMemo<QueuePersistentAlert[]>(() => {
    if (!computePhase3Alerts || !supervisor) return [];
    if (!subscribedItems) return [];
    if (!alertConfig) return [];

    const now = safeNow();

    const alerts: QueuePersistentAlert[] = [];

    // A) SLA breaches anywhere in open queue (using computed slaMaxWaitSec if available).
    const open = subscribedItems.filter((i) => isOpenStatus(i.status));
    let breaches = 0;
    for (const i of open) {
      const waitSec = Math.max(0, Math.floor((now - i.receivedAt) / 1000));
      const bucket = computeSlaBucket(waitSec, i.slaMaxWaitSec);
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

    // B) VIP queue backup (Phase 3 config: vipQueueThreshold, vipQueueMinutes)
    if (alertConfig.enableVipQueue) {
      const minWaitSec = Math.max(0, Math.floor(alertConfig.vipQueueMinutes * 60));
      const vipCount = open.filter((i) => i.fanSegment === "vip")
        .filter((i) => Math.floor((now - i.receivedAt) / 1000) >= minWaitSec).length;

      if (vipCount >= alertConfig.vipQueueThreshold) {
        alerts.push({
          id: "vip_queue_backup",
          severity: vipCount >= alertConfig.vipQueueThreshold * 2 ? "critical" : "warning",
          title: "VIP queue backup",
          message: `${vipCount} VIP fan(s) waiting ≥ ${alertConfig.vipQueueMinutes} min`,
          href: baseHref,
        });
      }
    }

    // C) Queue overload (Phase 3 config: queueOverloadThreshold)
    if (alertConfig.enableQueueOverload) {
      const pending = open.filter((i) => i.status === "pending");
      const byChatter = new Map<string, number>();
      for (const i of pending) {
        const cid = i.chatterId ?? "unassigned";
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
  }, [alertConfig, baseHref, computePhase3Alerts, subscribedItems, supervisor]);

  return { notifications, dismissNotification, persistentAlerts, subscribedItems };
}
