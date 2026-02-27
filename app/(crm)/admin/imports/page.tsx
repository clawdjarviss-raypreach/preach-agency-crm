"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function ImportsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [transactionsFile, setTransactionsFile] = useState<File | null>(null);
  const [dashboardFile, setDashboardFile] = useState<File | null>(null);
  const [busyType, setBusyType] = useState<"transactions" | "dashboard" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedImportId, setSelectedImportId] = useState<string>("");

  const omApi = (api as any).crm.omImport;
  const omActionApi = (api as any).crm.omImportAction;

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const imports = useQuery(omApi.listImports, token ? { token, limit: 50 } : "skip");
  const importDetails = useQuery(
    omApi.getImportDetails,
    token && selectedImportId ? { token, importId: selectedImportId } : "skip"
  );
  const chatters = useQuery((api as any).crm.chatters.list, token ? { token } : "skip");

  const generateUploadUrl = useMutation(omApi.generateUploadUrl);
  const processImport = useAction(omActionApi.processImport);
  const deleteImport = useMutation(omApi.deleteImport);
  const remapChatter = useMutation(omApi.remapChatter);

  const lastImport = imports?.[0];

  const unmatchedNames = useMemo(() => {
    return importDetails?.unmatchedChatters || [];
  }, [importDetails]);

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
      const uploadUrl = await generateUploadUrl({ token });
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const json = await uploadResult.json();
      if (!json.storageId) throw new Error("Upload failed");

      const result = await processImport({
        token,
        storageId: json.storageId,
        fileType,
        filename: file.name,
      });

      setSuccess(
        `${fileType} import complete: ${result.recordCount} rows imported` +
          (result.unmatchedChatters?.length
            ? `, ${result.unmatchedChatters.length} unmatched chatters`
            : "")
      );
      if (fileType === "transactions") setTransactionsFile(null);
      if (fileType === "dashboard") setDashboardFile(null);
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
          {lastImport ? new Date(lastImport.importedAt).toLocaleString() : "No imports yet"}
        </div>
      </div>

      {success && <div style={{ padding: 12, borderRadius: 12, background: "var(--green-bg)", color: "var(--green)", marginBottom: 12 }}>✅ {success}</div>}
      {error && <div style={{ padding: 12, borderRadius: 12, background: "var(--red-bg)", color: "var(--red)", marginBottom: 12 }}>❌ {error}</div>}

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
                {[
                  "File",
                  "Type",
                  "Records",
                  "Unmatched",
                  "Status",
                  "Imported At",
                  "Actions",
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 8px", fontSize: 12, color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(imports || []).map((row: any) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={cell}>{row.filename}</td>
                  <td style={cell}>{row.fileType}</td>
                  <td style={cell}>{row.recordCount}</td>
                  <td style={cell}>{row.unmatchedCount}</td>
                  <td style={cell}>{row.status}</td>
                  <td style={cell}>{new Date(row.importedAt).toLocaleString()}</td>
                  <td style={cell}>
                    <button onClick={() => setSelectedImportId(row.id)} style={btn}>Details</button>
                    <button
                      onClick={async () => {
                        if (!confirm("Delete this import and all linked metrics?")) return;
                        await deleteImport({ token, importId: row.id });
                        if (selectedImportId === row.id) setSelectedImportId("");
                      }}
                      style={{ ...btn, color: "var(--red)" }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {imports && imports.length === 0 && (
                <tr><td style={cell} colSpan={7}>No imports yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!!selectedImportId && importDetails && (
        <div style={{ background: "var(--surface)", borderRadius: 16, padding: 16, marginTop: 16 }}>
          <h3 style={{ fontSize: 17, marginBottom: 10, color: "var(--text)" }}>Import Details</h3>

          {unmatchedNames.length > 0 && (
            <div style={{ background: "var(--orange-bg)", color: "var(--orange)", padding: 12, borderRadius: 12, marginBottom: 12 }}>
              ⚠️ {unmatchedNames.length} unmatched chatters. Map them below:
            </div>
          )}

          {unmatchedNames.map((name: string) => (
            <div key={name} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={{ minWidth: 180, color: "var(--text)", fontSize: 14 }}>{name}</div>
              <select id={`map-${name}`} style={{ ...input, maxWidth: 280 }}>
                <option value="">Select chatter</option>
                {(chatters || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                style={btn}
                onClick={async () => {
                  const selected = (document.getElementById(`map-${name}`) as HTMLSelectElement)?.value;
                  if (!selected) return;
                  await remapChatter({ token, importId: selectedImportId, chatterOmName: name, chatterId: selected });
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
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
        {file ? file.name : "No file selected"}
      </div>
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
