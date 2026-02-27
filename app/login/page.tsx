"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  const login = useMutation(api.crm.auth.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login({ username, pin });
      
      // Store token and user data
      localStorage.setItem("crm_token", result.token);
      localStorage.setItem("crm_user", JSON.stringify({
        _id: result.chatter.id,
        name: result.chatter.name,
        username: result.chatter.username,
        role: result.chatter.role,
        avatarEmoji: result.chatter.avatarEmoji,
        profilePictureUrl: result.chatter.profilePictureUrl,
        assignedCreators: result.chatter.assignedCreators,
      }));
      
      // Role-based redirect
      router.push(result.chatter.role === "marketing_manager" ? "/manager-dashboard" : "/dashboard");
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
