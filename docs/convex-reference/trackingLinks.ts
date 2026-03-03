import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getCreatorAccess, getSessionUser, requirePermission } from "./auth";

async function requireTrackingLinkAdmin(ctx: any, token: string) {
  return requirePermission(ctx, token, "model_tracking_links");
}

async function canAccessUserAssignments(ctx: any, token: string, userId: Id<"crm_chatters">) {
  const sessionUser = await getSessionUser(ctx, token);
  if (!sessionUser) throw new Error("Unauthorized");
  if (sessionUser._id === userId) return sessionUser;
  return requireTrackingLinkAdmin(ctx, token);
}

export const listTrackingLinksForAssignment = query({
  args: {
    token: v.string(),
    creatorId: v.optional(v.id("crm_creators")),
  },
  handler: async (ctx, args) => {
    await requireTrackingLinkAdmin(ctx, args.token);

    if (args.creatorId) {
      return await ctx.db
        .query("crm_of_tracking_links")
        .withIndex("by_creator", (q) => q.eq("creatorId", args.creatorId))
        .collect();
    }

    return await ctx.db.query("crm_of_tracking_links").collect();
  },
});

export const getAssignmentsForUser = query({
  args: {
    token: v.string(),
    userId: v.id("crm_chatters"),
  },
  handler: async (ctx, args) => {
    await canAccessUserAssignments(ctx, args.token, args.userId);

    const rows = await ctx.db
      .query("crm_tracking_link_assignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return rows.map((row) => row.trackingLinkId);
  },
});

export const setAssignmentsForUser = mutation({
  args: {
    token: v.string(),
    userId: v.id("crm_chatters"),
    trackingLinkIds: v.array(v.id("crm_of_tracking_links")),
  },
  handler: async (ctx, args) => {
    const admin = await requireTrackingLinkAdmin(ctx, args.token);
    const now = Date.now();

    const desiredIds = Array.from(new Set(args.trackingLinkIds));
    const desiredSet = new Set(desiredIds);

    const existing = await ctx.db
      .query("crm_tracking_link_assignments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const existingByLink = new Map(existing.map((row) => [row.trackingLinkId, row]));

    let inserted = 0;
    let removed = 0;

    for (const row of existing) {
      if (!desiredSet.has(row.trackingLinkId)) {
        await ctx.db.delete(row._id);
        removed += 1;
      }
    }

    for (const trackingLinkId of desiredIds) {
      if (existingByLink.has(trackingLinkId)) continue;

      const alreadyThere = await ctx.db
        .query("crm_tracking_link_assignments")
        .withIndex("by_user_link", (q) => q.eq("userId", args.userId).eq("trackingLinkId", trackingLinkId))
        .first();
      if (alreadyThere) continue;

      await ctx.db.insert("crm_tracking_link_assignments", {
        userId: args.userId,
        trackingLinkId,
        assignedAt: now,
        assignedBy: admin._id,
      });
      inserted += 1;
    }

    return {
      success: true,
      inserted,
      removed,
      total: desiredIds.length,
    };
  },
});

export const getMyTrackingLinks = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const assignments = await ctx.db
      .query("crm_tracking_link_assignments")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const links = await Promise.all(assignments.map((row) => ctx.db.get(row.trackingLinkId)));
    const creatorAccessCache = new Map<string, boolean>();
    const creatorNameCache = new Map<string, string>();

    const visible = [] as any[];

    // Links with creatorId — resolve name directly
    for (const link of links) {
      if (!link) continue;
      if (!link.creatorId) continue;

      const key = String(link.creatorId);
      let hasAccess = creatorAccessCache.get(key);
      if (hasAccess === undefined) {
        const axes = await getCreatorAccess(ctx, user._id, link.creatorId);
        hasAccess = !!axes.trackingLinks;
        creatorAccessCache.set(key, hasAccess);
      }

      if (hasAccess) {
        let creatorName = creatorNameCache.get(key);
        if (creatorName === undefined) {
          const creator = await ctx.db.get(link.creatorId);
          creatorName = creator?.name ?? "Unknown";
          creatorNameCache.set(key, creatorName);
        }
        visible.push({ ...link, creatorName });
      }
    }

    // Links without creatorId — resolve via crm_of_accounts (accountId → creatorId → name)
    for (const link of links) {
      if (!link || link.creatorId) continue;
      if (!link.accountId) continue;

      const account = await ctx.db
        .query("crm_of_accounts")
        .withIndex("by_account_id", (q) => q.eq("accountId", link.accountId))
        .first();

      if (account?.creatorId) {
        const creatorKey = String(account.creatorId);
        let hasAccess = creatorAccessCache.get(creatorKey);
        if (hasAccess === undefined) {
          const axes = await getCreatorAccess(ctx, user._id, account.creatorId);
          hasAccess = !!axes.trackingLinks;
          creatorAccessCache.set(creatorKey, hasAccess);
        }
        if (hasAccess) {
          let creatorName = creatorNameCache.get(creatorKey);
          if (creatorName === undefined) {
            const creator = await ctx.db.get(account.creatorId);
            creatorName = creator?.name ?? "Unknown";
            creatorNameCache.set(creatorKey, creatorName);
          }
          visible.push({ ...link, creatorName });
        }
      }
    }

    return visible;
  },
});

export const getTrackingLinkHistory = query({
  args: {
    token: v.string(),
    trackingLinkId: v.id("crm_of_tracking_links"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getSessionUser(ctx, args.token);
    if (!user) throw new Error("Unauthorized");

    const isAdmin = await requireTrackingLinkAdmin(ctx, args.token)
      .then(() => true)
      .catch(() => false);

    if (!isAdmin) {
      const assignment = await ctx.db
        .query("crm_tracking_link_assignments")
        .withIndex("by_user_link", (q) => q.eq("userId", user._id).eq("trackingLinkId", args.trackingLinkId))
        .first();
      if (!assignment) throw new Error("Forbidden");
    }

    const days = Math.max(1, Math.min(args.days ?? 30, 365));
    const startTs = Date.now() - days * 24 * 60 * 60 * 1000;

    return await ctx.db
      .query("crm_tracking_link_snapshots")
      .withIndex("by_link_time", (q) => q.eq("trackingLinkId", args.trackingLinkId).gte("snapshotAt", startTs))
      .order("desc")
      .collect();
  },
});
