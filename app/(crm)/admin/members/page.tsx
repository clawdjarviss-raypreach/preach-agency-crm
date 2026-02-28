"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

// ── Types ──────────────────────────────────────────────────────────────
interface RoleDoc {
  _id: Id<"crm_roles">;
  name: string;
  color: string;
  permissions: string[];
  isSystem: boolean;
}

interface MemberDoc {
  _id: Id<"crm_chatters">;
  name: string;
  username: string;
  email?: string;
  status: string;
  assignedCreators: string[];
  role: RoleDoc | null;
}

// NOTE: api.crm.creators.list returns `id` (not `_id`) and includes `accountId`
interface CreatorDoc {
  id: Id<"crm_creators">;
  name: string;
  accountId?: string;
}

interface TrackingLinkDoc {
  _id: Id<"crm_of_tracking_links">;
  accountId: string;
  name: string;
  url: string;
  creatorId?: Id<"crm_creators">;
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
  const mapped = ids.map((id) => creators.find((c) => String(c.id) === id)).filter(Boolean) as CreatorDoc[];
  const shown = mapped.slice(0, MAX);
  const overflow = mapped.length - MAX;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {shown.map((c, i) => (
        <div key={String(c.id)} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: MAX - i }}>
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
  const [removeMember, setRemoveMember] = useState<MemberDoc | null>(null);

  const [editRoleId, setEditRoleId] = useState<string>("");
  const [editCreatorIds, setEditCreatorIds] = useState<string[]>([]);
  const [creatorAccess, setCreatorAccess] = useState<Record<string, AccessAxes>>({});
  const [editTrackingLinkIds, setEditTrackingLinkIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const roles = useQuery(api.crm.teamManagement.listRoles, token ? { token } : "skip") as RoleDoc[] | undefined;
  const members = useQuery(
    api.crm.teamManagement.listMembers,
    token
      ? {
          token,
          ...(roleFilter !== "all" ? { roleId: roleFilter as Id<"crm_roles"> } : {}),
          ...(creatorFilter !== "all" ? { creatorId: creatorFilter as Id<"crm_creators"> } : {}),
          ...(search ? { search } : {}),
        }
      : "skip"
  ) as MemberDoc[] | undefined;
  const allCreators = useQuery(api.crm.creators.list, token ? { token } : "skip") as CreatorDoc[] | undefined;
  const inviteLink = useQuery(api.crm.teamManagement.getInviteLink, token ? { token } : "skip");

  // Filter creators to only those with an OF API account (have accountId)
  const creators = useMemo(() => {
    if (!allCreators) return undefined;
    return allCreators.filter((c) => !!c.accountId);
  }, [allCreators]);

  // Tracking links queries (only when editing a member)
  const allTrackingLinks = useQuery(
    api.crm.trackingLinks.listTrackingLinksForAssignment,
    token && editMember ? { token } : "skip"
  ) as TrackingLinkDoc[] | undefined;

  const currentAssignments = useQuery(
    api.crm.trackingLinks.getAssignmentsForUser,
    token && editMember ? { token, userId: editMember._id } : "skip"
  ) as Id<"crm_of_tracking_links">[] | undefined;

  const updateMemberMut = useMutation(api.crm.teamManagement.updateMember);
  const doRemoveMember = useMutation(api.crm.teamManagement.removeMember);
  const setCreatorAccessMut = useMutation(api.crm.teamManagement.setCreatorAccess);
  const resetInviteLinkMut = useMutation(api.crm.teamManagement.resetInviteLink);
  const setTrackingAssignmentsMut = useMutation(api.crm.trackingLinks.setAssignmentsForUser);

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
      const creator = creators.find((c) => String(c.id) === cid);
      if (!creator) continue;
      const links = allTrackingLinks.filter((l) => {
        if (l.creatorId && String(l.creatorId) === cid) return true;
        // Backward-compatible fallback while older tracking links are backfilled with creatorId.
        return !l.creatorId && !!creator.accountId && l.accountId === creator.accountId;
      });
      if (links.length === 0) continue;
      groups.push({ creatorId: cid, creatorName: creator.name, links });
    }
    return groups;
  }, [allTrackingLinks, creators, editCreatorIds, creatorAccess]);

  const openEdit = (m: MemberDoc) => {
    setEditMember(m);
    setEditRoleId(m.role ? String(m.role._id) : "");
    // Filter assigned creators to only OF API creators
    const validCreatorIds = new Set((creators || []).map((c) => String(c.id)));
    setEditCreatorIds((m.assignedCreators || []).filter((id: string) => validCreatorIds.has(id)));
    setCreatorAccess({});
    setEditTrackingLinkIds([]);
  };

  // Load current tracking link assignments when they arrive
  useEffect(() => {
    if (currentAssignments && editMember) {
      setEditTrackingLinkIds(currentAssignments.map(String));
    }
  }, [currentAssignments, editMember]);

  const handleSaveEdit = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      await updateMemberMut({
        token,
        chatterId: editMember._id,
        ...(editRoleId ? { roleId: editRoleId as Id<"crm_roles"> } : {}),
      });
      for (const cid of editCreatorIds) {
        const axes = creatorAccess[cid] || { socials: false, revenue: false, trackingLinks: false, subs: false };
        await setCreatorAccessMut({
          token,
          userId: editMember._id,
          creatorId: cid as Id<"crm_creators">,
          axes,
        });
      }
      // Save tracking link assignments
      await setTrackingAssignmentsMut({
        token,
        userId: editMember._id,
        trackingLinkIds: editTrackingLinkIds as Id<"crm_of_tracking_links">[],
      });
      setEditMember(null);
    } catch (err: any) {
      alert(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!removeMember) return;
    setSaving(true);
    try {
      await doRemoveMember({ token, chatterId: removeMember._id });
      setRemoveMember(null);
    } catch (err: any) {
      alert(err.message || "Failed to remove");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const activeMembers = (members || []).filter((m) => m.status !== "inactive");

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>👥 Members</h1>

      {/* Invite Link */}
      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Invite Link</span>
        <input readOnly value={inviteUrl} style={{ flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
        <button onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); }} style={btnStyle}>{copiedInvite ? "✓ Copied" : "📋 Copy"}</button>
        <button onClick={() => resetInviteLinkMut({ token })} style={{ ...btnStyle, background: "#7f1d1d" }}>🔄 Reset</button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Roles</option>
          {(roles || []).map((r) => <option key={String(r._id)} value={String(r._id)}>{r.name}</option>)}
        </select>
        <select value={creatorFilter} onChange={(e) => setCreatorFilter(e.target.value)} style={selectStyle}>
          <option value="all">All Creators</option>
          {(creators || []).map((c) => <option key={String(c.id)} value={String(c.id)}>{c.name}</option>)}
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
                <tr key={String(m._id)} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                  <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-muted)", fontFamily: "monospace" }}>{String(m._id).slice(-8)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <AvatarInitial name={m.name || m.username} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>@{m.username}</div>
                      </div>
                    </div>
                  </td>
                  <td style={tdStyle}><CreatorAvatars ids={m.assignedCreators || []} creators={creators || []} /></td>
                  <td style={{ ...tdStyle, fontSize: 13 }}>{m.email || "—"}</td>
                  <td style={tdStyle}><RoleBadge role={m.role} /></td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => openEdit(m)} style={btnSmall}>✏️ Edit</button>
                      <button onClick={() => setRemoveMember(m)} style={{ ...btnSmall, background: "#7f1d1d" }}>🗑️ Remove</button>
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
            {(roles || []).map((r) => <option key={String(r._id)} value={String(r._id)}>{r.name}</option>)}
          </select>

          <label style={labelStyle}>Assigned Creators</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8, marginBottom: 16, maxHeight: 200, overflowY: "auto" }}>
            {(creators || []).map((c) => {
              const cid = String(c.id);
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
                  const creator = (creators || []).find((c) => String(c.id) === cid);
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
                      {group.links.map((link) => {
                        const lid = String(link._id);
                        const checked = editTrackingLinkIds.includes(lid);
                        return (
                          <label key={lid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, border: `1px solid ${checked ? "#8b5cf6" : "var(--border)"}`, background: checked ? "rgba(139,92,246,0.08)" : "transparent", cursor: "pointer", fontSize: 12 }}>
                            <input type="checkbox" checked={checked} onChange={() => setEditTrackingLinkIds((prev) => checked ? prev.filter((x) => x !== lid) : [...prev, lid])} />
                            <span style={{ fontWeight: 500 }}>{link.name}</span>
                            <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: "auto" }}>{link.url}</span>
                          </label>
                        );
                      })}
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
      {removeMember && (
        <ModalOverlay onClose={() => setRemoveMember(null)}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Remove Member</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
            Are you sure you want to deactivate <strong>{removeMember.name}</strong>? They will lose all role assignments and creator access.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setRemoveMember(null)} style={btnStyle}>Cancel</button>
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
