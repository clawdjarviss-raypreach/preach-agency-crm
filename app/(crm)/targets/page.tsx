"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

type ModalType = "add" | "edit" | null;

interface Target {
  id: Id<"crm_weekly_targets">;
  creatorId: Id<"crm_creators">;
  creatorName: string;
  creatorAvatarUrl?: string;
  weekStart: string;
  responseTimeTarget: number;
  ppvUnlockTarget: number;
  ppvMinSent: number;
  weeklyBonusAmount: number;
  isActive: boolean;
}

interface CreatorWithStatus {
  id: Id<"crm_creators">;
  name: string;
  avatarUrl?: string;
  hasTarget: boolean;
  target: {
    id: Id<"crm_weekly_targets">;
    responseTimeTarget: number;
    ppvUnlockTarget: number;
    ppvMinSent: number;
    weeklyBonusAmount: number;
    isActive: boolean;
  } | null;
}

function formatResponseTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getWeekStart(dateStr?: string): string {
  const date = dateStr ? new Date(dateStr) : new Date();
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split("T")[0];
}

function formatWeekDisplay(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} - ${end.toLocaleDateString("en-US", opts)}`;
}

export default function TargetsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [selectedWeek, setSelectedWeek] = useState(getWeekStart());
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedTarget, setSelectedTarget] = useState<Target | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<CreatorWithStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [formResponseTime, setFormResponseTime] = useState("90");
  const [formPpvUnlock, setFormPpvUnlock] = useState("70");
  const [formPpvMinSent, setFormPpvMinSent] = useState("75");
  const [formBonusAmount, setFormBonusAmount] = useState("5000");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const targets = useQuery(
    api.crm.targets.getWeeklyTargets,
    token ? { token, weekStart: selectedWeek } : "skip"
  );

  const creatorsWithStatus = useQuery(
    api.crm.targets.listCreatorsWithTargetStatus,
    token ? { token, weekStart: selectedWeek } : "skip"
  );

  const allProgress = useQuery(
    api.crm.targets.getAllTargetProgress,
    token && ["admin", "manager", "supervisor"].includes(user?.role)
      ? { token, weekStart: selectedWeek }
      : "skip"
  );

  const upsertTarget = useMutation(api.crm.targets.upsertWeeklyTarget);
  const deleteTarget = useMutation(api.crm.targets.deleteWeeklyTarget);
  const toggleActive = useMutation(api.crm.targets.toggleTargetActive);
  const copyFromPrevious = useMutation(api.crm.targets.copyTargetsFromPreviousWeek);

  // Week navigation
  const goToPreviousWeek = () => {
    const date = new Date(selectedWeek);
    date.setDate(date.getDate() - 7);
    setSelectedWeek(date.toISOString().split("T")[0]);
  };

  const goToNextWeek = () => {
    const date = new Date(selectedWeek);
    date.setDate(date.getDate() + 7);
    setSelectedWeek(date.toISOString().split("T")[0]);
  };

  const goToCurrentWeek = () => {
    setSelectedWeek(getWeekStart());
  };

  const isCurrentWeek = selectedWeek === getWeekStart();

  // Creators without targets
  const creatorsWithoutTargets = useMemo(() => {
    if (!creatorsWithStatus) return [];
    return creatorsWithStatus.filter((c) => !c.hasTarget);
  }, [creatorsWithStatus]);

  // Progress grouped by chatter
  const progressByChatter = useMemo(() => {
    if (!allProgress) return new Map();
    const map = new Map<string, typeof allProgress>();
    for (const p of allProgress) {
      const key = p.chatterName;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(p);
    }
    return map;
  }, [allProgress]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const openAddModal = (creator: CreatorWithStatus) => {
    clearMessages();
    setSelectedCreator(creator);
    setFormResponseTime("90");
    setFormPpvUnlock("70");
    setFormPpvMinSent("75");
    setFormBonusAmount("5000");
    setModal("add");
  };

  const openEditModal = (target: Target) => {
    clearMessages();
    setSelectedTarget(target);
    setFormResponseTime(target.responseTimeTarget.toString());
    setFormPpvUnlock(target.ppvUnlockTarget.toString());
    setFormPpvMinSent(target.ppvMinSent.toString());
    setFormBonusAmount(target.weeklyBonusAmount.toString());
    setModal("edit");
  };

  const handleSave = async () => {
    const creatorId = modal === "add" ? selectedCreator?.id : selectedTarget?.creatorId;
    if (!creatorId) return;

    setSaving(true);
    setError("");

    try {
      await upsertTarget({
        token,
        creatorId,
        weekStart: selectedWeek,
        responseTimeTarget: parseInt(formResponseTime),
        ppvUnlockTarget: parseInt(formPpvUnlock),
        ppvMinSent: parseInt(formPpvMinSent),
        weeklyBonusAmount: parseInt(formBonusAmount),
      });
      setSuccess(modal === "add" ? "Target created!" : "Target updated!");
      setModal(null);
    } catch (err: any) {
      setError(err.message || "Failed to save target");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetId: Id<"crm_weekly_targets">) => {
    if (!confirm("Delete this target?")) return;
    try {
      await deleteTarget({ token, targetId });
      setSuccess("Target deleted!");
    } catch (err: any) {
      setError(err.message || "Failed to delete target");
    }
  };

  const handleToggleActive = async (targetId: Id<"crm_weekly_targets">) => {
    try {
      await toggleActive({ token, targetId });
    } catch (err: any) {
      setError(err.message || "Failed to toggle target");
    }
  };

  const handleCopyFromPrevious = async () => {
    if (!confirm("Copy all active targets from last week?")) return;
    try {
      const result = await copyFromPrevious({ token, targetWeekStart: selectedWeek });
      setSuccess(`Copied ${result.copied} targets (${result.skipped} skipped)`);
    } catch (err: any) {
      setError(err.message || "Failed to copy targets");
    }
  };

  // Permission check
  if (user && !["admin", "manager"].includes(user.role)) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>Access Denied</h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Only admins and managers can manage targets</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>🎯 Weekly Targets</h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          Set performance targets per creator for bonus calculations
        </p>
      </div>

      {/* Messages */}
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

      {/* Week Navigation */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px",
        background: "var(--surface)", padding: "16px 20px", borderRadius: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <button onClick={goToPreviousWeek} style={navBtnStyle}>← Prev</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
            {formatWeekDisplay(selectedWeek)}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
            Week of {selectedWeek}
          </div>
        </div>
        <button onClick={goToNextWeek} style={navBtnStyle}>Next →</button>
        {!isCurrentWeek && (
          <button onClick={goToCurrentWeek} style={{ ...navBtnStyle, background: "var(--accent)", color: "#1a1a1a" }}>
            Today
          </button>
        )}
      </div>

      {/* Actions Bar */}
      <div style={{
        display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap",
      }}>
        <button onClick={handleCopyFromPrevious} style={{
          padding: "12px 20px", fontSize: "14px", fontWeight: "600",
          background: "var(--surface)", color: "var(--text)", border: "2px solid var(--border)",
          borderRadius: "12px", cursor: "pointer",
        }}>
          📋 Copy from Last Week
        </button>
      </div>

      {/* Stats Summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px",
        marginBottom: "24px",
      }}>
        <div style={statCardStyle}>
          <span style={{ fontSize: "24px" }}>🎯</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Targets Set</div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--accent)" }}>{targets?.length || 0}</div>
          </div>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: "24px" }}>👤</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Creators Without</div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: creatorsWithoutTargets.length > 0 ? "var(--orange)" : "var(--green)" }}>
              {creatorsWithoutTargets.length}
            </div>
          </div>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: "24px" }}>✅</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>Meeting All Targets</div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--green)" }}>
              {allProgress?.filter((p) => p.meetsAllTargets).length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Targets Grid */}
      <div style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
          Active Targets
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: "16px",
        }}>
          {(targets || []).map((target) => (
            <div
              key={target.id}
              style={{
                background: "var(--surface)",
                borderRadius: "20px",
                padding: "20px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                border: target.isActive ? "2px solid var(--green)" : "1px solid var(--border)",
                opacity: target.isActive ? 1 : 0.6,
              }}
            >
              {/* Creator Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{
                  width: "48px", height: "48px", borderRadius: "12px",
                  background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "20px", color: "#fff", fontWeight: "700",
                }}>
                  {target.creatorName.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>{target.creatorName}</div>
                  <div style={{
                    display: "inline-block", marginTop: "4px",
                    padding: "3px 10px", fontSize: "11px", fontWeight: "600",
                    background: "var(--green-bg)", color: "var(--green)", borderRadius: "6px",
                  }}>
                    ${(target.weeklyBonusAmount / 100).toFixed(0)} weekly bonus
                  </div>
                </div>
                <div style={{
                  padding: "4px 8px", fontSize: "10px", fontWeight: "600",
                  background: target.isActive ? "var(--green-bg)" : "var(--bg)",
                  color: target.isActive ? "var(--green)" : "var(--text-muted)",
                  borderRadius: "6px", textTransform: "uppercase",
                }}>
                  {target.isActive ? "Active" : "Inactive"}
                </div>
              </div>

              {/* Metrics */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>Response Time</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
                    &lt;{formatResponseTime(target.responseTimeTarget)}
                  </div>
                </div>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>PPV Unlock</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
                    ≥{target.ppvUnlockTarget}%
                  </div>
                </div>
                <div style={metricBoxStyle}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>PPV Sent</div>
                  <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
                    ≥{target.ppvMinSent}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => openEditModal(target)} style={actionBtnStyle}>
                  ✏️ Edit
                </button>
                <button onClick={() => handleToggleActive(target.id)} style={actionBtnStyle}>
                  {target.isActive ? "⏸️ Pause" : "▶️ Activate"}
                </button>
                <button onClick={() => handleDelete(target.id)} style={{ ...actionBtnStyle, color: "var(--red)" }}>
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>

        {(!targets || targets.length === 0) && (
          <div style={{
            background: "var(--surface)", borderRadius: "20px", padding: "40px 24px",
            textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎯</div>
            <p style={{ fontSize: "15px", color: "var(--text-secondary)" }}>
              No targets set for this week
            </p>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
              Add targets below or copy from last week
            </p>
          </div>
        )}
      </div>

      {/* Creators Without Targets */}
      {creatorsWithoutTargets.length > 0 && (
        <div style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            ➕ Add Target
          </h2>
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "12px",
          }}>
            {creatorsWithoutTargets.map((creator) => (
              <button
                key={creator.id}
                onClick={() => openAddModal(creator)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "12px 16px", background: "var(--surface)",
                  border: "2px dashed var(--border)", borderRadius: "12px",
                  cursor: "pointer", transition: "all 0.15s",
                }}
              >
                <span style={{ fontSize: "18px" }}>👤</span>
                <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
                  {creator.name}
                </span>
                <span style={{ fontSize: "16px", color: "var(--accent)" }}>+</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Progress Mini Leaderboard */}
      {allProgress && allProgress.length > 0 && (
        <div>
          <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            📊 Chatter Progress This Week
          </h2>
          <div style={{
            background: "var(--surface)", borderRadius: "16px", padding: "16px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Chatter</th>
                    <th style={thStyle}>Creator</th>
                    <th style={thStyle}>Response</th>
                    <th style={thStyle}>PPV %</th>
                    <th style={thStyle}>PPV Sent</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allProgress.map((p) => (
                    <tr key={p.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <td style={tdStyle}>
                        <span style={{ marginRight: "6px" }}>{p.chatterAvatar}</span>
                        {p.chatterName}
                      </td>
                      <td style={tdStyle}>{p.creatorName}</td>
                      <td style={tdStyle}>
                        <span style={{ color: p.meetsResponseTime ? "var(--green)" : "var(--text-muted)" }}>
                          {p.avgResponseTime ? formatResponseTime(Math.round(p.avgResponseTime)) : "—"}
                        </span>
                        {p.meetsResponseTime && " ✅"}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: p.meetsPpvUnlock ? "var(--green)" : "var(--text-muted)" }}>
                          {p.ppvUnlockRate !== undefined ? `${p.ppvUnlockRate}%` : "—"}
                        </span>
                        {p.meetsPpvUnlock && " ✅"}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: p.meetsPpvSent ? "var(--green)" : "var(--text-muted)" }}>
                          {p.ppvSentCount ?? "—"}
                        </span>
                        {p.meetsPpvSent && " ✅"}
                      </td>
                      <td style={tdStyle}>
                        {p.meetsAllTargets ? (
                          <span style={{ padding: "4px 8px", background: "var(--green-bg)", color: "var(--green)", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
                            ✅ Qualified
                          </span>
                        ) : (
                          <span style={{ padding: "4px 8px", background: "var(--bg)", color: "var(--text-muted)", borderRadius: "6px", fontSize: "11px", fontWeight: "600" }}>
                            In Progress
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {allProgress.length === 0 && (
              <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "24px", fontSize: "14px" }}>
                No progress data yet. Progress updates daily.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div onClick={() => setModal(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "16px",
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: "var(--surface)", borderRadius: "24px", padding: "28px",
            width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          }}>
            <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" }}>
              {modal === "add" ? "➕ Add Target" : "✏️ Edit Target"}
            </h3>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
              {modal === "add" ? selectedCreator?.name : selectedTarget?.creatorName} — {formatWeekDisplay(selectedWeek)}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Response Time Target (seconds)</label>
                <input
                  type="number"
                  value={formResponseTime}
                  onChange={(e) => setFormResponseTime(e.target.value)}
                  style={inputStyle}
                  placeholder="90"
                />
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Target: &lt;{formatResponseTime(parseInt(formResponseTime) || 0)}
                </div>
              </div>

              <div>
                <label style={labelStyle}>PPV Unlock Target (%)</label>
                <input
                  type="number"
                  value={formPpvUnlock}
                  onChange={(e) => setFormPpvUnlock(e.target.value)}
                  style={inputStyle}
                  placeholder="70"
                />
              </div>

              <div>
                <label style={labelStyle}>PPV Minimum Sent (count)</label>
                <input
                  type="number"
                  value={formPpvMinSent}
                  onChange={(e) => setFormPpvMinSent(e.target.value)}
                  style={inputStyle}
                  placeholder="75"
                />
              </div>

              <div>
                <label style={labelStyle}>Weekly Bonus Amount (cents)</label>
                <input
                  type="number"
                  value={formBonusAmount}
                  onChange={(e) => setFormBonusAmount(e.target.value)}
                  style={inputStyle}
                  placeholder="5000"
                />
                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  ${(parseInt(formBonusAmount) / 100 || 0).toFixed(2)}
                </div>
              </div>

              {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>❌ {error}</div>}

              <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                <button onClick={() => setModal(null)} style={cancelBtnStyle}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={saveBtnStyle}>
                  {saving ? "Saving..." : modal === "add" ? "Create Target" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──
const navBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  fontSize: "14px",
  fontWeight: "600",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "10px",
  cursor: "pointer",
  color: "var(--text-secondary)",
};

const statCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "16px",
  padding: "18px 20px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const metricBoxStyle: React.CSSProperties = {
  background: "var(--bg)",
  borderRadius: "10px",
  padding: "10px",
  textAlign: "center",
};

const actionBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: "12px",
  fontWeight: "600",
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  cursor: "pointer",
  color: "var(--text-secondary)",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 16px",
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  borderBottom: "1px solid var(--border)",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 16px",
  fontSize: "14px",
  color: "var(--text)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

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
