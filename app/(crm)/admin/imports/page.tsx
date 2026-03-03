"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type ImportRow = {
  id: string;
  filename: string;
  file_type: "transactions" | "dashboard";
  status: string;
  record_count: number;
  imported_at: string;
};

type Chatter = { id: string; name: string };

function normalizeHeader(input: string) {
  return input
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\-_]/g, " ")
    .trim();
}

function getField(row: Record<string, any>, keys: string[], fallback = "") {
  const normalized = Object.entries(row).reduce<Record<string, any>>((acc, [k, v]) => {
    acc[normalizeHeader(k)] = v;
    return acc;
  }, {});
  for (const key of keys) {
    const v = normalized[normalizeHeader(key)];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

function toNum(v: any) {
  if (typeof v === "number") return v;
  const parsed = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(v: any) {
  return Math.round(toNum(v));
}

function toDate(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const parsed = new Date(v);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

async function parseSpreadsheet(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: "" }) as Record<string, any>[];
  return rows;
}

export default function ImportsPage() {
  const [user, setUser] = useState<any>(null);
  const [transactionsFile, setTransactionsFile] = useState<File | null>(null);
  const [dashboardFile, setDashboardFile] = useState<File | null>(null);
  const [busyType, setBusyType] = useState<"transactions" | "dashboard" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedImportId, setSelectedImportId] = useState<string>("");

  const [imports, setImports] = useState<ImportRow[] | null>(null);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [unmatchedChatters, setUnmatchedChatters] = useState<string[]>([]);

  useEffect(() => {
    const u = localStorage.getItem("crm_user");
    if (u) setUser(JSON.parse(u));
  }, []);

  const loadImports = async () => {
    const { data, error } = await supabase
      .from("crm_om_imports")
      .select("id, filename, file_type, status, record_count, imported_at")
      .order("imported_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed loading imports", error);
      setImports([]);
      return;
    }

    const rows = (data ?? []) as ImportRow[];
    setImports(rows);
    if (!selectedImportId && rows.length > 0) setSelectedImportId(rows[0].id);
  };

  const loadChatters = async () => {
    const { data, error } = await supabase.from("crm_chatters").select("id, name").order("name", { ascending: true });
    if (error) {
      console.error("Failed loading chatters", error);
      setChatters([]);
      return;
    }
    setChatters((data ?? []) as Chatter[]);
  };

  useEffect(() => {
    loadImports();
    loadChatters();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDetails() {
      if (!selectedImportId) {
        setUnmatchedChatters([]);
        return;
      }
      const { data, error } = await supabase
        .from("crm_om_chatter_metrics")
        .select("chatter_om_name")
        .eq("import_id", selectedImportId)
        .is("chatter_id", null)
        .limit(5000);

      if (cancelled) return;
      if (error) {
        console.error("Failed loading import details", error);
        setUnmatchedChatters([]);
        return;
      }

      const unique = Array.from(new Set((data ?? []).map((r: any) => String(r.chatter_om_name || "").trim()).filter(Boolean)));
      setUnmatchedChatters(unique);
    }

    loadDetails();
    return () => {
      cancelled = true;
    };
  }, [selectedImportId]);

  const lastImport = imports?.[0];

  const importDetails = useMemo(() => {
    return {
      unmatchedChatters,
    };
  }, [unmatchedChatters]);

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <div style={{ background: "var(--surface)", borderRadius: 24, padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h3 style={{ fontSize: 18, color: "var(--text)", marginBottom: 8 }}>Access Denied</h3>
        <p style={{ color: "var(--text-secondary)" }}>Admin only.</p>
      </div>
    );
  }

  const uploadAndProcess = async (file: File, fileType: "transactions" | "dashboard") => {
    setError("");
    setSuccess("");
    setBusyType(fileType);

    try {
      const rows = await parseSpreadsheet(file);
      if (!rows.length) throw new Error("No rows found in uploaded file");

      const { data: importInserted, error: importErr } = await supabase
        .from("crm_om_imports")
        .insert({
          imported_by: user.id,
          filename: file.name,
          file_type: fileType,
          status: "processing",
          record_count: rows.length,
          data: rows,
        })
        .select("id")
        .single();

      if (importErr) throw new Error(importErr.message);

      if (fileType === "dashboard") {
        const mapped = rows.map((row) => {
          const chatterName = String(getField(row, ["Chatter", "Chatter Name", "Agent", "Name"]))
            .trim();

          return {
            import_id: importInserted.id,
            date:
              toDate(getField(row, ["Date", "Snapshot Date", "Report Date"])) ||
              new Date().toISOString().slice(0, 10),
            period_end: toDate(getField(row, ["Period End", "End Date"])),
            chatter_om_name: chatterName || "Unknown",
            total_sales: toNum(getField(row, ["Total Sales", "Revenue", "Total"])),
            ppv_sales: toNum(getField(row, ["PPV Sales", "Message Sales", "PPV"])),
            tip_sales: toNum(getField(row, ["Tip Sales", "Tips"])),
            impact_pct: toNum(getField(row, ["Impact %", "Impact"])),
            messages_sent: toInt(getField(row, ["Messages Sent", "Messages"])),
            avg_response_time: toInt(getField(row, ["Avg Response Time", "Average Response Time"])),
            manually_typed: toInt(getField(row, ["Manually Typed"])),
            ai_replies: toInt(getField(row, ["AI Replies"])),
            templates_sent: toInt(getField(row, ["Templates Sent"])),
            ppv_sent: toInt(getField(row, ["PPV Sent"])),
            ppv_sold: toInt(getField(row, ["PPV Sold"])),
            ppv_open_rate: toNum(getField(row, ["PPV Open Rate"])),
            ppv_avg_price: toNum(getField(row, ["PPV Avg Price", "Avg PPV Price"])),
          };
        });

        // best-effort chatter mapping by exact name
        const chatterByName = new Map(chatters.map((c) => [c.name.trim().toLowerCase(), c.id]));
        const withChatterIds = mapped.map((m) => ({
          ...m,
          chatter_id: chatterByName.get(m.chatter_om_name.trim().toLowerCase()) || null,
        }));

        const chunkSize = 500;
        for (let i = 0; i < withChatterIds.length; i += chunkSize) {
          const chunk = withChatterIds.slice(i, i + chunkSize);
          const { error: metricsErr } = await supabase.from("crm_om_chatter_metrics").insert(chunk);
          if (metricsErr) throw new Error(metricsErr.message);
        }
      }

      const { error: markErr } = await supabase
        .from("crm_om_imports")
        .update({ status: "success", error_message: null })
        .eq("id", importInserted.id);
      if (markErr) throw new Error(markErr.message);

      setSuccess(
        `${fileType} import complete: ${rows.length} rows imported` +
          (fileType === "dashboard" && unmatchedChatters.length ? `, ${unmatchedChatters.length} unmatched chatters` : "")
      );
      if (fileType === "transactions") setTransactionsFile(null);
      if (fileType === "dashboard") setDashboardFile(null);

      await loadImports();
      if (importInserted.id) setSelectedImportId(importInserted.id);
    } catch (e: any) {
      setError(e?.message || "Import failed");
    } finally {
      setBusyType(null);
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>📥 OM Imports</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 4 }}>
          Upload transactions/dashboard Excel files and map unmatched chatters.
        </p>
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: 6 }}>
          Last Import
        </div>
        <div style={{ fontSize: 18, color: "var(--text)", fontWeight: 600 }}>
          {lastImport ? new Date(lastImport.imported_at).toLocaleString() : "No imports yet"}
        </div>
      </div>

      {success && (
        <div style={{ padding: 12, borderRadius: 12, background: "var(--green-bg)", color: "var(--green)", marginBottom: 12 }}>
          ✅ {success}
        </div>
      )}
      {error && (
        <div style={{ padding: 12, borderRadius: 12, background: "var(--red-bg)", color: "var(--red)", marginBottom: 12 }}>
          ❌ {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginBottom: 24 }}>
        <UploadCard
          title="Transactions Export"
          file={transactionsFile}
          setFile={setTransactionsFile}
          busy={busyType === "transactions"}
          onUpload={() => transactionsFile && uploadAndProcess(transactionsFile, "transactions")}
        />
        <UploadCard
          title="Dashboard Export"
          file={dashboardFile}
          setFile={setDashboardFile}
          busy={busyType === "dashboard"}
          onUpload={() => dashboardFile && uploadAndProcess(dashboardFile, "dashboard")}
        />
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16 }}>
        <h2 style={{ fontSize: 18, color: "var(--text)", marginBottom: 12 }}>Import History</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["File", "Type", "Records", "Unmatched", "Status", "Imported At", "Actions"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(imports || []).map((row: any) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={cell}>{row.filename}</td>
                  <td style={cell}>{row.file_type}</td>
                  <td style={cell}>{row.record_count}</td>
                  <td style={cell}>{row.id === selectedImportId ? unmatchedChatters.length : "—"}</td>
                  <td style={cell}>{row.status}</td>
                  <td style={cell}>{new Date(row.imported_at).toLocaleString()}</td>
                  <td style={cell}>
                    <button onClick={() => setSelectedImportId(row.id)} style={btn}>
                      Details
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this import and all linked metrics?")) return;
                        const { error: delMetricsErr } = await supabase
                          .from("crm_om_chatter_metrics")
                          .delete()
                          .eq("import_id", row.id);
                        if (delMetricsErr) throw new Error(delMetricsErr.message);
                        const { error: delImportErr } = await supabase.from("crm_om_imports").delete().eq("id", row.id);
                        if (delImportErr) throw new Error(delImportErr.message);
                        if (selectedImportId === row.id) setSelectedImportId("");
                        await loadImports();
                      }}
                      style={{ ...btn, color: "var(--red)" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {imports && imports.length === 0 && (
                <tr>
                  <td style={cell} colSpan={7}>
                    No imports yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!!selectedImportId && importDetails && (
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginTop: 16 }}>
          <h3 style={{ fontSize: 17, marginBottom: 10, color: "var(--text)" }}>Import Details</h3>

          {importDetails.unmatchedChatters.length > 0 && (
            <div style={{ background: "var(--orange-bg)", color: "var(--orange)", padding: 12, borderRadius: 12, marginBottom: 12 }}>
              ⚠️ {importDetails.unmatchedChatters.length} unmatched chatters. Map them below:
            </div>
          )}

          {importDetails.unmatchedChatters.map((name: string) => (
            <div key={name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={{ minWidth: 180, color: "var(--text)", fontSize: 14 }}>{name}</div>
              <select id={`map-${name}`} style={{ ...input, maxWidth: 280 }}>
                <option value="">Select chatter</option>
                {(chatters || []).map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                style={btn}
                onClick={async () => {
                  const selected = (document.getElementById(`map-${name}`) as HTMLSelectElement)?.value;
                  if (!selected) return;
                  const { error } = await supabase
                    .from("crm_om_chatter_metrics")
                    .update({ chatter_id: selected })
                    .eq("import_id", selectedImportId)
                    .eq("chatter_om_name", name);
                  if (error) throw new Error(error.message);

                  setUnmatchedChatters((prev) => prev.filter((n) => n !== name));
                }}
              >
                Map
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadCard({
  title,
  file,
  setFile,
  busy,
  onUpload,
}: {
  title: string;
  file: File | null;
  setFile: (f: File | null) => void;
  busy: boolean;
  onUpload: () => void;
}) {
  return (
    <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16 }}>
      <h3 style={{ fontSize: 16, color: "var(--text)", marginBottom: 10 }}>{title}</h3>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        style={{ marginBottom: 10, color: "var(--text-secondary)" }}
      />
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>{file ? file.name : "No file selected"}</div>
      <button onClick={onUpload} disabled={!file || busy} style={{ ...btn, opacity: !file || busy ? 0.6 : 1 }}>
        {busy ? "Uploading..." : "Upload & Parse"}
      </button>
    </div>
  );
}

const cell: React.CSSProperties = {
  padding: "10px 8px",
  color: "var(--text-secondary)",
  fontSize: 13,
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 12,
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg)",
  color: "var(--text-secondary)",
  cursor: "pointer",
  marginRight: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg)",
  color: "var(--text)",
};
