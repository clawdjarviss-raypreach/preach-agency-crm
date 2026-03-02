"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import TrainingAssigner from "../../../../../components/TrainingAssigner";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeIcon(type: string) {
  const icons: Record<string, string> = {
    document: "📄",
    video: "🎥",
    course: "📚",
    quiz: "❓",
    template: "📋",
    link: "🔗",
  };
  return icons[type] || "📄";
}

type Assignment = {
  id: string;
  chatterId: string;
  chatterName?: string;
  status: "assigned" | "in_progress" | "completed" | "overdue";
  assignedAt: number;
  dueDate?: number;
  completedAt?: number;
};

export default function TrainingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const materialId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [showAssigner, setShowAssigner] = useState(false);

  const [material, setMaterial] = useState<any | null | undefined>(undefined);
  const [assignmentsRaw, setAssignmentsRaw] = useState<any[] | undefined>(undefined);
  const [chattersRaw, setChattersRaw] = useState<any[] | undefined>(undefined);

  useEffect(() => {
    const t = localStorage.getItem("crm_token");
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isSupervisor = isSupervisorRole(user?.role);

  const loadData = useCallback(async () => {
    if (!token || !materialId) return;
    try {
      const [materialRes, assignmentsRes, chattersRes] = await Promise.all([
        supabase.from("crm_training_materials").select("*").eq("id", materialId).single(),
        supabase.from("crm_training_assignments").select("*").eq("material_id", materialId),
        supabase.from("crm_chatters").select("*"),
      ]);

      if (materialRes.error) {
        if (materialRes.error.code === "PGRST116") {
          setMaterial(null);
        } else {
          throw materialRes.error;
        }
      } else {
        setMaterial(materialRes.data);
      }

      if (assignmentsRes.error) throw assignmentsRes.error;
      setAssignmentsRaw(assignmentsRes.data ?? []);

      if (chattersRes.error) throw chattersRes.error;
      setChattersRaw(chattersRes.data ?? []);
    } catch (e) {
      console.error("Failed to load training detail:", e);
      setMaterial(null);
      setAssignmentsRaw([]);
      setChattersRaw([]);
    }
  }, [token, materialId]);

  useEffect(() => {
    if (!token) return;
    loadData();
  }, [token, loadData]);

  const chattersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (chattersRaw && Array.isArray(chattersRaw)) {
      for (const c of chattersRaw) {
        map[c.id] = c.name;
      }
    }
    return map;
  }, [chattersRaw]);

  const materialOptions = useMemo(() => {
    if (!material) return [];
    return [{
      id: material.id,
      title: material.title,
      type: material.type,
      category: material.category,
    }];
  }, [material]);

  const chatterOptions = useMemo(() => {
    return (chattersRaw || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      avatarEmoji: c.avatar_emoji,
    }));
  }, [chattersRaw]);

  const assignments: Assignment[] = useMemo(() => {
    if (!assignmentsRaw || !Array.isArray(assignmentsRaw)) return [];
    return assignmentsRaw.map((a: any) => ({
      id: a.id,
      chatterId: a.chatter_id,
      chatterName: chattersMap[a.chatter_id] || "Unknown",
      status: a.status,
      assignedAt: a.assigned_at ? new Date(a.assigned_at).getTime() : Date.now(),
      dueDate: a.due_date ? new Date(a.due_date).getTime() : undefined,
      completedAt: a.completed_at ? new Date(a.completed_at).getTime() : undefined,
    }));
  }, [assignmentsRaw, chattersMap]);

  const handleMarkComplete = async (assignmentId: string) => {
    if (!token) return;
    try {
      const { error } = await supabase
        .from("crm_training_assignments")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", assignmentId);
      if (error) throw error;
      await loadData();
    } catch (e) {
      console.error("Failed to mark complete:", e);
    }
  };

  const completedCount = assignments.filter((a) => a.status === "completed").length;

  if (!token) {
    return <div style={{ padding: 32 }}>Loading...</div>;
  }

  if (material === undefined) {
    return <div style={{ padding: 32 }}>Loading...</div>;
  }

  if (!material) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--text-secondary)" }}>Training material not found.</p>
        <button onClick={() => router.push("/coaching/training")} style={{ marginTop: 16, color: "var(--primary)" }}>
          ← Back to Training
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <button
        onClick={() => router.push("/coaching/training")}
        style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}
      >
        ← Back to Training
      </button>

      {/* Material Info */}
      <div style={{ background: "var(--card-bg)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 16 }}>
          <span style={{ fontSize: 32 }}>{typeIcon(material.type)}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>{material.title}</h1>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "var(--bg)",
                  fontSize: 12,
                  textTransform: "capitalize",
                }}
              >
                {material.type}
              </span>
              <span
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "var(--bg)",
                  fontSize: 12,
                  textTransform: "capitalize",
                }}
              >
                {material.category?.replace(/_/g, " ")}
              </span>
            </div>
          </div>
        </div>

        {material.description && (
          <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>{material.description}</p>
        )}

        {material.url && (
          <a
            href={material.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "var(--primary)",
              color: "white",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500,
            }}
          >
            Open Content →
          </a>
        )}
      </div>

      {/* Assignments */}
      <div style={{ background: "var(--card-bg)", borderRadius: 12, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>
            Assignments ({completedCount}/{assignments.length} completed)
          </h2>
          {isSupervisor && (
            <button
              onClick={() => setShowAssigner(true)}
              style={{
                padding: "8px 16px",
                background: "var(--primary)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Assign to Chatters
            </button>
          )}
        </div>

        {assignments.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>No assignments yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {assignments.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  background: "var(--bg)",
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: a.status === "completed" ? "var(--green)" : "var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 16,
                  }}
                >
                  {a.status === "completed" ? "✓" : ""}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500 }}>{a.chatterName}</p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Assigned: {formatDate(a.assignedAt)}
                    {a.dueDate && ` • Due: ${formatDate(a.dueDate)}`}
                    {a.completedAt && ` • Completed: ${formatDate(a.completedAt)}`}
                  </p>
                </div>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    background:
                      a.status === "completed"
                        ? "var(--green)20"
                        : a.status === "overdue"
                        ? "var(--red)20"
                        : "var(--bg)",
                    color:
                      a.status === "completed"
                        ? "var(--green)"
                        : a.status === "overdue"
                        ? "var(--red)"
                        : "var(--text-secondary)",
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {a.status.replace(/_/g, " ")}
                </span>
                {isSupervisor && a.status !== "completed" && (
                  <button
                    onClick={() => handleMarkComplete(a.id)}
                    style={{
                      padding: "6px 12px",
                      background: "var(--green)",
                      color: "white",
                      border: "none",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    Mark Complete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assigner Modal */}
      <TrainingAssigner
        open={showAssigner}
        token={token}
        materials={materialOptions}
        chatters={chatterOptions}
        defaultMaterialIds={[materialId]}
        onClose={() => setShowAssigner(false)}
        onAssigned={() => { setShowAssigner(false); loadData(); }}
      />
    </div>
  );
}
