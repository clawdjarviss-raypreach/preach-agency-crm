"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";

type ModalType = "add" | "edit" | "assignments" | "resetPin" | null;
type RoleFilter = "all" | "chatter" | "supervisor" | "manager" | "admin";

const ROLE_TABS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "chatter", label: "Chatters" },
  { value: "supervisor", label: "Supervisors" },
  { value: "manager", label: "Managers" },
  { value: "admin", label: "Admins" },
];

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedChatter, setSelectedChatter] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [creatorFilter, setCreatorFilter] = useState<string>("all");

  // Form state for add/edit
  const [formName, setFormName] = useState("");
  const [formUsername, setFormUsername] = useState("");
  const [formPin, setFormPin] = useState("");
  const [formRole, setFormRole] = useState<string>("chatter");
  const [formEmoji, setFormEmoji] = useState("👤");
  const [formProfilePictureUrl, setFormProfilePictureUrl] = useState("");
  const [formProfilePicturePreview, setFormProfilePicturePreview] = useState("");
  const [formHourlyRate, setFormHourlyRate] = useState("");
  const [formCommissionPct, setFormCommissionPct] = useState("");
  const [formAssignedCreators, setFormAssignedCreators] = useState<Record<string, boolean>>({});

  // Assignment state
  const [assignmentSelections, setAssignmentSelections] = useState<Record<string, boolean>>({});

  // Reset pin state
  const [newPin, setNewPin] = useState("");

  // Invite panel
  const [inviteEmail, setInviteEmail] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Data state
  const [chatters, setChatters] = useState<any[] | undefined>(undefined);
  const [creators, setCreators] = useState<any[] | undefined>(undefined);
  const [activeShifts, setActiveShifts] = useState<any[] | undefined>(undefined);
  const [invites, setInvites] = useState<any[] | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    let cancelled = false;

    const [chattersRes, creatorsRes, shiftsRes, invitesRes] = await Promise.all([
      supabase.from("crm_chatters").select("*"),
      supabase.from("crm_creators").select("*"),
      supabase.from("crm_shifts").select("*, chatter:crm_chatters(id, name)").is("clock_out", null),
      supabase.from("crm_invite_tokens").select("*").order("created_at", { ascending: false }),
    ]);

    if (cancelled) return;

    if (chattersRes.data) setChatters(chattersRes.data);
    if (creatorsRes.data) setCreators(creatorsRes.data);
    if (shiftsRes.data) setActiveShifts(shiftsRes.data);
    if (invitesRes.data) setInvites(invitesRes.data);
    setLoading(false);

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Stats
  const totalMembers = chatters?.length || 0;
  const activeNow = activeShifts?.length || 0;
  const activeMembers = chatters?.filter((c: any) => c.status === "active").length || 0;

  // Active chatter IDs for status badge
  const activeClockedInIds = useMemo(() => {
    return new Set((activeShifts || []).map((s: any) => s.chatter?.id).filter(Boolean));
  }, [activeShifts]);

  // Filtered chatters
  const filteredChatters = useMemo(() => {
    if (!chatters) return [];
    let result = [...chatters];

    // Role filter
    if (roleFilter !== "all") {
      result = result.filter((c: any) => c.role === roleFilter);
    }

    // Creator filter
    if (creatorFilter !== "all") {
      result = result.filter((c: any) =>
        c.assigned_creators && c.assigned_creators.includes(creatorFilter)
      );
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c: any) =>
        c.name.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q)
      );
    }

    return result;
  }, [chatters, roleFilter, creatorFilter, searchQuery]);

  const clearMessages = () => { setError(""); setSuccess(""); };

  const openAddModal = () => {
    clearMessages();
    setFormName("");
    setFormUsername("");
    setFormPin("");
    setFormRole("chatter");
    setFormEmoji("👤");
    setFormProfilePictureUrl("");
    setFormProfilePicturePreview("");
    setFormHourlyRate("");
    setFormCommissionPct("");
    // Reset creator assignments
    const selections: Record<string, boolean> = {};
    (creators || []).forEach((c: any) => { selections[c.name] = false; });
    setFormAssignedCreators(selections);
    setSelectedChatter(null);
    setModal("add");
  };

  const openEditModal = (chatter: any) => {
    clearMessages();
    setFormName(chatter.name);
    setFormUsername(chatter.username);
    setFormRole(chatter.role);
    setFormEmoji(chatter.avatar_emoji || "👤");
    setFormProfilePictureUrl(chatter.profile_picture_url || "");
    setFormProfilePicturePreview(chatter.profile_picture_url || "");
    setFormHourlyRate(chatter.hourly_rate?.toString() || "");
    setFormCommissionPct(chatter.commission_pct?.toString() || "");
    setSelectedChatter(chatter);
    setModal("edit");
  };

  const openAssignmentsModal = (chatter: any) => {
    clearMessages();
    setSelectedChatter(chatter);
    const selections: Record<string, boolean> = {};
    (creators || []).forEach((c: any) => {
      selections[c.name] = (chatter.assigned_creators || []).includes(c.name);
    });
    setAssignmentSelections(selections);
    setModal("assignments");
  };

  const openResetPinModal = (chatter: any) => {
    clearMessages();
    setSelectedChatter(chatter);
    setNewPin("");
    setModal("resetPin");
  };

  const handleAdd = async () => {
    if (!formName.trim() || !formUsername.trim() || !formPin.trim()) {
      setError("Name, username, and PIN are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const assignedCreators = Object.entries(formAssignedCreators)
        .filter(([, v]) => v)
        .map(([k]) => k);
      // TODO: pin_hash should ideally be hashed, but for now store as-is
      const { error: insertErr } = await supabase.from("crm_chatters").insert({
        name: formName.trim(),
        username: formUsername.trim().toLowerCase(),
        pin_hash: formPin,
        role: formRole,
        assigned_creators: assignedCreators,
        avatar_emoji: formEmoji || undefined,
        profile_picture_url: formProfilePictureUrl.trim() || undefined,
        hourly_rate: formHourlyRate ? parseFloat(formHourlyRate) : undefined,
        commission_pct: formCommissionPct ? parseFloat(formCommissionPct) : undefined,
      });
      if (insertErr) throw insertErr;
      setSuccess(`${formName} added successfully!`);
      setModal(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to add member");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedChatter) return;
    setSaving(true);
    setError("");
    try {
      const { error: updateErr } = await supabase.from("crm_chatters").update({
        name: formName.trim() || undefined,
        role: formRole,
        avatar_emoji: formEmoji || undefined,
        profile_picture_url: formProfilePictureUrl.trim() || undefined,
        hourly_rate: formHourlyRate ? parseFloat(formHourlyRate) : undefined,
        commission_pct: formCommissionPct ? parseFloat(formCommissionPct) : undefined,
      }).eq("id", selectedChatter.id);
      if (updateErr) throw updateErr;
      setSuccess(`${formName} updated!`);
      setModal(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update member");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAssignments = async () => {
    if (!selectedChatter) return;
    setSaving(true);
    setError("");
    try {
      const selected = Object.entries(assignmentSelections)
        .filter(([, v]) => v)
        .map(([k]) => k);
      const { error: updateErr } = await supabase.from("crm_chatters").update({
        assigned_creators: selected,
      }).eq("id", selectedChatter.id);
      if (updateErr) throw updateErr;
      setSuccess(`Assignments updated for ${selectedChatter.name}!`);
      setModal(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update assignments");
    } finally {
      setSaving(false);
    }
  };

  const handleResetPin = async () => {
    if (!selectedChatter || !newPin) return;
    setSaving(true);
    setError("");
    try {
      // TODO: pin_hash should ideally be hashed
      const { error: updateErr } = await supabase.from("crm_chatters").update({
        pin_hash: newPin,
      }).eq("id", selectedChatter.id);
      if (updateErr) throw updateErr;
      setSuccess(`PIN reset for ${selectedChatter.name}!`);
      setModal(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to reset PIN");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (chatter: any) => {
    if (!confirm(`${chatter.status === "active" ? "Deactivate" : "Reactivate"} ${chatter.name}?`)) return;
    try {
      const newStatus = chatter.status === "active" ? "inactive" : "active";
      const { error: updateErr } = await supabase.from("crm_chatters").update({
        status: newStatus,
      }).eq("id", chatter.id);
      if (updateErr) throw updateErr;
      setSuccess(`${chatter.name} ${chatter.status === "active" ? "deactivated" : "reactivated"}!`);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to update status");
    }
  };

  const handleCreateInvite = async () => {
    if (!inviteEmail.trim() || !token || !user?.id) {
      setError("Email is required");
      return;
    }

    setCreatingInvite(true);
    setError("");
    try {
      const inviteToken = crypto.randomUUID();
      const { data, error: insertErr } = await supabase.from("crm_invite_tokens").insert({
        token: inviteToken,
        creator_id: user.id,
        email: inviteEmail,
        status: "active",
        created_by: user.id,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).select().single();
      if (insertErr) throw insertErr;
      setInviteEmail("");
      const inviteUrl = `/crm/invite/${data.token}`;
      setSuccess(`Invite created: ${inviteUrl}`);
      await navigator.clipboard.writeText(`${window.location.origin}${inviteUrl}`);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to create invite");
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (tokenId: string) => {
    if (!confirm("Revoke this invite link?")) return;
    try {
      const { error: updateErr } = await supabase.from("crm_invite_tokens").update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
      }).eq("id", tokenId);
      if (updateErr) throw updateErr;
      setSuccess("Invite revoked");
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to revoke invite");
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "#ef4444";
      case "manager": return "#8b5cf6";
      case "supervisor": return "#f59e0b";
      default: return "#22c55e";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "var(--green)";
      case "inactive": return "var(--text-muted)";
      case "trial": return "var(--orange)";
      default: return "var(--text-muted)";
    }
  };

  const EMOJI_OPTIONS = ["👤", "🦊", "🐱", "🐶", "🦁", "🐼", "🐨", "🐸", "🦋", "🌸", "⭐", "🔥", "💎", "🎯", "🚀", "👑", "🎭", "🌊", "🍀", "🎨"];

  // Check if user is admin
  if (user && user.role !== "admin") {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>Access Denied</h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>You don&apos;t have permission to view this page</p>
      </div>
    );
  }

  if (!user) return null;

  if (loading && !chatters) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading team data...</div>;
  }

  return (
    <div style={{ maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>⚙️ Team Management</h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>Manage team members, assignments, and settings</p>
        </div>
        <button onClick={openAddModal} style={{
          padding: "12px 24px", fontSize: "14px", fontWeight: "600",
          color: "#fff", background: "var(--accent)", border: "none",
          borderRadius: "14px", cursor: "pointer", transition: "all 0.2s",
        }}>
          ➕ Add Member
        </button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div style={{ padding: "14px 20px", background: "var(--green-bg)", color: "var(--green)", borderRadius: "14px", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
          ✅ {success}
        </div>
      )}
      {error && !modal && (
        <div style={{ padding: "14px 20px", background: "var(--red-bg)", color: "var(--red)", borderRadius: "14px", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
          ❌ {error}
        </div>
      )}

      {/* Invite Panel */}
      <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "18px", marginBottom: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "var(--text)", marginBottom: "10px" }}>🔗 Invite Link Signup</h2>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "14px" }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="new.chatter@email.com"
            style={{ ...inputStyle, maxWidth: 320 }}
          />
          <button onClick={handleCreateInvite} disabled={creatingInvite} style={{ ...saveBtnStyle, flex: "0 0 auto", padding: "12px 16px" }}>
            {creatingInvite ? "Generating..." : "Generate Invite"}
          </button>
        </div>

        <div style={{ display: "grid", gap: "8px" }}>
          {(invites || []).map((invite: any) => (
            <div key={invite.id} style={{ border: "1px solid var(--border)", borderRadius: "12px", padding: "10px 12px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: "13px", color: "var(--text)", fontWeight: 600 }}>{invite.email}</div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>/crm/invite/{invite.token}</div>
              </div>
              <span style={{ fontSize: "11px", padding: "4px 8px", borderRadius: "999px", background: "var(--bg)", color: "var(--text-secondary)", textTransform: "uppercase" }}>{invite.status}</span>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/crm/invite/${invite.token}`)}
                style={cardActionBtnStyle}
              >
                Copy
              </button>
              {invite.status === "active" && (
                <button onClick={() => handleRevokeInvite(invite.id)} style={{ ...cardActionBtnStyle, color: "var(--red)" }}>
                  Revoke
                </button>
              )}
            </div>
          ))}
          {invites && invites.length === 0 && (
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>No invites yet.</div>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "12px",
        marginBottom: "20px",
      }}>
        {[
          { label: "Total Members", value: totalMembers, color: "var(--accent)", emoji: "👥" },
          { label: "Active Members", value: activeMembers, color: "var(--green)", emoji: "✅" },
          { label: "Clocked In Now", value: activeNow, color: "#8b5cf6", emoji: "🟢" },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: "var(--surface)", borderRadius: "16px", padding: "18px 20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: "12px",
          }}>
            <span style={{ fontSize: "24px" }}>{stat.emoji}</span>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>{stat.label}</div>
              <div style={{ fontSize: "24px", fontWeight: "700", color: stat.color }}>{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Role Tabs + Creator Filter */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px",
        flexWrap: "wrap",
      }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1", minWidth: "200px", maxWidth: "320px" }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            style={{
              width: "100%", padding: "10px 16px 10px 38px", fontSize: "14px",
              border: "2px solid var(--border)", borderRadius: "12px",
              background: "var(--surface)", color: "var(--text)", outline: "none",
            }}
          />
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "16px", color: "var(--text-muted)" }}>🔍</span>
        </div>

        {/* Creator Filter */}
        <select
          value={creatorFilter}
          onChange={(e) => setCreatorFilter(e.target.value)}
          style={{
            padding: "8px 14px", fontSize: "13px", fontWeight: "600",
            border: creatorFilter !== "all" ? "2px solid var(--accent)" : "2px solid var(--border)",
            borderRadius: "12px", cursor: "pointer",
            background: creatorFilter !== "all" ? "rgba(196,149,106,0.1)" : "var(--surface)",
            color: creatorFilter !== "all" ? "var(--accent)" : "var(--text-secondary)",
            outline: "none", appearance: "none",
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 10px center",
            paddingRight: "30px",
          }}
        >
          <option value="all">All Creators</option>
          {(creators || []).map((c: any) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>

        {/* Role Tabs */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {ROLE_TABS.map((tab) => {
            const isActive = roleFilter === tab.value;
            const count = tab.value === "all"
              ? chatters?.length || 0
              : chatters?.filter((c: any) => c.role === tab.value).length || 0;
            return (
              <button
                key={tab.value}
                onClick={() => setRoleFilter(tab.value)}
                style={{
                  padding: "8px 16px", fontSize: "13px", fontWeight: "600",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  background: isActive ? "var(--accent)" : "var(--surface)",
                  border: isActive ? "none" : "1px solid var(--border)",
                  borderRadius: "20px", cursor: "pointer", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Card Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}>
        {filteredChatters.map((chatter: any) => {
          const isClockedIn = activeClockedInIds.has(chatter.id);

          return (
            <div
              key={chatter.id}
              style={{
                background: "var(--surface)",
                borderRadius: "20px",
                padding: "20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                opacity: chatter.status === "inactive" ? 0.6 : 1,
                transition: "all 0.15s",
                border: isClockedIn ? "2px solid var(--green)" : "1px solid var(--border)",
              }}
            >
              {/* Top Row: Avatar + Name + Status */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                {chatter.profile_picture_url ? (
                  <img
                    src={chatter.profile_picture_url}
                    alt={chatter.name}
                    style={{
                      width: "48px", height: "48px", borderRadius: "14px",
                      objectFit: "cover", flexShrink: 0,
                    }}
                  />
                ) : (
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "14px",
                    background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px",
                    flexShrink: 0,
                  }}>
                    {chatter.avatar_emoji || "👤"}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
                      {chatter.name}
                    </span>
                    <div style={{
                      padding: "3px 10px", fontSize: "10px", fontWeight: "700",
                      color: getRoleBadgeColor(chatter.role),
                      background: `${getRoleBadgeColor(chatter.role)}15`,
                      borderRadius: "8px", textTransform: "uppercase", letterSpacing: "0.5px",
                    }}>
                      {chatter.role}
                    </div>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                    @{chatter.username}
                  </div>
                </div>
                {/* Status indicator */}
                <div style={{
                  padding: "4px 10px", fontSize: "10px", fontWeight: "600",
                  color: isClockedIn ? "var(--green)" : getStatusColor(chatter.status),
                  background: isClockedIn ? "var(--green-bg)" : `${getStatusColor(chatter.status)}15`,
                  borderRadius: "8px", textTransform: "uppercase", whiteSpace: "nowrap",
                }}>
                  {isClockedIn ? "🟢 Online" : chatter.status}
                </div>
              </div>

              {/* Assigned Creators */}
              <div style={{ marginBottom: "14px", minHeight: "28px" }}>
                {chatter.assigned_creators && chatter.assigned_creators.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {chatter.assigned_creators.map((name: string) => (
                      <span key={name} style={{
                        padding: "3px 8px", fontSize: "11px", fontWeight: "500",
                        background: "var(--bg)", color: "var(--accent)",
                        borderRadius: "6px", border: "1px solid var(--border)",
                      }}>
                        {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                    No creators assigned
                  </span>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "6px", borderTop: "1px solid var(--border-subtle)", paddingTop: "12px" }}>
                <button onClick={() => openEditModal(chatter)} style={cardActionBtnStyle} title="Edit">
                  ✏️ Edit
                </button>
                <button onClick={() => openAssignmentsModal(chatter)} style={cardActionBtnStyle} title="Assign Creators">
                  🎯 Assign
                </button>
                <button onClick={() => openResetPinModal(chatter)} style={cardActionBtnStyle} title="Reset PIN">
                  🔑
                </button>
                <button onClick={() => handleToggleStatus(chatter)} style={{
                  ...cardActionBtnStyle,
                  color: chatter.status === "active" ? "var(--red)" : "var(--green)",
                  marginLeft: "auto",
                }} title={chatter.status === "active" ? "Deactivate" : "Reactivate"}>
                  {chatter.status === "active" ? "⏸️" : "▶️"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredChatters.length === 0 && (
        <div style={{
          background: "var(--surface)", borderRadius: "20px", padding: "48px 24px",
          textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🔍</div>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)" }}>
            {searchQuery ? `No members matching "${searchQuery}"` : "No team members found"}
          </p>
        </div>
      )}

      {/* ── MODALS ── */}
      {modal && (
        <div onClick={() => setModal(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "16px",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--surface)", borderRadius: "24px", padding: "28px",
            width: "100%", maxWidth: "520px", maxHeight: "90vh", overflow: "auto",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            {/* Add Member Modal */}
            {modal === "add" && (
              <>
                <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "20px" }}>➕ Add Team Member</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Full name" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Username *</label>
                    <input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} placeholder="login_username" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>PIN * (4-6 digits)</label>
                    <input value={formPin} onChange={(e) => setFormPin(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="1234" style={inputStyle} type="password" inputMode="numeric" />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={formRole} onChange={(e) => setFormRole(e.target.value)} style={inputStyle}>
                      <option value="chatter">Chatter</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Avatar Emoji (fallback)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {EMOJI_OPTIONS.map((e) => (
                        <button key={e} onClick={() => setFormEmoji(e)} style={{
                          width: "40px", height: "40px", fontSize: "20px",
                          border: formEmoji === e ? "2px solid var(--accent)" : "2px solid var(--border)",
                          borderRadius: "10px", background: formEmoji === e ? "rgba(196,149,106,0.15)" : "var(--bg)",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{e}</button>
                      ))}
                    </div>
                  </div>

                  {/* Profile Picture Upload */}
                  <div>
                    <label style={labelStyle}>Profile Picture (URL or upload)</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {formProfilePicturePreview && (
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <img
                            src={formProfilePicturePreview}
                            alt="Preview"
                            style={{ width: "64px", height: "64px", borderRadius: "14px", objectFit: "cover" }}
                          />
                          <button
                            type="button"
                            onClick={() => { setFormProfilePictureUrl(""); setFormProfilePicturePreview(""); }}
                            style={{ padding: "6px 12px", fontSize: "12px", background: "var(--red-bg)", color: "var(--red)", border: "none", borderRadius: "8px", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <input
                        value={formProfilePictureUrl}
                        onChange={(e) => { setFormProfilePictureUrl(e.target.value); setFormProfilePicturePreview(e.target.value); }}
                        placeholder="https://example.com/image.jpg"
                        style={inputStyle}
                      />
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Or upload an image:
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const base64 = reader.result as string;
                              setFormProfilePictureUrl(base64);
                              setFormProfilePicturePreview(base64);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Hourly Rate ($)</label>
                      <input value={formHourlyRate} onChange={(e) => setFormHourlyRate(e.target.value)} placeholder="0.00" style={inputStyle} type="number" step="0.01" />
                    </div>
                    <div>
                      <label style={labelStyle}>Commission %</label>
                      <input value={formCommissionPct} onChange={(e) => setFormCommissionPct(e.target.value)} placeholder="0" style={inputStyle} type="number" step="0.5" />
                    </div>
                  </div>

                  {/* Assigned Creators (Feature 5) */}
                  <div>
                    <label style={labelStyle}>Assigned Creators</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {(creators || []).map((creator: any) => (
                        <label
                          key={creator.id}
                          style={{
                            display: "flex", alignItems: "center", gap: "10px",
                            padding: "10px 14px",
                            background: formAssignedCreators[creator.name] ? "var(--green-bg)" : "var(--bg)",
                            borderRadius: "10px", cursor: "pointer",
                            border: formAssignedCreators[creator.name] ? "2px solid var(--green)" : "2px solid var(--border)",
                            transition: "all 0.15s",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formAssignedCreators[creator.name] || false}
                            onChange={(e) => setFormAssignedCreators({ ...formAssignedCreators, [creator.name]: e.target.checked })}
                            style={{ width: "16px", height: "16px", accentColor: "var(--green)" }}
                          />
                          <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>{creator.name}</span>
                        </label>
                      ))}
                      {(!creators || creators.length === 0) && (
                        <p style={{ fontSize: "13px", color: "var(--text-muted)", padding: "8px 0" }}>No creators available</p>
                      )}
                    </div>
                  </div>

                  {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>❌ {error}</div>}
                  <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                    <button onClick={() => setModal(null)} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={handleAdd} disabled={saving} style={saveBtnStyle}>{saving ? "Adding..." : "Add Member"}</button>
                  </div>
                </div>
              </>
            )}

            {/* Edit Member Modal */}
            {modal === "edit" && selectedChatter && (
              <>
                <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "20px" }}>
                  ✏️ Edit {selectedChatter.name}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div>
                    <label style={labelStyle}>Name</label>
                    <input value={formName} onChange={(e) => setFormName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select value={formRole} onChange={(e) => setFormRole(e.target.value)} style={inputStyle}>
                      <option value="chatter">Chatter</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Avatar Emoji (fallback)</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {EMOJI_OPTIONS.map((e) => (
                        <button key={e} onClick={() => setFormEmoji(e)} style={{
                          width: "40px", height: "40px", fontSize: "20px",
                          border: formEmoji === e ? "2px solid var(--accent)" : "2px solid var(--border)",
                          borderRadius: "10px", background: formEmoji === e ? "rgba(196,149,106,0.15)" : "var(--bg)",
                          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                        }}>{e}</button>
                      ))}
                    </div>
                  </div>

                  {/* Profile Picture Upload */}
                  <div>
                    <label style={labelStyle}>Profile Picture (URL or upload)</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {formProfilePicturePreview && (
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <img
                            src={formProfilePicturePreview}
                            alt="Preview"
                            style={{ width: "64px", height: "64px", borderRadius: "14px", objectFit: "cover" }}
                          />
                          <button
                            type="button"
                            onClick={() => { setFormProfilePictureUrl(""); setFormProfilePicturePreview(""); }}
                            style={{ padding: "6px 12px", fontSize: "12px", background: "var(--red-bg)", color: "var(--red)", border: "none", borderRadius: "8px", cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                      <input
                        value={formProfilePictureUrl}
                        onChange={(e) => { setFormProfilePictureUrl(e.target.value); setFormProfilePicturePreview(e.target.value); }}
                        placeholder="https://example.com/image.jpg"
                        style={inputStyle}
                      />
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Or upload an image:
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              const base64 = reader.result as string;
                              setFormProfilePictureUrl(base64);
                              setFormProfilePicturePreview(base64);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ fontSize: "13px", color: "var(--text-secondary)" }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                    <div>
                      <label style={labelStyle}>Hourly Rate ($)</label>
                      <input value={formHourlyRate} onChange={(e) => setFormHourlyRate(e.target.value)} placeholder="0.00" style={inputStyle} type="number" step="0.01" />
                    </div>
                    <div>
                      <label style={labelStyle}>Commission %</label>
                      <input value={formCommissionPct} onChange={(e) => setFormCommissionPct(e.target.value)} placeholder="0" style={inputStyle} type="number" step="0.5" />
                    </div>
                  </div>
                  {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>❌ {error}</div>}
                  <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                    <button onClick={() => setModal(null)} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={handleEdit} disabled={saving} style={saveBtnStyle}>{saving ? "Saving..." : "Save Changes"}</button>
                  </div>
                </div>
              </>
            )}

            {/* Assignments Modal */}
            {modal === "assignments" && selectedChatter && (
              <>
                <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" }}>
                  🎯 Assign Creators
                </h3>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                  Select creators for <strong>{selectedChatter.name}</strong>
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px" }}>
                  {(creators || []).map((creator: any) => (
                    <label
                      key={creator.id}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        padding: "12px 16px", background: assignmentSelections[creator.name] ? "var(--green-bg)" : "var(--bg)",
                        borderRadius: "12px", cursor: "pointer",
                        border: assignmentSelections[creator.name] ? "2px solid var(--green)" : "2px solid var(--border)",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={assignmentSelections[creator.name] || false}
                        onChange={(e) => setAssignmentSelections({ ...assignmentSelections, [creator.name]: e.target.checked })}
                        style={{ width: "18px", height: "18px", accentColor: "var(--green)" }}
                      />
                      <span style={{ fontSize: "15px", fontWeight: "500", color: "var(--text)" }}>{creator.name}</span>
                    </label>
                  ))}
                  {(!creators || creators.length === 0) && (
                    <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "16px" }}>
                      No creators found
                    </p>
                  )}
                </div>
                {error && <div style={{ color: "var(--red)", fontSize: "13px", marginBottom: "12px" }}>❌ {error}</div>}
                <div style={{ display: "flex", gap: "12px" }}>
                  <button onClick={() => setModal(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={handleSaveAssignments} disabled={saving} style={saveBtnStyle}>{saving ? "Saving..." : "Save Assignments"}</button>
                </div>
              </>
            )}

            {/* Reset PIN Modal */}
            {modal === "resetPin" && selectedChatter && (
              <>
                <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" }}>
                  🔑 Reset PIN
                </h3>
                <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                  Set a new PIN for <strong>{selectedChatter.name}</strong>
                </p>
                <div>
                  <label style={labelStyle}>New PIN (4-6 digits)</label>
                  <input
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="1234"
                    style={inputStyle}
                    type="password"
                    inputMode="numeric"
                  />
                </div>
                {error && <div style={{ color: "var(--red)", fontSize: "13px", marginTop: "12px" }}>❌ {error}</div>}
                <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
                  <button onClick={() => setModal(null)} style={cancelBtnStyle}>Cancel</button>
                  <button onClick={handleResetPin} disabled={saving || newPin.length < 4} style={saveBtnStyle}>
                    {saving ? "Resetting..." : "Reset PIN"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared Styles ──
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  fontSize: "15px",
  border: "2px solid var(--border)",
  borderRadius: "12px",
  background: "var(--bg)",
  color: "var(--text)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

const cardActionBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: "600",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "all 0.15s",
  color: "var(--text-secondary)",
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px",
  fontSize: "14px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  background: "var(--bg)",
  border: "2px solid var(--border)",
  borderRadius: "14px",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px",
  fontSize: "14px",
  fontWeight: "600",
  color: "#fff",
  background: "var(--accent)",
  border: "none",
  borderRadius: "14px",
  cursor: "pointer",
};
