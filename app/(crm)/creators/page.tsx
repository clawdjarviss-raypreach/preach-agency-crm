"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useEffect } from "react";

export default function CreatorsPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const userToken = localStorage.getItem("crm_token");
    if (userToken) setToken(userToken);
  }, []);

  const allCreators = useQuery(
    api.crm.creators.list,
    token ? { token } : "skip"
  );

  // Only show creators with OF API accounts
  const creators = allCreators?.filter((c: any) => !!c.accountId);

  const activeShifts = useQuery(
    api.crm.shifts.getAllActive,
    token ? { token } : "skip"
  );

  const getActiveChatterCount = (creatorId: string) => {
    if (!activeShifts) return 0;
    return activeShifts.filter((s: any) => s.creatorId === creatorId).length;
  };

  const formatExpiry = (expiry: string) => {
    const date = new Date(expiry);
    const now = new Date();
    const daysLeft = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { text: "Expired", color: "var(--red)" };
    if (daysLeft < 7) return { text: `${daysLeft}d left`, color: "var(--orange)" };
    return { text: date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), color: "var(--text-secondary)" };
  };

  return (
    <div style={{ maxWidth: "1200px" }}>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "32px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" }}>
          👥 Creators
        </h1>
        <p style={{ fontSize: "16px", color: "var(--text-secondary)" }}>
          {creators ? `${creators.length} active creators` : "Loading..."}
        </p>
      </div>

      {!creators ? (
        <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>Loading creators...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "24px" }}>
          {creators.map((creator: any) => {
            const activeChatters = getActiveChatterCount(creator.id);
            const expiry = creator.subscriptionExpiry ? formatExpiry(creator.subscriptionExpiry) : null;

            return (
              <div
                key={creator.id}
                style={{
                  background: "var(--surface)",
                  borderRadius: "24px",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
              >
                {/* Header with avatar */}
                <div style={{ padding: "24px 24px 16px", display: "flex", alignItems: "center", gap: "16px" }}>
                  {creator.avatarUrl ? (
                    <img
                      src={creator.avatarUrl}
                      alt={creator.name}
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "16px",
                        objectFit: "cover",
                        border: "2px solid var(--border)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "16px",
                        background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "28px",
                        fontWeight: "700",
                        color: "#ffffff",
                      }}
                    >
                      {creator.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "2px" }}>
                      {creator.name}
                    </h3>
                    <a
                      href={`https://onlyfans.com/${creator.onlyFansHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: "14px", color: "var(--accent)", fontWeight: "500", textDecoration: "none" }}
                    >
                      @{creator.onlyFansHandle}
                    </a>
                  </div>

                  {/* Status dot */}
                  <div
                    style={{
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: creator.status === "active" ? "var(--green)" : "var(--text-muted)",
                      background: creator.status === "active" ? "var(--green-bg)" : "var(--border-subtle)",
                      borderRadius: "8px",
                      textTransform: "capitalize",
                    }}
                  >
                    {creator.status}
                  </div>
                </div>

                {/* Stats row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "1px",
                    background: "var(--border-subtle)",
                    margin: "0 24px",
                    borderRadius: "12px",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ background: "var(--bg)", padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Sub Price
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
                      ${creator.subscribePrice ?? "—"}
                    </div>
                  </div>

                  <div style={{ background: "var(--bg)", padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      Active Now
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: activeChatters > 0 ? "var(--green)" : "var(--text-muted)" }}>
                      {activeChatters} 💬
                    </div>
                  </div>

                  <div style={{ background: "var(--bg)", padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      OM ID
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--text)" }}>
                      {creator.onlyMonsterId ?? "—"}
                    </div>
                  </div>
                </div>

                {/* Subscription expiry */}
                {expiry && (
                  <div style={{ padding: "12px 24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>OF Subscription</span>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: expiry.color }}>
                      {expiry.text}
                    </span>
                  </div>
                )}

                {!expiry && <div style={{ height: "16px" }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
