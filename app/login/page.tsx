"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Look up the chatter by username
      const { data: chatter, error: lookupError } = await supabase
        .from("crm_chatters")
        .select("*")
        .eq("username", username)
        .single();

      if (lookupError || !chatter) {
        throw new Error("Invalid username or PIN");
      }

      // 2. Verify PIN
      // TODO: PIN verification should happen server-side in an edge function.
      // For now we hash client-side and compare. This is NOT secure for production.
      const encoder = new TextEncoder();
      const data = encoder.encode(pin);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const pinHash = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (pinHash !== chatter.pin_hash) {
        throw new Error("Invalid username or PIN");
      }

      // 3. Create a session
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

      // 4. Store token and user data
      localStorage.setItem("crm_token", sessionToken);
      localStorage.setItem(
        "crm_user",
        JSON.stringify({
          id: chatter.id,
          name: chatter.name,
          username: chatter.username,
          role: chatter.role,
          avatarEmoji: chatter.avatar_emoji,
          profilePictureUrl: chatter.profile_picture_url,
          assignedCreators: chatter.assigned_creators,
        })
      );

      // 5. Role-based redirect
      router.push(
        chatter.role === "marketing_manager"
          ? "/manager-dashboard"
          : "/dashboard"
      );
    } catch (err: any) {
      setError(err.message || "Login failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--mc-bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          padding: "24px",
        }}
      >
        <div
          style={{
            background: "var(--mc-surface)",
            borderRadius: "24px",
            padding: "40px 32px",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.05)",
          }}
        >
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "32px" }}>
            <h1
              style={{
                fontSize: "28px",
                fontWeight: "700",
                color: "var(--mc-text)",
                marginBottom: "8px",
              }}
            >
              Preach Agency
            </h1>
            <p
              style={{
                fontSize: "16px",
                color: "var(--mc-text-secondary)",
              }}
            >
              CRM Login
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="username"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "var(--mc-text)",
                  marginBottom: "8px",
                }}
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "15px",
                  border: "1px solid var(--mc-border)",
                  borderRadius: "12px",
                  background: "var(--mc-bg)",
                  color: "var(--mc-text)",
                  outline: "none",
                }}
                placeholder="Enter your username"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                htmlFor="pin"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "var(--mc-text)",
                  marginBottom: "8px",
                }}
              >
                PIN
              </label>
              <input
                id="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "15px",
                  border: "1px solid var(--mc-border)",
                  borderRadius: "12px",
                  background: "var(--mc-bg)",
                  color: "var(--mc-text)",
                  outline: "none",
                }}
                placeholder="Enter your PIN"
              />
            </div>

            {error && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "#2e1a1a",
                  color: "var(--mc-red)",
                  borderRadius: "12px",
                  fontSize: "14px",
                  marginBottom: "20px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: "14px",
                fontSize: "16px",
                fontWeight: "600",
                color: "#1a1a1a",
                background: loading
                  ? "var(--mc-text-muted)"
                  : "var(--mc-accent)",
                border: "none",
                borderRadius: "12px",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
