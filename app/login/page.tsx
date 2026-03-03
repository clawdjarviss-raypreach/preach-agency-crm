"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface CrmUser {
  id: string;
  name: string;
  username: string;
  role: string;
  avatarEmoji?: string;
  profilePictureUrl?: string;
  assignedCreators: string[];
}

function getLoginErrorMessage(message?: string) {
  const normalized = (message || "").toLowerCase();

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("email not confirmed") ||
    normalized.includes("invalid")
  ) {
    return "Invalid email or password.";
  }

  if (normalized.includes("too many requests")) {
    return "Too many login attempts. Please wait a minute and try again.";
  }

  return "Login failed. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !signInData.session?.user?.id) {
        throw new Error(getLoginErrorMessage(signInError?.message));
      }

      const authUserId = signInData.session.user.id;
      const { data: chatter, error: chatterError } = await supabase
        .from("crm_chatters")
        .select("id,name,username,role,avatar_emoji,profile_picture_url,assigned_creators")
        .eq("supabase_auth_id", authUserId)
        .maybeSingle();

      if (chatterError || !chatter) {
        throw new Error("Your account is not linked to a CRM user yet. Please contact an admin.");
      }

      const crmUser: CrmUser = {
        id: chatter.id,
        name: chatter.name,
        username: chatter.username,
        role: chatter.role,
        avatarEmoji: chatter.avatar_emoji,
        profilePictureUrl: chatter.profile_picture_url,
        assignedCreators: chatter.assigned_creators ?? [],
      };

      localStorage.setItem("crm_token", signInData.session.access_token);
      localStorage.setItem("crm_user", JSON.stringify(crmUser));

      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "Login failed. Please try again.");
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

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "20px" }}>
              <label
                htmlFor="email"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "var(--mc-text)",
                  marginBottom: "8px",
                }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
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
                placeholder="you@company.com"
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label
                htmlFor="password"
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "500",
                  color: "var(--mc-text)",
                  marginBottom: "8px",
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
                placeholder="Enter your password"
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
                background: loading ? "var(--mc-text-muted)" : "var(--mc-accent)",
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
