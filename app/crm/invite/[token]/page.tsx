"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function InviteSignupPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = useMemo(() => params.token ?? "", [params.token]);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Invite validation state
  const [validation, setValidation] = useState<{
    valid: boolean;
    reason?: string;
    invite?: { email?: string };
  } | null>(null);

  // Validate invite token on mount
  useEffect(() => {
    if (!token) return;

    (async () => {
      const { data: invite, error: fetchError } = await supabase
        .from("crm_invite_tokens")
        .select("*")
        .eq("token", token)
        .eq("status", "active")
        .single();

      if (fetchError || !invite) {
        setValidation({ valid: false, reason: "expired or invalid" });
        return;
      }

      // Check expiration
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        setValidation({ valid: false, reason: "expired" });
        return;
      }

      setValidation({
        valid: true,
        invite: { email: invite.email },
      });
    })();
  }, [token]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);

      try {
        // TODO: This signup flow should be an edge function for atomicity.
        // For now, we do sequential inserts.

        // 1. Hash the PIN
        // TODO: PIN hashing should happen server-side in an edge function.
        // For now we store a simple hash client-side. This is NOT secure for production.
        const encoder = new TextEncoder();
        const data = encoder.encode(pin);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pinHash = hashArray
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // 2. Create the chatter
        const { data: chatter, error: chatterError } = await supabase
          .from("crm_chatters")
          .insert({
            username,
            name: username,
            pin_hash: pinHash,
            role: "chatter",
            status: "active",
            assigned_creators: [],
          })
          .select()
          .single();

        if (chatterError) {
          throw new Error(
            chatterError.message.includes("duplicate")
              ? "Username already taken"
              : chatterError.message
          );
        }

        // 3. Update the invite token
        await supabase
          .from("crm_invite_tokens")
          .update({
            status: "used",
            used_at: new Date().toISOString(),
            used_by: chatter.id,
          })
          .eq("token", token);

        // 4. Create a session
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const { data: session, error: sessionError } = await supabase
          .from("crm_sessions")
          .insert({
            chatter_id: chatter.id,
            token: sessionToken,
            expires_at: expiresAt.toISOString(),
          })
          .select()
          .single();

        if (sessionError) {
          throw new Error("Failed to create session");
        }

        // 5. Store locally and redirect
        localStorage.setItem("crm_token", sessionToken);
        localStorage.setItem(
          "crm_user",
          JSON.stringify({
            id: chatter.id,
            username,
            name: username,
            role: "chatter",
            assignedCreators: [],
          })
        );
        router.push("/dashboard");
      } catch (err: any) {
        setError(err.message || "Signup failed");
        setLoading(false);
      }
    },
    [token, username, pin, router]
  );

  const invalidReason =
    validation && !validation.valid ? validation.reason : null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          borderRadius: 20,
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
          Join Preach CRM
        </h1>
        {validation?.valid && validation.invite?.email ? (
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: 18,
            }}
          >
            Invited email: <strong>{validation.invite.email}</strong>
          </p>
        ) : null}

        {invalidReason ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: "var(--red-bg)",
              color: "var(--red)",
              fontSize: 14,
            }}
          >
            This invite is not valid ({invalidReason}).
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={input}
                placeholder="your_username"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={label}>PIN (4-6 digits)</label>
              <input
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                required
                style={input}
                type="password"
              />
            </div>
            {error && (
              <div
                style={{
                  color: "var(--red)",
                  marginBottom: 10,
                  fontSize: 14,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={loading || !validation?.valid}
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "none",
                borderRadius: 12,
                background: "var(--accent)",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  marginBottom: 6,
  color: "var(--text-secondary)",
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 14,
  background: "var(--bg)",
  color: "var(--text)",
};
