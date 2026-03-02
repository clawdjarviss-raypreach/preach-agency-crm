"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

interface RoleDoc {
  id: string;
  name: string;
  description?: string;
  color: string;
  permissions: string[];
  is_system: boolean;
}

interface MemberRow {
  id: string;
  role_id: string | null;
  status: string;
}

const PERMISSION_GROUPS = [
  {
    label: "Dashboard",
    permissions: [{ key: "marketing_dashboard", label: "Marketing Dashboard" }],
  },
  {
    label: "Data Access",
    permissions: [
      { key: "model_socials", label: "Model Socials" },
      { key: "model_revenue", label: "Model Revenue" },
      { key: "model_tracking_links", label: "Model Tracking Links" },
      { key: "model_subs", label: "Model Subs" },
    ],
  },
  {
    label: "Features",
    permissions: [
      { key: "sales_feed", label: "Sales Feed" },
      { key: "fan_directory", label: "Fan Directory" },
      { key: "bonus_sheet", label: "Bonus Sheet" },
    ],
  },
  {
    label: "Admin",
    permissions: [
      { key: "admin_panel", label: "Admin Panel" },
      { key: "team_management", label: "Team Management" },
    ],
  },
];

const PRESET_COLORS = [
  "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#06b6d4", "#a855f7",
];

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "85vh", overflowY: "auto", background: "var(--surface)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
        {children}
      </div>
    </div>
  );
}

export default function RolesPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);

  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editRole, setEditRole] = useState<RoleDoc | null>(null);
  const [deleteRole, setDeleteRole] = useState<RoleDoc | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState("#3b82f6");
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Data
  const [roles, setRoles] = useState<RoleDoc[] | undefined>(undefined);
  const [members, setMembers] = useState<MemberRow[] | undefined>(undefined);
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

    const [rolesRes, membersRes] = await Promise.all([
      supabase.from("crm_roles").select("*"),
      supabase.from("crm_chatters").select("id, role_id, status"),
    ]);

    if (cancelled) return;
    if (rolesRes.data) setRoles(rolesRes.data as RoleDoc[]);
    if (membersRes.data) setMembers(membersRes.data as MemberRow[]);
    setLoading(false);

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const memberCountByRole = (roleId: string) =>
    (members || []).filter((m) => m.role_id === roleId && m.status !== "inactive").length;

  const openCreate = () => {
    setModal("create");
    setEditRole(null);
    setFormName("");
    setFormDesc("");
    setFormColor("#3b82f6");
    setFormPerms([]);
    setError("");
  };

  const openEdit = (r: RoleDoc) => {
    setModal("edit");
    setEditRole(r);
    setFormName(r.name);
    setFormDesc(r.description || "");
    setFormColor(r.color);
    setFormPerms([...r.permissions]);
    setError("");
  };

  const togglePerm = (key: string) => {
    setFormPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    if (!formName.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      if (modal === "create") {
        const { error: insertErr } = await supabase.from("crm_roles").insert({
          name: formName.trim(),
          description: formDesc.trim() || null,
          color: formColor,
          permissions: formPerms,
        });
        if (insertErr) throw insertErr;
      } else if (editRole) {
        const { error: updateErr } = await supabase.from("crm_roles").update({
          name: formName.trim(),
          description: formDesc.trim() || null,
          color: formColor,
          permissions: formPerms,
        }).eq("id", editRole.id);
        if (updateErr) throw updateErr;
      }
      setModal(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    setSaving(true);
    try {
      const { error: deleteErr } = await supabase.from("crm_roles").delete().eq("id", deleteRole.id);
      if (deleteErr) throw deleteErr;
      setDeleteRole(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  if (loading && !roles) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading roles...</div>;
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>🛡️ Roles</h1>
        <button onClick={openCreate} style={{ ...btnStyle, background: "#3b82f6", color: "#fff" }}>+ Add new Role</button>
      </div>

      {/* Roles list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(roles || []).length === 0 && (
          <div style={{ background: "var(--surface)", borderRadius: 16, padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No roles yet</div>
        )}
        {(roles || []).map((r) => (
          <div key={r.id} style={{ background: "var(--surface)", borderRadius: 16, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {/* Color badge */}
            <span style={{ display: "inline-block", padding: "4px 12px", fontSize: 14, fontWeight: 600, color: r.color, background: `${r.color}18`, borderRadius: 8 }}>
              {r.name}
            </span>
            {r.is_system && <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg)", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>System</span>}

            <span style={{ flex: 1, fontSize: 13, color: "var(--text-secondary)", minWidth: 120 }}>{r.description || "—"}</span>

            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-muted)" }}>
              <span>{memberCountByRole(r.id)} member{memberCountByRole(r.id) !== 1 ? "s" : ""}</span>
              <span>{r.permissions.length} permission{r.permissions.length !== 1 ? "s" : ""}</span>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => openEdit(r)} style={btnSmall}>✏️ Edit</button>
              {!r.is_system && (
                <button onClick={() => setDeleteRole(r)} style={{ ...btnSmall, background: "#7f1d1d" }}>🗑️ Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{modal === "create" ? "Create Role" : `Edit Role — ${editRole?.name}`}</h2>

          {error && <div style={{ background: "#7f1d1d", color: "#fca5a5", padding: "8px 12px", borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

          <label style={labelStyle}>Name</label>
          <input value={formName} onChange={(e) => setFormName(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} placeholder="e.g. Manager" />

          <label style={labelStyle}>Description</label>
          <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} placeholder="Optional description" />

          <label style={labelStyle}>Label Color</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {PRESET_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => setFormColor(c)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: c,
                  cursor: "pointer",
                  border: formColor === c ? "3px solid #fff" : "3px solid transparent",
                  boxShadow: formColor === c ? `0 0 0 2px ${c}` : "none",
                }}
              />
            ))}
          </div>

          <label style={labelStyle}>Permissions</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.label}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group.label}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {group.permissions.map((p) => (
                    <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
                      <input type="checkbox" checked={formPerms.includes(p.key)} onChange={() => togglePerm(p.key)} />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setModal(null)} style={btnStyle}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ ...btnStyle, background: "#3b82f6", color: "#fff" }}>{saving ? "Saving…" : modal === "create" ? "Create Role" : "Save Changes"}</button>
          </div>
        </ModalOverlay>
      )}

      {/* Delete Confirmation */}
      {deleteRole && (
        <ModalOverlay onClose={() => setDeleteRole(null)}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Delete Role</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20 }}>
            Are you sure you want to delete <strong>{deleteRole.name}</strong>? This role must not have any members assigned.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteRole(null)} style={btnStyle}>Cancel</button>
            <button onClick={handleDelete} disabled={saving} style={{ ...btnStyle, background: "#ef4444", color: "#fff" }}>{saving ? "Deleting…" : "Confirm Delete"}</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "#1f2937", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 500 };
const btnSmall: React.CSSProperties = { padding: "5px 10px", border: "1px solid var(--border)", borderRadius: 6, background: "#1f2937", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 500 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 };
