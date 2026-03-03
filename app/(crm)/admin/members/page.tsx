"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────
interface RoleDoc {
  id: string;
  name: string;
  color: string;
  permissions: string[];
  is_system: boolean;
}

interface MemberDoc {
  id: string;
  name: string;
  username: string;
  email?: string;
  status: string;
  assigned_creators: string[];
  role: RoleDoc | null;
}

interface CreatorDoc {
  id: string;
  name: string;
  platform_account_id?: string;
}

interface TrackingLinkDoc {
  id: string;
  account_id: string;
  name: string;
  url: string;
  creator_id?: string;
}

interface AccessAxes {
  socials: boolean;
  revenue: boolean;
  trackingLinks: boolean;
  subs: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function AvatarInitial({ name, size = 32 }: { name: string; size?: number }) {
  const bg = avatarColor(name);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.45,
        fontWeight: 700,
        color: "#fff",
        flexShrink: 0,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function RoleBadge({ role }: { role: RoleDoc | null }) {
  if (!role) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 600,
        color: role.color,
        background: `${role.color}18`,
        borderRadius: 6,
        textTransform: "capitalize",
      }}
    >
      {role.name}
    </span>
  );
}

function CreatorAvatars({ ids, creators }: { ids: string[]; creators: CreatorDoc[] }) {
  const MAX = 3;
  const mapped = ids.map((id) => creators.find((c) => c.id === id)).filter(Boolean) as CreatorDoc[];
  const shown = mapped.slice(0, MAX);
  const overflow = mapped.length - MAX;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {shown.map((c, i) => (
        <div key={c.id} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: MAX - i }}>
          <AvatarInitial name={c.name} size={26} />
        </div>
      ))}
      {overflow > 0 && (
        <span
          style={{
            marginLeft: 4,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "2px 6px",
          }}
        >
          +{overflow}
        </span>
      )}
      {mapped.length === 0 && <span style={{ color: "var(--text-muted)", fontSize: 13 }}>—</span>}
    </div>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          overflowY: "auto",
          background: "var(--surface)",
          borderRadius: 16,
          padding: 24,
          border: "1px solid var(--border)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        width: 34,
        height: 20,
        borderRadius: 10,
        background: checked ? "#3b82f6" : "#4b5563",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 16 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }}
      />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────
