"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type VipStrategy = "top_performer" | "round_robin" | "specific_chatters";

type RoutingConfigState = {
  autoRoutingEnabled: boolean;
  vipAssignmentStrategy: VipStrategy;
  vipSpecificChatterIds: string[];
  whalePriorityBoostEnabled: boolean;
  workloadBalancingThreshold: number;
};

function normalizeId(id: any): string {
  return typeof id === "string" ? id : String(id);
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function RoutingConfigPanel() {
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) {
      try {
        setUser(JSON.parse(u));
      } catch {
        setUser(null);
      }
    }
  }, []);

  const canAdmin = !!user && ["admin", "manager"].includes(user.role);

  const [creatorsRaw, setCreatorsRaw] = useState<any[] | undefined>(undefined);
  const [chattersRaw, setChattersRaw] = useState<any[] | undefined>(undefined);

  useEffect(() => {
    if (!token) return;

    async function fetchCreators() {
      const { data, error } = await supabase
        .from("crm_creators")
        .select("*")
        .eq("status", "active");

      if (error) {
        console.error("Failed to fetch creators:", error.message);
        setCreatorsRaw([]);
        return;
      }
      setCreatorsRaw(data ?? []);
    }

    async function fetchChatters() {
      const { data, error } = await supabase
        .from("crm_chatters")
        .select("*");

      if (error) {
        console.error("Failed to fetch chatters:", error.message);
        setChattersRaw([]);
        return;
      }
      setChattersRaw(data ?? []);
    }

    fetchCreators();
    fetchChatters();
  }, [token]);

  const creatorOptions = useMemo(() => {
    return (creatorsRaw || []).map((c) => ({ id: normalizeId(c.id), name: c.name as string }));
  }, [creatorsRaw]);

  const chatterOptions = useMemo(() => {
    return (chattersRaw || [])
      .map((c) => ({ id: normalizeId(c.id), name: c.name as string, role: c.role as string }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [chattersRaw]);

  const [creatorId, setCreatorId] = useState<string>("");

  const [routingDoc, setRoutingDoc] = useState<
    | {
        exists: boolean;
        config: any;
        updatedAt: number | null;
        updatedBy: string | null;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    if (!token || !creatorId) return;

    async function fetchRoutingConfig() {
      const { data, error } = await supabase
        .from("crm_routing_configs")
        .select("*")
        .eq("creator_id", creatorId)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = no rows found, which is fine
        console.error("Failed to fetch routing config:", error.message);
        setRoutingDoc({ exists: false, config: null, updatedAt: null, updatedBy: null });
        return;
      }

      if (!data) {
        setRoutingDoc({ exists: false, config: null, updatedAt: null, updatedBy: null });
        return;
      }

      setRoutingDoc({
        exists: true,
        config: data,
        updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : null,
        updatedBy: data.updated_by ?? null,
      });
    }

    fetchRoutingConfig();
  }, [token, creatorId]);

  const [local, setLocal] = useState<RoutingConfigState>(() => ({
    autoRoutingEnabled: false,
    vipAssignmentStrategy: "top_performer",
    vipSpecificChatterIds: [],
    whalePriorityBoostEnabled: true,
    workloadBalancingThreshold: 12,
  }));

  useEffect(() => {
    if (!routingDoc?.config) return;
    setLocal({
      autoRoutingEnabled: !!routingDoc.config.autoRoutingEnabled,
      vipAssignmentStrategy: routingDoc.config.vipAssignmentStrategy as VipStrategy,
      vipSpecificChatterIds: (routingDoc.config.vipSpecificChatterIds || []).map(normalizeId),
      whalePriorityBoostEnabled: !!routingDoc.config.whalePriorityBoostEnabled,
      workloadBalancingThreshold:
        typeof routingDoc.config.workloadBalancingThreshold === "number"
          ? routingDoc.config.workloadBalancingThreshold
          : 12,
    });
  }, [routingDoc]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOkAt, setSaveOkAt] = useState<number | null>(null);

  async function save() {
    if (!token || !creatorId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { error } = await supabase.from("crm_routing_configs").upsert({
        creator_id: creatorId,
        autoRoutingEnabled: local.autoRoutingEnabled,
        vipAssignmentStrategy: local.vipAssignmentStrategy,
        vipSpecificChatterIds:
          local.vipAssignmentStrategy === "specific_chatters"
            ? local.vipSpecificChatterIds
            : [],
        whalePriorityBoostEnabled: local.whalePriorityBoostEnabled,
        workloadBalancingThreshold: local.workloadBalancingThreshold,
        updated_at: new Date().toISOString(),
      });

      if (error) throw new Error(error.message);

      setSaveOkAt(Date.now());
    } catch (e: any) {
      setSaveError(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 800,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 14,
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
    alignItems: "start",
  };

  if (!token) {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "var(--text)" }}>Routing Config</div>
        <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 13 }}>
          Please log in to configure routing.
        </div>
      </div>
    );
  }

  if (!canAdmin) {
    return (
      <div style={cardStyle}>
        <div style={{ fontWeight: 900, fontSize: 16, color: "var(--text)" }}>Routing Config</div>
        <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 13 }}>
          Admin/Manager only.
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 16, color: "var(--text)" }}>
            VIP Routing & Escalation — Routing Rules
          </div>
          <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 13 }}>
            Configure per-creator auto-routing: VIP strategy, whale priority boost, workload threshold.
          </div>
        </div>

        <button
          onClick={save}
          disabled={!creatorId || saving}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: saving ? "rgba(59,130,246,0.12)" : "var(--accent)",
            color: saving ? "var(--text)" : "white",
            cursor: !creatorId || saving ? "not-allowed" : "pointer",
            fontWeight: 900,
            fontSize: 13,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div style={{ marginTop: 16, ...rowStyle }}>
        <div>
          <div style={labelStyle}>Creator</div>
          <select
            value={creatorId}
            onChange={(e) => setCreatorId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Select a creator…</option>
            {creatorOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={local.autoRoutingEnabled}
                onChange={(e) => setLocal((p) => ({ ...p, autoRoutingEnabled: e.target.checked }))}
              />
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>
                Enable auto-routing
              </span>
            </label>
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 12 }}>
              When enabled, new queue items can be auto-assigned based on VIP/Whale/New rules.
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={local.whalePriorityBoostEnabled}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, whalePriorityBoostEnabled: e.target.checked }))
                }
              />
              <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>
                Whale priority boost
              </span>
            </label>
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 12 }}>
              If enabled, whale messages are boosted to the highest queue priority.
            </div>
          </div>
        </div>

        <div>
          <div style={labelStyle}>VIP assignment strategy</div>

          <div style={{ display: "grid", gap: 8 }}>
            {([
              { key: "top_performer", label: "Top performer" },
              { key: "round_robin", label: "Round robin" },
              { key: "specific_chatters", label: "Specific chatters" },
            ] as { key: VipStrategy; label: string }[]).map((opt) => (
              <label
                key={opt.key}
                style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
              >
                <input
                  type="radio"
                  name="vipStrategy"
                  checked={local.vipAssignmentStrategy === opt.key}
                  onChange={() => setLocal((p) => ({ ...p, vipAssignmentStrategy: opt.key }))}
                />
                <span style={{ fontSize: 14, fontWeight: 900, color: "var(--text)" }}>
                  {opt.label}
                </span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={labelStyle}>Workload balancing threshold</div>
            <input
              type="number"
              min={0}
              value={local.workloadBalancingThreshold}
              onChange={(e) =>
                setLocal((p) => ({
                  ...p,
                  workloadBalancingThreshold: Math.max(0, Number(e.target.value || 0)),
                }))
              }
              style={inputStyle}
            />
            <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: 12 }}>
              Chatters above this open-item count are de-prioritized.
            </div>
          </div>
        </div>

        <div>
          <div style={labelStyle}>Specific VIP chatters</div>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 8 }}>
            Used only when strategy is "Specific chatters".
          </div>

          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 10,
              maxHeight: 260,
              overflow: "auto",
              background: "var(--bg)",
            }}
          >
            {chatterOptions.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No chatters loaded.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {chatterOptions.map((c) => {
                  const checked = local.vipSpecificChatterIds.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={local.vipAssignmentStrategy !== "specific_chatters"}
                        onChange={() =>
                          setLocal((p) => ({
                            ...p,
                            vipSpecificChatterIds: toggleInList(p.vipSpecificChatterIds, c.id),
                          }))
                        }
                      />
                      <span style={{ fontSize: 13, fontWeight: 900, color: "var(--text)" }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.role}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 6 }}>
        {saveError ? (
          <div style={{ color: "#ef4444", fontWeight: 900, fontSize: 13 }}>{saveError}</div>
        ) : null}
        {saveOkAt ? (
          <div style={{ color: "#22c55e", fontWeight: 900, fontSize: 13 }}>
            Saved {new Date(saveOkAt).toLocaleTimeString()}.
          </div>
        ) : null}
        {routingDoc?.updatedAt ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
            Last updated: {new Date(routingDoc.updatedAt).toLocaleString()}
          </div>
        ) : null}
      </div>
    </div>
  );
}
