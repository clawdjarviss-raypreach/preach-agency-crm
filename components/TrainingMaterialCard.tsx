"use client";

import Link from "next/link";

export type TrainingMaterialType =
  | "document"
  | "video"
  | "course"
  | "quiz"
  | "template"
  | "link";

export type TrainingMaterialCategory =
  | "onboarding"
  | "sales_techniques"
  | "fan_engagement"
  | "ppv_strategies"
  | "time_management"
  | "platform_rules"
  | "creator_specific"
  | "other";

export type TrainingMaterialCardMaterial = {
  id: string;
  title: string;
  description?: string;
  type: TrainingMaterialType;
  category: TrainingMaterialCategory;
  url?: string;
  estimatedMinutes?: number;
  isActive?: boolean;
};

function typeIcon(type: TrainingMaterialType) {
  switch (type) {
    case "document":
      return "📄";
    case "video":
      return "🎥";
    case "quiz":
      return "❓";
    case "course":
      return "🎓";
    case "template":
      return "🧩";
    case "link":
      return "🔗";
    default:
      return "📚";
  }
}

function categoryLabel(category: TrainingMaterialCategory) {
  const map: Record<TrainingMaterialCategory, string> = {
    onboarding: "Onboarding",
    sales_techniques: "Sales",
    fan_engagement: "Engagement",
    ppv_strategies: "PPV",
    time_management: "Time",
    platform_rules: "Rules",
    creator_specific: "Creator",
    other: "Other",
  };
  return map[category] ?? category;
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TrainingMaterialCard({
  material,
  assignedCount,
  completedCount,
  dueDate,
}: {
  material: TrainingMaterialCardMaterial;
  assignedCount?: number;
  completedCount?: number;
  dueDate?: number;
}) {
  const assigned = assignedCount ?? 0;
  const completed = completedCount ?? 0;
  const showCounts = assignedCount !== undefined || completedCount !== undefined;

  const activeBadge =
    material.isActive === false
      ? { label: "Inactive", color: "var(--text-secondary)", bg: "var(--bg)" }
      : { label: "Active", color: "var(--green)", bg: "var(--green-bg)" };

  const desc = (material.description ?? "").trim();
  const preview = desc.slice(0, 120);

  return (
    <Link
      href={`/coaching/training/${encodeURIComponent(material.id)}`}
      style={{
        display: "block",
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--surface)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
            fontSize: 20,
          }}
          aria-label={`Type: ${material.type}`}
          title={material.type}
        >
          {typeIcon(material.type)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  fontSize: 15,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={material.title}
              >
                {material.title}
              </div>
              <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-secondary)",
                  }}
                >
                  {categoryLabel(material.category)}
                </span>

                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: activeBadge.bg,
                    color: activeBadge.color,
                    fontWeight: 800,
                  }}
                >
                  {activeBadge.label}
                </span>

                {material.estimatedMinutes ? (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    ⏱ {material.estimatedMinutes}m
                  </span>
                ) : null}

                {dueDate ? (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "4px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "rgba(245, 158, 11, 0.10)",
                      color: "var(--orange)",
                      fontWeight: 800,
                    }}
                    title={`Due ${formatDate(dueDate)}`}
                  >
                    Due: {formatDate(dueDate)}
                  </span>
                ) : null}
              </div>
            </div>

            {showCounts ? (
              <div style={{ display: "grid", gap: 4, textAlign: "right", flex: "0 0 auto" }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Assigned</div>
                <div style={{ fontWeight: 900, fontSize: 14 }}>
                  {completed}/{assigned}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Completed</div>
              </div>
            ) : null}
          </div>

          {preview ? (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {preview}
              {desc.length > preview.length ? "…" : ""}
            </div>
          ) : null}

          {material.url ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
              🔗 {material.url}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
