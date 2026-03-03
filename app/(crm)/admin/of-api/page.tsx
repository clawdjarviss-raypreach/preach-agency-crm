"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import OfSyncStatus from "@/components/OfSyncStatus";

type Creator = { id: string; name: string };
type OfConfig = { id: string; api_key: string | null };
type OfAccount = {
  id: string;
  account_id: string;
  creator_id: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  creator: Array<{ name: string }> | null;
};

export default function OfApiAdminPage() {
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [creators, setCreators] = useState<Creator[]>([]);
  const [config, setConfig] = useState<OfConfig | null>(null);
  const [accounts, setAccounts] = useState<OfAccount[]>([]);

  const hasApiKey = useMemo(() => !!config?.api_key, [config]);

  const load = async () => {
    const [{ data: creatorsData, error: creatorsErr }, { data: configData, error: configErr }, { data: accountsData, error: accountsErr }] =
      await Promise.all([
        supabase.from("crm_creators").select("id, name").order("name", { ascending: true }),
        supabase.from("crm_of_api_config").select("id, api_key").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        supabase
          .from("crm_of_accounts")
          .select("id, account_id, creator_id, display_name, status, last_sync_at, creator:crm_creators(name)")
          .order("account_id", { ascending: true }),
      ]);

    if (creatorsErr) console.error("Failed loading creators", creatorsErr);
    if (configErr) console.error("Failed loading OF config", configErr);
    if (accountsErr) console.error("Failed loading OF accounts", accountsErr);

    setCreators((creatorsData ?? []) as Creator[]);
    setConfig((configData as OfConfig | null) ?? null);
    setAccounts((accountsData ?? []) as OfAccount[]);
  };

  useEffect(() => {
    load();
  }, []);

  const saveApiKey = async () => {
    setStatus("");
    try {
      const payload = { api_key: apiKey };
      let error = null as any;

      if (config?.id) {
        const res = await supabase
          .from("crm_of_api_config")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", config.id);
        error = res.error;
      } else {
        const res = await supabase
          .from("crm_of_api_config")
          .insert({ ...payload, updated_at: new Date().toISOString() });
        error = res.error;
      }

      if (error) throw new Error(error.message);

      setApiKey("");
      setStatus("API key saved");
      await load();
    } catch (e: any) {
      setStatus(e.message || "Failed to save API key");
    }
  };

  const addAccount = async () => {
    setStatus("");
    try {
      const { error } = await supabase.from("crm_of_accounts").upsert(
        {
          account_id: accountId,
          creator_id: creatorId,
          display_name: displayName || null,
          status: "active",
        },
        { onConflict: "account_id" }
      );

      if (error) throw new Error(error.message);

      setStatus("Account saved");
      setAccountId("");
      setDisplayName("");
      await load();
    } catch (e: any) {
      setStatus(e.message || "Failed to save account");
    }
  };

  const runSync = async (job: "earnings" | "messages" | "fans", targetAccountId?: string) => {
    try {
      const { error } = await supabase.functions.invoke("of-sync", {
        body: {
          job: job === "messages" ? "chats" : job,
          accountId: targetAccountId,
        },
      });
      if (error) throw error;
      setStatus(`${job} sync triggered`);
      await load();
    } catch (e: any) {
      setStatus(e?.message || "Sync failed");
    }
  };

  const healthCheck = async () => {
    const activeAccounts = accounts.filter((a) => a.status === "active").length;
    if (!hasApiKey) {
      setStatus("Health check failed: missing API key");
      return;
    }
    setStatus(`Health check passed: ${activeAccounts} active account${activeAccounts === 1 ? "" : "s"}`);
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
        <p style={{ color: "#666" }}>Configured: {hasApiKey ? "Yes" : "No"}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="password"
            placeholder="Enter OF API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ padding: 8, width: 360 }}
          />
          <button onClick={saveApiKey}>Save Key</button>
          <button onClick={healthCheck}>Health Check</button>
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginBottom: 20 }}>
        <h3>Connect Account</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select creator</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="OF account ID" style={{ padding: 8 }} />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" style={{ padding: 8 }} />
          <button onClick={addAccount} disabled={!creatorId || !accountId}>
            Save Account
          </button>
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
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.creator?.[0]?.name || "—"}</td>
                <td>{account.account_id}</td>
                <td>{account.status}</td>
                <td>{account.last_sync_at ? new Date(account.last_sync_at).toLocaleString() : "—"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => runSync("earnings", account.account_id)}>Sync Earnings</button>
                  <button onClick={() => runSync("messages", account.account_id)}>Sync Messages</button>
                  <button onClick={() => runSync("fans", account.account_id)}>Sync Fans</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