export default function MembersPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);

  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [creatorFilter, setCreatorFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [editMember, setEditMember] = useState<MemberDoc | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<MemberDoc | null>(null);

  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editCreatorIds, setEditCreatorIds] = useState<string[]>([]);
  const [creatorAccess, setCreatorAccess] = useState<Record<string, AccessAxes>>({});
  const [editTrackingLinkIds, setEditTrackingLinkIds] = useState<string[]>([]);
  const [expandedTrackingCreators, setExpandedTrackingCreators] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Data state
  const [roles, setRoles] = useState<RoleDoc[] | undefined>(undefined);
  const [members, setMembers] = useState<MemberDoc[] | undefined>(undefined);
  const [allCreators, setAllCreators] = useState<CreatorDoc[] | undefined>(undefined);
  const [inviteLink, setInviteLink] = useState<any>(null);
  const [allTrackingLinks, setAllTrackingLinks] = useState<TrackingLinkDoc[] | undefined>(undefined);
  const [currentAssignments, setCurrentAssignments] = useState<string[] | undefined>(undefined);
  const [existingAccess, setExistingAccess] = useState<Record<string, AccessAxes> | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  // Fetch main data
  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    let cancelled = false;

    const [rolesRes, membersRes, creatorsRes, inviteLinkRes] = await Promise.all([
      supabase.from("crm_roles").select("*"),
      supabase.from("crm_chatters").select("*, role:crm_roles!crm_chatters_role_id_fkey(*)").neq("status", "inactive"),
      supabase.from("crm_creators").select("id, name, platform_account_id"),
      supabase.from("crm_invite_link").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (cancelled) return;

    if (rolesRes.data) setRoles(rolesRes.data as RoleDoc[]);

    // Transform members: the joined role comes as an object or null
    if (membersRes.data) {
      const transformed = membersRes.data.map((m: any) => ({
        id: m.id,
        name: m.name,
        username: m.username,
        email: m.email,
        status: m.status,
        assigned_creators: m.assigned_creators || [],
        role: m.role || null,
      }));

      // Apply client-side filters
      let filtered = transformed;
      if (roleFilter !== "all") {
        filtered = filtered.filter((m: MemberDoc) => m.role && m.role.id === roleFilter);
      }
      if (creatorFilter !== "all") {
        filtered = filtered.filter((m: MemberDoc) => m.assigned_creators.includes(creatorFilter));
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((m: MemberDoc) =>
          m.name.toLowerCase().includes(q) ||
          m.username.toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q)
        );
      }
      setMembers(filtered);
    }

    if (creatorsRes.data) setAllCreators(creatorsRes.data as CreatorDoc[]);
    setInviteLink(inviteLinkRes.data || null);
    setLoading(false);

    return () => { cancelled = true; };
  }, [token, roleFilter, creatorFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch edit-member-specific data when editing
  const fetchEditMemberData = useCallback(async (memberId: string) => {
    if (!token) return;
    let cancelled = false;

    const [trackingRes, assignmentsRes, accessRes] = await Promise.all([
      supabase.from("crm_of_tracking_links").select("*"),
      supabase.from("crm_tracking_link_assignments").select("tracking_link_id").eq("user_id", memberId),
      supabase.from("crm_user_creator_access").select("*").eq("user_id", memberId),
    ]);

    if (cancelled) return;

    if (trackingRes.data) setAllTrackingLinks(trackingRes.data as TrackingLinkDoc[]);
    if (assignmentsRes.data) setCurrentAssignments(assignmentsRes.data.map((r: any) => r.tracking_link_id));

    // Transform access rows into Record<creatorId, axes>
    if (accessRes.data) {
      const accessMap: Record<string, AccessAxes> = {};
      for (const row of accessRes.data) {
        accessMap[row.creator_id] = row.axes as AccessAxes;
      }
      setExistingAccess(accessMap);
    }

    return () => { cancelled = true; };
  }, [token]);

  // Filter creators to only those with a platform account
  const creators = useMemo(() => {
    if (!allCreators) return undefined;
    return allCreators.filter((c) => !!c.platform_account_id);
  }, [allCreators]);

  const inviteUrl = useMemo(() => {
    if (!inviteLink?.token) return "";
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/crm/invite/${inviteLink.token}`;
  }, [inviteLink]);

  // Group tracking links by creator, only for creators where user has trackingLinks axis enabled
  const trackingLinksByCreator = useMemo(() => {
    if (!allTrackingLinks || !creators) return [];
    const groups: { creatorId: string; creatorName: string; links: TrackingLinkDoc[] }[] = [];
    for (const cid of editCreatorIds) {
      const axes = creatorAccess[cid];
      if (!axes?.trackingLinks) continue;
      const creator = creators.find((c) => c.id === cid);
      if (!creator) continue;
      const links = allTrackingLinks.filter((l) => {
        if (l.creator_id && l.creator_id === cid) return true;
        // Backward-compatible fallback while older tracking links are backfilled with creator_id.
        return !l.creator_id && !!creator.platform_account_id && l.account_id === creator.platform_account_id;
      });
      if (links.length === 0) continue;
      groups.push({ creatorId: cid, creatorName: creator.name, links });
    }
    return groups;
  }, [allTrackingLinks, creators, editCreatorIds, creatorAccess]);

  const openEdit = (m: MemberDoc) => {
    setEditMember(m);
    setEditRoleId(m.role ? m.role.id : "");
    // Filter assigned creators to only OF API creators
    const validCreatorIds = new Set((creators || []).map((c) => c.id));
    setEditCreatorIds((m.assigned_creators || []).filter((id: string) => validCreatorIds.has(id)));
    setEditKey(k => k + 1);
    setEditTrackingLinkIds([]);
    setAllTrackingLinks(undefined);
    setCurrentAssignments(undefined);
    setExistingAccess(undefined);
    // Fetch edit-member specific data
    fetchEditMemberData(m.id);
  };

  // Load existing creator access axes when they arrive
  useEffect(() => {
    if (existingAccess && editMember) {
      setCreatorAccess(existingAccess);
    }
  }, [existingAccess, editMember, editKey]);

  // Load current tracking link assignments when they arrive
  useEffect(() => {
    if (currentAssignments && editMember) {
      setEditTrackingLinkIds(currentAssignments);
    }
  }, [currentAssignments, editMember]);

  const handleSaveEdit = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      // Update role
      if (editRoleId) {
        const { error } = await supabase.from("crm_chatters").update({ role_id: editRoleId }).eq("id", editMember.id);
        if (error) throw error;
      }

      // Save assigned creators to crm_chatters
      const { error: creatorsErr } = await supabase.from("crm_chatters").update({ assigned_creators: editCreatorIds }).eq("id", editMember.id);
      if (creatorsErr) throw creatorsErr;

      // Update creator access axes
      for (const cid of editCreatorIds) {
        const axes = creatorAccess[cid] || { socials: false, revenue: false, trackingLinks: false, subs: false };
        const { error } = await supabase.from("crm_user_creator_access").upsert(
          { user_id: editMember.id, creator_id: cid, axes },
          { onConflict: "user_id,creator_id" }
        );
        if (error) throw error;
      }

      // Save tracking link assignments: delete existing, insert new
      const { error: delErr } = await supabase.from("crm_tracking_link_assignments").delete().eq("user_id", editMember.id);
      if (delErr) throw delErr;

      if (editTrackingLinkIds.length > 0) {
        const rows = editTrackingLinkIds.map((tlId) => ({
          user_id: editMember.id,
          tracking_link_id: tlId,
        }));
        const { error: insErr } = await supabase.from("crm_tracking_link_assignments").insert(rows);
        if (insErr) throw insErr;
      }

      setEditMember(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeMemberTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("crm_chatters").update({ status: "inactive" }).eq("id", removeMemberTarget.id);
      if (error) throw error;
      setRemoveMemberTarget(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to remove");
    } finally {
      setSaving(false);
    }
  };

  const handleResetInviteLink = async () => {
    try {
      // Delete all existing invite links
      const { error: delErr } = await supabase.from("crm_invite_link").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (delErr) throw delErr;

      // Insert new one
      const { error: insErr } = await supabase.from("crm_invite_link").insert({ token: crypto.randomUUID() });
      if (insErr) throw insErr;

      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to reset invite link");
    }
  };

  if (!user) return null;

  if (loading && !members) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading members...</div>;
  }

  const activeMembers = (members || []).filter((m) => m.status !== "inactive");

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>👥 Members</h1>

      {/* Invite Link */}
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Invite Link</span>
        <input readOnly value={inviteUrl} style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
        <button onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); }} style={btnStyle}>{copiedInvite ? "✓ Copied" : "📋 Copy"}</button>
        <button onClick={handleResetInviteLink} style={{ ...btnStyle, background: "#7f1d1d" }}>🔄 Reset</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Roles</option>
          {(roles || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Creators</option>
          {(creators || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Search by name, username, email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
      </div>

      {/* Table */}
      <div style={{ background: "var(--surface)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["ID", "Name", "Assigned Creators", "Email", "Role", "Actions"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeMembers.length === 0 && (
                <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-muted)", padding: 32 }}>No members found</td></tr>
              )}
              {activeMembers.map((m, idx) => (
                <tr key={m.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                  <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{m.id.slice(-8)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <AvatarInitial name={m.name || m.username} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>@{m.username}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}><CreatorAvatars ids={m.assigned_creators || []} creators={creators || []} /></td>
                  <td style={{ ...tdStyle, fontSize: 13 }}>{m.email || "—"}</td>
                  <td style={tdStyle}><RoleBadge role={m.role} /></td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(m)} style={btnSmall}>✏️ Edit</button>
                      <button onClick={() => setRemoveMemberTarget(m)} style={{ ...btnSmall, background: "#7f1d1d" }}>🗑️ Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editMember && (
        <ModalOverlay onClose={() => setEditMember(null)}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Edit Member — {editMember.name}</h2>

          <label style={labelStyle}>Role</label>
          <select value={editRoleId} onChange={(e) => setEditRoleId(e.target.value)} style={{ ...selectStyle, width: "100%", marginBottom: 16 }}>
            <option value="">No role</option>
            {(roles || []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>

          <label style={labelStyle}>Assigned Creators</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: 16, maxHeight: 200, overflowY: "auto" }}>
            {(creators || []).map((c) => {
              const cid = c.id;
              const checked = editCreatorIds.includes(cid);
              return (
                <label key={cid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${checked ? "#3b82f6" : "var(--border)"}`, background: checked ? "rgba(59,130,246,0.08)" : "transparent", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={checked} onChange={() => setEditCreatorIds((prev) => checked ? prev.filter((x) => x !== cid) : [...prev, cid])} />
                  <AvatarInitial name={c.name} size={22} />
                  {c.name}
                </label>
              );
            })}
          </div>

          {editCreatorIds.length > 0 && (
            <>
              <label style={labelStyle}>Access Axes</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {editCreatorIds.map((cid) => {
                  const creator = (creators || []).find((c) => c.id === cid);
                  const axes = creatorAccess[cid] || { socials: false, revenue: false, trackingLinks: false, subs: false };
                  const update = (field: keyof AccessAxes) => setCreatorAccess((prev) => ({ ...prev, [cid]: { ...axes, [field]: !axes[field] } }));
                  return (
                    <div key={cid} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{creator?.name || cid}</div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {(["socials", "revenue", "trackingLinks", "subs"] as const).map((axis) => (
                          <label key={axis} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                            <ToggleSwitch checked={axes[axis]} onChange={() => update(axis)} />
                            <span style={{ textTransform: "capitalize" }}>{axis === "trackingLinks" ? "Tracking" : axis}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Assigned Tracking Links */}
          {trackingLinksByCreator.length > 0 && (
            <>
              <label style={labelStyle}>Assigned Tracking Links</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                {trackingLinksByCreator.map((group) => (
                  <div key={group.creatorId} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <AvatarInitial name={group.creatorName} size={20} />
                      {group.creatorName}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(() => {
                        const expanded = expandedTrackingCreators.has(group.creatorId);
                        const visibleLinks = expanded ? group.links : group.links.slice(0, 10);
                        const hasMore = group.links.length > 10;
                        return (
                          <>
                            {visibleLinks.map((link) => {
                              const lid = link.id;
                              const checked = editTrackingLinkIds.includes(lid);
                              return (
                                <label key={lid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, border: `1px solid ${checked ? "#8b5cf6" : "var(--border)"}`, background: checked ? "rgba(139,92,246,0.08)" : "transparent", cursor: "pointer", fontSize: 12 }}>
                                  <input type="checkbox" checked={checked} onChange={() => setEditTrackingLinkIds((prev) => checked ? prev.filter((x) => x !== lid) : [...prev, lid])} />
                                  <span style={{ fontWeight: 500 }}>{link.name}</span>
                                  <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: "auto" }}>{link.url}</span>
                                </label>
                              );
                            })}
                            {hasMore && !expanded && (
                              <button
                                onClick={() => setExpandedTrackingCreators((prev) => { const next = new Set(prev); next.add(group.creatorId); return next; })}
                                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "center" }}
                              >
                                Show More ({group.links.length - 10} more)
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setEditMember(null)} style={btnStyle}>Cancel</button>
            <button onClick={handleSaveEdit} disabled={saving} style={{ ...btnStyle, background: "#3b82f6", color: "#fff" }}>{saving ? "Saving…" : "Save Changes"}</button>
          </div>
        </ModalOverlay>
      )}

      {/* Remove Confirmation */}
      {removeMemberTarget && (
        <ModalOverlay onClose={() => setRemoveMemberTarget(null)}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Remove Member</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
            Are you sure you want to deactivate <strong>{removeMemberTarget.name}</strong>? They will lose all role assignments and creator access.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setRemoveMemberTarget(null)} style={btnStyle}>Cancel</button>
            <button onClick={handleRemove} disabled={saving} style={{ ...btnStyle, background: "#ef4444", color: "#fff" }}>{saving ? "Removing…" : "Confirm Remove"}</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "#1f2937", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500 };
const btnSmall: React.CSSProperties = { padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "#1f2937", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 500 };
const selectStyle: React.CSSProperties = { padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "12px 14px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--border)" };
const tdStyle: React.CSSProperties = { padding: "12px 14px", borderBottom: "1px solid var(--border-subtle)", fontSize: 14, color: "var(--text)" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
