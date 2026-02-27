"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import OfSyncStatus from "../../../../components/OfSyncStatus";

export default function OfApiAdminPage() {
  const [token, setToken] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    setToken(localStorage.getItem("crm_token") || "");
  }, []);

  const creators = useQuery((api as any).crm.creators.list, token ? { token } : "skip");
  const config = useQuery((api as any).crm.ofIntegration.getConfig, token ? { token } : "skip");
  const accounts = useQuery((api as any).crm.ofIntegration.listAccounts, token ? { token } : "skip");

  const setApiKeyMutation = useMutation((api as any).crm.ofIntegration.setApiKey);
  const upsertAccount = useMutation((api as any).crm.ofIntegration.upsertAccount);
  const syncNow = useAction((api as any).crm.ofIntegration.syncNow);
  const healthCheck = useAction((api as any).crm.ofIntegration.healthCheck);

  const saveApiKey = async () => {
    try {
      await setApiKeyMutation({ token, apiKey });
      setApiKey("");
      setStatus("API key saved");
    } catch (e: any) {
      setStatus(e.message || "Failed to save API key");
    }
  };

  const addAccount = async () => {
    try {
      await upsertAccount({
        token,
        accountId,
        creatorId: creatorId as any,
        displayName: displayName || undefined,
        status: "active",
      });
      setStatus("Account saved");
      setAccountId("");
      setDisplayName("");
    } catch (e: any) {
      setStatus(e.message || "Failed to save account");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>OnlyFans API</h1>
      <p style={{ color: "#666", marginBottom: 24 }}>
        Configure OF API key, monitor sync status, and trigger manual sync.
      </p>

      {status && <div style={{ marginBottom: 16, color: "#0f766e" }}>{status}</div>}

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3>API Key</h3>
        <p style={{ color: "#666" }}>Configured: {config?.hasApiKey ? "Yes" : "No"}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password"
            placeholder="Enter OF API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ padding: 8, width: 360 }}
          />
          <button onClick={saveApiKey}>Save Key</button>
          <button
            onClick={async () => {
              const result = await healthCheck({ token });
              setStatus(result.ok ? "Health check passed" : `Health check failed: ${result.message}`);
            }}
          >
            Health Check
          </button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3>Connect Account</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select creator</option>
            {(creators || []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="OF account ID" style={{ padding: 8 }} />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" style={{ padding: 8 }} />
          <button onClick={addAccount} disabled={!creatorId || !accountId}>Save Account</button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Sync Status & Credits</h3>
        <OfSyncStatus />
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16 }}>
        <h3>Connected Accounts</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Creator</th>
              <th style={{ textAlign: "left" }}>Account</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Last Sync</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(accounts || []).map((account: any) => (
              <tr key={account._id}>
                <td>{account.creatorName}</td>
                <td>{account.accountId}</td>
                <td>{account.status}</td>
                <td>{account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : "—"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => syncNow({ token, accountId: account.accountId, endpoint: "earnings" })}>Sync Earnings</button>
                  <button onClick={() => syncNow({ token, accountId: account.accountId, endpoint: "messages" })}>Sync Messages</button>
                  <button onClick={() => syncNow({ token, accountId: account.accountId, endpoint: "fans" })}>Sync Fans</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
