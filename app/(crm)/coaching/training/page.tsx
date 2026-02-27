"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import TrainingMaterialCard, {
  type TrainingMaterialCardMaterial,
  type TrainingMaterialCategory,
  type TrainingMaterialType,
} from "../../../../components/TrainingMaterialCard";
import TrainingAssigner, {
  type TrainingAssignerChatterOption,
  type TrainingAssignerMaterialOption,
} from "../../../../components/TrainingAssigner";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function labelForType(type: TrainingMaterialType) {
  const map: Record<TrainingMaterialType, string> = {
    document: "Document",
    video: "Video",
    course: "Course",
    quiz: "Quiz",
    template: "Template",
    link: "Link",
  };
  return map[type] ?? type;
}

function labelForCategory(category: TrainingMaterialCategory) {
  const map: Record<TrainingMaterialCategory, string> = {
    onboarding: "Onboarding",
    sales_techniques: "Sales techniques",
    fan_engagement: "Fan engagement",
    ppv_strategies: "PPV strategies",
    time_management: "Time management",
    platform_rules: "Platform rules",
    creator_specific: "Creator specific",
    other: "Other",
  };
  return map[category] ?? category;
}

type MaterialRow = {
  material: TrainingMaterialCardMaterial;
  assignedCount?: number;
  completedCount?: number;
};

const ALL_TYPES: TrainingMaterialType[] = [
  "document",
  "video",
  "course",
  "quiz",
  "template",
  "link",
];

const ALL_CATEGORIES: TrainingMaterialCategory[] = [
  "onboarding",
  "sales_techniques",
  "fan_engagement",
  "ppv_strategies",
  "time_management",
  "platform_rules",
  "creator_specific",
  "other",
];

