"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
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
  _id: string;
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

  useEffect(() => {
    const t = localStorage.getItem("crm_token");
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isSupervisor = isSupervisorRole(user?.role);

  const coachingApi = (api as any).crm.coaching;

  const materialsQuery = useQuery(
    coachingApi.getTrainingMaterials,
    token ? { token } : "skip"
  ) as any[] | undefined;

  const material = materialsQuery?.find((m: any) => (m._id || m.id) === materialId);

  const assignmentsQuery = useQuery(
    api.crm.coaching.getAssignments,
    token ? { token } : "skip"
  );

  const chattersQuery = useQuery(
    api.crm.chatters.list,
    token ? { token } : "skip"
  );

  const chattersMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (chattersQuery && Array.isArray(chattersQuery)) {
      for (const c of chattersQuery) {
        map[c.id] = c.name;
      }
    }
    return map;
  }, [chattersQuery]);

  const materialOptions = useMemo(() => {
    if (!material) return [];
    return [{
      id: material._id || material.id,
      title: material.title,
      type: material.type,
      category: material.category,
    }];
  }, [material]);

  const chatterOptions = useMemo(() => {
    return (chattersQuery || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      avatarEmoji: c.avatarEmoji,
    }));
  }, [chattersQuery]);

  const assignments: Assignment[] = useMemo(() => {
    if (!assignmentsQuery || !Array.isArray(assignmentsQuery)) return [];
    return assignmentsQuery
      .filter((a: any) => (a.materialId || a.trainingMaterialId) === materialId)
      .map((a: any) => ({
        _id: a._id,
        chatterId: a.chatterId,
        chatterName: chattersMap[a.chatterId] || "Unknown",
        status: a.status,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        completedAt: a.completedAt,
      }));
  }, [assignmentsQuery, chattersMap, materialId]);

  const markComplete = useMutation(api.crm.coaching.markTrainingComplete);

  const handleMarkComplete = async (assignmentId: string) => {
    if (!token) return;
    try {
      await markComplete({ token, assignmentId: assignmentId as Id<"crm_training_assignments"> });
    } catch (e) {
      console.error("Failed to mark complete:", e);
    }
  };

  const completedCount = assignments.filter((a) => a.status === "completed").length;

  if (!token) {
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

        {material.contentUrl && (
          <a
            href={material.contentUrl}
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
                key={a._id}
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
                    onClick={() => handleMarkComplete(a._id)}
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
        onAssigned={() => setShowAssigner(false)}
      />
    </div>
  );
}
