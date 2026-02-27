"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import { type PipStatus, type PipMilestone } from "../../../../../components/PIPCard";

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

function statusColor(status: PipStatus) {
  const colors: Record<PipStatus, string> = {
    draft: "var(--text-secondary)",
    active: "var(--primary)",
    completed: "var(--green)",
    extended: "var(--orange)",
    failed: "var(--red)",
    cancelled: "var(--text-secondary)",
  };
  return colors[status] || "var(--text-secondary)";
}

function milestoneStatusColor(status: PipMilestone["status"]) {
  const colors: Record<string, string> = {
    pending: "var(--text-secondary)",
    met: "var(--green)",
    missed: "var(--red)",
    extended: "var(--orange)",
  };
  return colors[status] || "var(--text-secondary)";
}

export default function PipDetailPage() {
  const router = useRouter();
  const params = useParams();
  const pipId = params.id as string;

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CrmUser | null>(null);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDue, setNewMilestoneDue] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("crm_token");
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isSupervisor = isSupervisorRole(user?.role);

  const pipsQuery = useQuery(
    api.crm.coaching.getActivePips,
    token ? { token } : "skip"
  );

  const pip = pipsQuery?.find((p: any) => p._id === pipId);

  const chattersQuery = useQuery(
    api.crm.chatters.list,
    token ? { token } : "skip"
  );

  const chatter = chattersQuery?.find((c: any) => c.id === pip?.chatterId);

  const updateStatus = useMutation(api.crm.coaching.updatePipStatus);
  const addMilestone = useMutation(api.crm.coaching.addPipMilestone);

  const handleStatusChange = async (newStatus: PipStatus) => {
    if (!token || !pipId) return;
    try {
      await updateStatus({ token, pipId: pipId as Id<"crm_coaching_pips">, status: newStatus });
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  const handleAddMilestone = async () => {
    if (!token || !pipId || !newMilestoneTitle.trim()) return;
    try {
      await addMilestone({
        token,
        pipId: pipId as Id<"crm_coaching_pips">,
        title: newMilestoneTitle.trim(),
        dueDate: newMilestoneDue ? new Date(newMilestoneDue).getTime() : Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      setNewMilestoneTitle("");
      setNewMilestoneDue("");
    } catch (e) {
      console.error("Failed to add milestone:", e);
    }
  };

  if (!token) {
    return <div style={{ padding: 32 }}>Loading...</div>;
  }

  if (!isSupervisor) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--text-secondary)" }}>Only supervisors can view PIPs.</p>
      </div>
    );
  }

  if (!pip) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: "var(--text-secondary)" }}>PIP not found.</p>
        <button onClick={() => router.push("/coaching/pips")} style={{ marginTop: 16, color: "var(--primary)" }}>
          ← Back to PIPs
        </button>
      </div>
    );
  }

  const milestones: PipMilestone[] = pip.milestones || [];
  const completedCount = milestones.filter((m) => m.status === "met").length;

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <button
        onClick={() => router.push("/coaching/pips")}
        style={{ color: "var(--primary)", background: "none", border: "none", cursor: "pointer", marginBottom: 16 }}
      >
        ← Back to PIPs
      </button>

      <div style={{ background: "var(--card-bg)", borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 8 }}>
              {pip.title || pip.reason || "Performance Improvement Plan"}
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
              {chatter?.name || "Chatter"}
            </p>
          </div>
          <span
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: `${statusColor(pip.status)}20`,
              color: statusColor(pip.status),
              fontWeight: 500,
              textTransform: "capitalize",
            }}
          >
            {pip.status}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Start Date</p>
            <p style={{ fontWeight: 500 }}>{formatDate(pip.startDate)}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>End Date</p>
            <p style={{ fontWeight: 500 }}>{formatDate(pip.endDate)}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Progress</p>
            <p style={{ fontWeight: 500 }}>{completedCount} / {milestones.length} milestones</p>
          </div>
        </div>

        {pip.reason && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Reason</p>
            <p>{pip.reason}</p>
          </div>
        )}

        {/* Status Actions */}
        {pip.status !== "completed" && pip.status !== "failed" && pip.status !== "cancelled" && (
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            {pip.status === "draft" && (
              <button
                onClick={() => handleStatusChange("active")}
                style={{
                  padding: "8px 16px",
                  background: "var(--primary)",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Activate PIP
              </button>
            )}
            {pip.status === "active" && (
              <>
                <button
                  onClick={() => handleStatusChange("completed")}
                  style={{
                    padding: "8px 16px",
                    background: "var(--green)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Mark Completed
                </button>
                <button
                  onClick={() => handleStatusChange("failed")}
                  style={{
                    padding: "8px 16px",
                    background: "var(--red)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Mark Failed
                </button>
                <button
                  onClick={() => handleStatusChange("extended")}
                  style={{
                    padding: "8px 16px",
                    background: "var(--orange)",
                    color: "white",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  Extend
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Milestones */}
      <div style={{ background: "var(--card-bg)", borderRadius: 12, padding: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Milestones</h2>

        {milestones.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>No milestones yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {milestones.map((m, idx) => (
              <div
                key={m.id || idx}
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
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: m.status === "met" ? "var(--green)" : "var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "white",
                    fontSize: 14,
                  }}
                >
                  {m.status === "met" ? "✓" : ""}
                </span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 500 }}>{m.title}</p>
                  <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Due: {formatDate(m.dueDate)}
                  </p>
                </div>
                <span
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    background: `${milestoneStatusColor(m.status)}20`,
                    color: milestoneStatusColor(m.status),
                    fontSize: 12,
                    fontWeight: 500,
                    textTransform: "capitalize",
                  }}
                >
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Add Milestone */}
        {pip.status !== "completed" && pip.status !== "failed" && pip.status !== "cancelled" && (
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                New Milestone
              </label>
              <input
                type="text"
                value={newMilestoneTitle}
                onChange={(e) => setNewMilestoneTitle(e.target.value)}
                placeholder="Milestone title..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                Due Date
              </label>
              <input
                type="date"
                value={newMilestoneDue}
                onChange={(e) => setNewMilestoneDue(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              />
            </div>
            <button
              onClick={handleAddMilestone}
              disabled={!newMilestoneTitle.trim()}
              style={{
                padding: "8px 16px",
                background: "var(--primary)",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: newMilestoneTitle.trim() ? "pointer" : "not-allowed",
                opacity: newMilestoneTitle.trim() ? 1 : 0.5,
              }}
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