function parseTags(raw: string): string[] | undefined {
  const tags = raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

export default function TrainingLibraryPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  const [typeFilter, setTypeFilter] = useState<"all" | TrainingMaterialType>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | TrainingMaterialCategory>("all");

  const [showAssigner, setShowAssigner] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  // Create material form
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newType, setNewType] = useState<TrainingMaterialType>("document");
  const [newCategory, setNewCategory] = useState<TrainingMaterialCategory>("onboarding");
  const [newUrl, setNewUrl] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newEstimatedMinutes, setNewEstimatedMinutes] = useState("");
  const [newTags, setNewTags] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const canManage = isSupervisorRole(user?.role);
  const isAdmin = user?.role === "admin";

  const coachingApi = (api as any).crm.coaching;

  const materialsRaw = useQuery(
    coachingApi.getTrainingMaterials,
    token
      ? {
          token,
          includeStats: canManage,
          includeInactive: canManage,
          limit: 500,
        }
      : "skip"
  ) as any[] | undefined;

  const createTrainingMaterial = useMutation(api.crm.coaching.createTrainingMaterial);

  const chattersRaw = useQuery(
    api.crm.chatters.list,
    token && canManage ? { token } : "skip"
  ) as any[] | undefined;

  const chatterOptions = useMemo((): TrainingAssignerChatterOption[] => {
    return (chattersRaw || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name ?? c.username ?? c.id),
      role: c.role,
      avatarEmoji: c.avatarEmoji,
    }));
  }, [chattersRaw]);

  const materialsWithCounts = useMemo((): MaterialRow[] => {
    const list = (materialsRaw || []).map((m: any) => {
      const material: TrainingMaterialCardMaterial = {
        id: String(m.id ?? m._id),
        title: String(m.title ?? ""),
        description: m.description ?? undefined,
        type: m.type as TrainingMaterialType,
        category: m.category as TrainingMaterialCategory,
        url: m.url ?? undefined,
        estimatedMinutes: m.estimatedMinutes ?? undefined,
        isActive: m.isActive ?? true,
      };
      return {
        material,
        assignedCount: m.assignedCount ?? undefined,
        completedCount: m.completedCount ?? undefined,
      };
    });

    list.sort((a, b) => {
      const au = Number((materialsRaw || []).find((x: any) => String(x.id ?? x._id) === a.material.id)?.updatedAt ?? 0);
      const bu = Number((materialsRaw || []).find((x: any) => String(x.id ?? x._id) === b.material.id)?.updatedAt ?? 0);
      return bu - au;
    });

    return list;
  }, [materialsRaw]);

  const filteredMaterials = useMemo(() => {
    return materialsWithCounts.filter((row) => {
      const typeOk = typeFilter === "all" ? true : row.material.type === typeFilter;
      const catOk = categoryFilter === "all" ? true : row.material.category === categoryFilter;
      return typeOk && catOk;
    });
  }, [materialsWithCounts, typeFilter, categoryFilter]);

  const materialOptions = useMemo((): TrainingAssignerMaterialOption[] => {
    return filteredMaterials.map((row) => ({
      id: row.material.id,
      title: row.material.title,
      type: row.material.type,
      category: row.material.category,
    }));
  }, [filteredMaterials]);

  const resetCreate = () => {
    setNewTitle("");
    setNewDescription("");
    setNewType("document");
    setNewCategory("onboarding");
    setNewUrl("");
    setNewContent("");
    setNewEstimatedMinutes("");
    setNewTags("");
    setCreateError("");
  };

  const submitCreate = async () => {
    if (!token) return;
    setCreateError("");

    const title = newTitle.trim();
    if (!title) {
      setCreateError("Title is required.");
      return;
    }

    const minutes = newEstimatedMinutes.trim() ? Number(newEstimatedMinutes) : undefined;
    if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 0)) {
      setCreateError("Estimated minutes must be a non-negative number.");
      return;
    }

    setCreating(true);
    try {
      const id = await createTrainingMaterial({
        token,
        title,
        description: newDescription.trim() ? newDescription.trim() : undefined,
        type: newType,
        category: newCategory,
        url: newUrl.trim() ? newUrl.trim() : undefined,
        content: newContent.trim() ? newContent.trim() : undefined,
        estimatedMinutes: minutes,
        tags: parseTags(newTags),
      } as any);

      setShowCreate(false);
      resetCreate();
      router.push(`/coaching/training/${String(id)}`);
    } catch (e: any) {
      setCreateError(e?.message ? String(e.message) : "Failed to create material.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>📚 Training Library</div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
            Browse training materials and assign them to chatters.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {canManage ? (
            <button
              onClick={() => setShowAssigner(true)}
              style={{
                padding: "10px 12px",
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Bulk assign
            </button>
          ) : null}

          {isAdmin ? (
            <button
              onClick={() => {
                resetCreate();
                setShowCreate(true);
              }}
              style={{
                padding: "10px 12px",
                background: "var(--accent)",
                color: "white",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              + New Material
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Category</div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="all">All</option>
            {ALL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {labelForCategory(c)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Type</div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="all">All</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>
                {labelForType(t)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        {materialsRaw === undefined ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
        ) : filteredMaterials.length === 0 ? (
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontWeight: 900 }}>No materials found.</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              Try changing filters.
            </div>
          </div>
        ) : (
          filteredMaterials.map((row) => (
            <TrainingMaterialCard
              key={row.material.id}
              material={row.material}
              assignedCount={row.assignedCount}
              completedCount={row.completedCount}
            />
          ))
        )}
      </div>

      <TrainingAssigner
        open={showAssigner}
        token={token}
        materials={materialOptions}
        chatters={chatterOptions}
        onClose={() => setShowAssigner(false)}
        onAssigned={() => {
          // Reactive queries update automatically.
        }}
      />

      {showCreate ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating) {
              setShowCreate(false);
            }
          }}
        >
          <div
            style={{
              width: "min(900px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>➕ New Training Material</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)" }}>
                  Create a new item in the training library.
                </div>
              </div>
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  cursor: creating ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                marginTop: 14,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Title</div>
                <input
                  value={newTitle}
                  disabled={creating}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Onboarding: Voice & Tone"
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Type</div>
                <select
                  value={newType}
                  disabled={creating}
                  onChange={(e) => setNewType(e.target.value as TrainingMaterialType)}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  {ALL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {labelForType(t)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Category</div>
                <select
                  value={newCategory}
                  disabled={creating}
                  onChange={(e) => setNewCategory(e.target.value as TrainingMaterialCategory)}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {labelForCategory(c)}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Description (optional)</div>
                <textarea
                  value={newDescription}
                  disabled={creating}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    resize: "vertical",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>URL (optional)</div>
                <input
                  value={newUrl}
                  disabled={creating}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://…"
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Estimated minutes (optional)</div>
                <input
                  value={newEstimatedMinutes}
                  disabled={creating}
                  onChange={(e) => setNewEstimatedMinutes(e.target.value)}
                  placeholder="e.g. 10"
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Tags (optional)</div>
                <input
                  value={newTags}
                  disabled={creating}
                  onChange={(e) => setNewTags(e.target.value)}
                  placeholder="comma,separated,tags"
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Content (optional)</div>
                <textarea
                  value={newContent}
                  disabled={creating}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={10}
                  placeholder="Write the material content here (markdown/plain text)."
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            {createError ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(239,68,68,0.35)",
                  background: "rgba(239,68,68,0.08)",
                  color: "var(--red)",
                  fontSize: 13,
                }}
              >
                {createError}
              </div>
            ) : null}

            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                style={{
                  padding: "10px 12px",
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontWeight: 900,
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>

              <button
                onClick={submitCreate}
                disabled={creating}
                style={{
                  padding: "10px 12px",
                  background: "var(--accent)",
                  color: "white",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  fontWeight: 900,
                  cursor: creating ? "not-allowed" : "pointer",
                  opacity: creating ? 0.7 : 1,
                }}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
