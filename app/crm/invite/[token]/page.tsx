"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";

export default function InviteSignupPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = useMemo(() => params.token ?? "", [params.token]);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const validation = useQuery(api.crm.invites.validateInviteToken, { token });
  const signup = useMutation(api.crm.invites.signupWithInvite);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signup({ token, username, pin });
      localStorage.setItem("crm_token", result.sessionToken);
      localStorage.setItem(
        "crm_user",
        JSON.stringify({ _id: result.chatterId, username, name: username, role: "chatter", assignedCreators: [] })
      );
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Signup failed");
      setLoading(false);
    }
  };

  const invalidReason = validation && !validation.valid ? validation.reason : null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--surface)", borderRadius: 20, padding: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Join Preach CRM</h1>
        {validation?.valid && validation.invite?.email ? (
          <p style={{ color: "var(--text-secondary)", marginBottom: 18 }}>Invited email: <strong>{validation.invite.email}</strong></p>
        ) : null}

        {invalidReason ? (
          <div style={{ padding: 12, borderRadius: 12, background: "var(--red-bg)", color: "var(--red)", fontSize: 14 }}>
            This invite is not valid ({invalidReason}).
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Username</label>
              <input value={username} onChange={(e) => setUsername(e.target.value)} required style={input} placeholder="your_username" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>PIN (4-6 digits)</label>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} required style={input} type="password" />
            </div>
            {error && <div style={{ color: "var(--red)", marginBottom: 10, fontSize: 14 }}>{error}</div>}
            <button type="submit" disabled={loading || !validation?.valid} style={{ width: "100%", padding: "12px 14px", border: "none", borderRadius: 12, background: "var(--accent)", color: "#fff", fontWeight: 700 }}>
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const label: React.CSSProperties = { display: "block", fontSize: 13, marginBottom: 6, color: "var(--text-secondary)" };
const input: React.CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", fontSize: 14, background: "var(--bg)", color: "var(--text)" };
