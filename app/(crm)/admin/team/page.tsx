"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";

export default function AdminTeamPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [selectedCreators, setSelectedCreators] = useState<Record<string, boolean>>({});

  // Data state
  const [managers, setManagers] = useState<any[] | undefined>(undefined);
  const [chatters, setChatters] = useState<any[] | undefined>(undefined);
  const [creators, setCreators] = useState<any[] | undefined>(undefined);
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

    const [chattersRes, creatorsRes] = await Promise.all([
      supabase.from("crm_chatters").select("*"),
      supabase.from("crm_creators").select("*"),
    ]);

    if (cancelled) return;

    const allChatters = chattersRes.data || [];
    const allCreators = creatorsRes.data || [];

    setChatters(allChatters.map((c: any) => ({
      id: c.id,
      name: c.name,
      username: c.username,
      role: c.role,
      status: c.status,
      assigned_creators: c.assigned_creators,
    })));
    setCreators(allCreators.map((c: any) => ({
      id: c.id,
      name: c.name,
    })));

    // Build managers list: chatters with role = marketing_manager, enriched with creator names
    const managerRows = allChatters.filter((c: any) => c.role === "marketing_manager");
    const creatorMap = new Map(allCreators.map((c: any) => [c.id, c.name]));
    const enrichedManagers = managerRows.map((m: any) => ({
      id: m.id,
      name: m.name,
      username: m.username,
      status: m.status,
      assigned_creators: m.assigned_creators || [],
      assignedCreatorNames: (m.assigned_creators || []).map((cid: string) => creatorMap.get(cid) || cid),
    }));
    setManagers(enrichedManagers);
    setLoading(false);

    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAssignRole = async (chatterId: string, role: string) => {
    const { error } = await supabase.from("crm_chatters").update({ role }).eq("id", chatterId);
    if (error) {
      alert(error.message || "Failed to assign role");
      return;
    }
    await fetchData();
  };

  const handleAssignCreators = async (chatterId: string, creatorIds: string[]) => {
    const { error } = await supabase.from("crm_chatters").update({ assigned_creators: creatorIds }).eq("id", chatterId);
    if (error) {
      alert(error.message || "Failed to assign creators");
      return;
    }
    await fetchData();
  };

  const handleRemoveManager = async (chatterId: string) => {
    const { error } = await supabase.from("crm_chatters").update({ role: "chatter" }).eq("id", chatterId);
    if (error) {
      alert(error.message || "Failed to remove manager");
      return;
    }
    await fetchData();
  };

  if (!user) return null;
  if (user.role !== "admin") return <div style={{ padding: 24 }}>🔒 Admin only.</div>;

  if (loading && !managers) {
    return <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading team...</div>;
  }

  const handlePickManager = (id: string) => {
    setSelectedManager(id);
    const m = managers?.find((x: any) => x.id === id);
    const initial: Record<string, boolean> = {};
    (creators || []).forEach((c: any) => {
      initial[c.id] = (m?.assigned_creators || []).includes(c.id);
    });
    setSelectedCreators(initial);
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>👥 Team Management</h1>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>Promote invited user to Marketing Manager</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {(chatters || []).map((c: any) => (
            <button
              key={c.id}
              onClick={() => handleAssignRole(c.id, "marketing_manager")}
              style={btnStyle}
            >
              Set {c.name} → marketing_manager
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginBottom: 16, overflowX: "auto" }}>
        <h3 style={{ marginBottom: 10 }}>Marketing Managers</h3>
        <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
          <thead><tr>{["Name", "Username", "Status", "Assigned Models", "Actions"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {(managers || []).map((m: any) => (
              <tr key={m.id}>
                <td style={tdStyle}>{m.name}</td>
                <td style={tdStyle}>@{m.username}</td>
                <td style={tdStyle}>{m.status}</td>
                <td style={tdStyle}>{(m.assignedCreatorNames || []).join(", ") || "—"}</td>
                <td style={tdStyle}>
                  <button onClick={() => handlePickManager(m.id)} style={btnStyle}>Assign creators</button>{" "}
                  <button onClick={() => handleRemoveManager(m.id)} style={{ ...btnStyle, background: "#7f1d1d" }}>Deactivate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedManager && (
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16 }}>
          <h3 style={{ marginBottom: 10 }}>Assign creators</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
            {(creators || []).map((c: any) => (
              <label key={c.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
                <input
                  type="checkbox"
                  checked={!!selectedCreators[c.id]}
                  onChange={(e) => setSelectedCreators((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                /> {c.name}
              </label>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() =>
                handleAssignCreators(
                  selectedManager,
                  Object.entries(selectedCreators).filter(([, v]) => v).map(([id]) => id),
                )
              }
              style={btnStyle}
            >
              Save assignments
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "#1f2937", color: "white", cursor: "pointer" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: 8, borderBottom: "1px solid var(--border)" };
const tdStyle: React.CSSProperties = { padding: 8, borderBottom: "1px solid var(--border-subtle)" };
