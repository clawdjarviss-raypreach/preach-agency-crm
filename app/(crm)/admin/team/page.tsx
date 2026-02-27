"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function AdminTeamPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [selectedCreators, setSelectedCreators] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const managers = useQuery(api.crm.teamManagement.listManagers, token ? { token } : "skip");
  const chatters = useQuery(api.crm.chatters.list, token ? { token } : "skip");
  const creators = useQuery(api.crm.creators.list, token ? { token } : "skip");

  const assignRole = useMutation(api.crm.teamManagement.assignRole);
  const assignCreators = useMutation(api.crm.teamManagement.assignCreators);
  const removeManager = useMutation(api.crm.teamManagement.removeManager);

  if (!user) return null;
  if (user.role !== "admin") return <div style={{ padding: 24 }}>🔒 Admin only.</div>;

  const handlePickManager = (id: string) => {
    setSelectedManager(id);
    const m = managers?.find((x: any) => x.id === id);
    const initial: Record<string, boolean> = {};
    (creators || []).forEach((c: any) => {
      initial[c.id] = (m?.assignedCreators || []).includes(c.id);
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
              onClick={() => assignRole({ token, chatterId: c.id, role: "marketing_manager" as any })}
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
                  <button onClick={() => removeManager({ token, chatterId: m.id })} style={{ ...btnStyle, background: "#7f1d1d" }}>Deactivate</button>
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
                assignCreators({
                  token,
                  chatterId: selectedManager as any,
                  creatorIds: Object.entries(selectedCreators).filter(([, v]) => v).map(([id]) => id),
                })
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
