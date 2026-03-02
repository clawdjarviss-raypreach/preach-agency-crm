"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

export default function SubmitReportPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [creatorSales, setCreatorSales] = useState<Record<string, string>>({});
  const [busynessRating, setBusynessRating] = useState(5);
  const [spenderCount, setSpenderCount] = useState("");
  const [warmedUpSubs, setWarmedUpSubs] = useState("");
  const [warmedUpSubNames, setWarmedUpSubNames] = useState("");
  const [sellingChatsFromMM, setSellingChatsFromMM] = useState("");
  const [whatWentWell, setWhatWentWell] = useState("");
  const [whatDidntGoWell, setWhatDidntGoWell] = useState("");
  const [needHelpWith, setNeedHelpWith] = useState("");
  const [contentFeedback, setContentFeedback] = useState("");

  // Creators state
  const [creators, setCreators] = useState<any[] | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    if (!token) return;
    const fetchCreators = async () => {
      const { data } = await supabase
        .from("crm_creators")
        .select("*")
        .eq("status", "active");
      setCreators(data || []);
    };
    fetchCreators();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !creators || !user) return;
    setError("");
    setSubmitting(true);

    try {
      const sales = creators
        .filter((c) => creatorSales[c.id] && parseFloat(creatorSales[c.id]) > 0)
        .map((c) => ({
          creatorId: c.id,
          amount: parseFloat(creatorSales[c.id]) || 0,
        }));

      const totalSalesAmount = sales.reduce((sum, s) => sum + s.amount, 0);

      const { error: insertError } = await supabase
        .from("crm_sales_reports")
        .insert({
          chatter_id: user.id,
          date,
          sales,
          total_sales: totalSalesAmount,
          busyness_rating: busynessRating,
          spender_count: parseInt(spenderCount) || 0,
          warmed_up_subs: parseInt(warmedUpSubs) || 0,
          warmed_up_sub_names: warmedUpSubNames || null,
          selling_chats_from_mm: sellingChatsFromMM ? parseInt(sellingChatsFromMM) : null,
          what_went_well: whatWentWell || null,
          what_didnt_go_well: whatDidntGoWell || null,
          need_help_with: needHelpWith || null,
          content_feedback: contentFeedback || null,
        });

      if (insertError) throw insertError;

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || "Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSales = Object.values(creatorSales).reduce(
    (sum, val) => sum + (parseFloat(val) || 0),
    0
  );

  if (submitted) {
    return (
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "24px",
            padding: "48px 32px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: "64px", marginBottom: "16px" }}>✅</div>
          <h2 style={{ fontSize: "24px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" }}>
            Report Submitted!
          </h2>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginBottom: "8px" }}>
            Total sales: <strong style={{ color: "var(--accent)" }}>
              ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </p>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "32px" }}>
            {date}
          </p>
          <Link
            href="/dashboard"
            style={{
              display: "inline-block",
              padding: "14px 32px",
              fontSize: "15px",
              fontWeight: "600",
              color: "#ffffff",
              background: "var(--accent)",
              borderRadius: "14px",
            }}
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    fontSize: "16px",
    border: "2px solid var(--border)",
    borderRadius: "12px",
    background: "var(--bg)",
    color: "var(--text)",
    outline: "none",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "14px",
    fontWeight: "600",
    color: "var(--text-secondary)",
    marginBottom: "8px",
  };

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    minHeight: "80px",
    resize: "vertical" as const,
  };

  return (
    <div style={{ maxWidth: "700px" }}>
      <div style={{ marginBottom: "28px" }}>
        <Link
          href="/reports"
          style={{ fontSize: "14px", color: "var(--text-muted)", marginBottom: "8px", display: "inline-block" }}
        >
          ← Back to Reports
        </Link>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>
          📝 Submit Sales Report
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Date */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "20px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <label style={labelStyle}>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        {/* Per-Creator Sales */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "20px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            💰 Sales per Creator
          </h3>

          {!creators ? (
            <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>Loading creators...</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {creators.map((creator) => (
                <div key={creator.id} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "16px",
                      fontWeight: "700",
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {creator.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                      {creator.name}
                    </div>
                  </div>
                  <div style={{ position: "relative", width: "130px" }}>
                    <span
                      style={{
                        position: "absolute",
                        left: "12px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                        fontSize: "16px",
                        fontWeight: "600",
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={creatorSales[creator.id] || ""}
                      onChange={(e) =>
                        setCreatorSales((prev) => ({
                          ...prev,
                          [creator.id]: e.target.value,
                        }))
                      }
                      style={{
                        ...inputStyle,
                        paddingLeft: "28px",
                        textAlign: "right",
                      }}
                    />
                  </div>
                </div>
              ))}

              {/* Total */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "var(--bg)",
                  borderRadius: "12px",
                  marginTop: "4px",
                }}
              >
                <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)" }}>Total</span>
                <span style={{ fontSize: "22px", fontWeight: "700", color: "var(--accent)" }}>
                  ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Busyness Rating */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "20px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <label style={labelStyle}>Busyness Rating</label>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBusynessRating(n)}
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "12px",
                  border: "2px solid",
                  borderColor: busynessRating === n ? "var(--accent)" : "var(--border)",
                  background: busynessRating === n ? "var(--accent)" : "var(--bg)",
                  color: busynessRating === n ? "#ffffff" : "var(--text)",
                  fontSize: "16px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Metrics */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "20px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            📊 Metrics
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label style={labelStyle}>Spender Count</label>
              <input
                type="number"
                min="0"
                value={spenderCount}
                onChange={(e) => setSpenderCount(e.target.value)}
                placeholder="0"
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>Warmed-up Subs</label>
              <input
                type="number"
                min="0"
                value={warmedUpSubs}
                onChange={(e) => setWarmedUpSubs(e.target.value)}
                placeholder="0"
                style={inputStyle}
                required
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Warmed-up Sub Names</label>
              <input
                type="text"
                value={warmedUpSubNames}
                onChange={(e) => setWarmedUpSubNames(e.target.value)}
                placeholder="Comma-separated names"
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Selling Chats from MM</label>
              <input
                type="number"
                min="0"
                value={sellingChatsFromMM}
                onChange={(e) => setSellingChatsFromMM(e.target.value)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Feedback */}
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "20px",
            padding: "24px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "16px" }}>
            💬 Feedback
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ ...labelStyle, color: "var(--green)" }}>✅ What went well</label>
              <textarea
                value={whatWentWell}
                onChange={(e) => setWhatWentWell(e.target.value)}
                placeholder="Describe what went well today..."
                style={textareaStyle}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, color: "var(--red)" }}>❌ What didn&apos;t go well</label>
              <textarea
                value={whatDidntGoWell}
                onChange={(e) => setWhatDidntGoWell(e.target.value)}
                placeholder="Any challenges or issues..."
                style={textareaStyle}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, color: "var(--orange)" }}>🆘 Need help with</label>
              <textarea
                value={needHelpWith}
                onChange={(e) => setNeedHelpWith(e.target.value)}
                placeholder="Anything you need help with..."
                style={textareaStyle}
              />
            </div>
            <div>
              <label style={{ ...labelStyle, color: "var(--accent)" }}>💡 Content Feedback / Requests</label>
              <textarea
                value={contentFeedback}
                onChange={(e) => setContentFeedback(e.target.value)}
                placeholder="Content ideas, feedback, requests..."
                style={textareaStyle}
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              padding: "14px 18px",
              fontSize: "14px",
              color: "var(--red)",
              background: "var(--red-bg)",
              borderRadius: "12px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          style={{
            width: "100%",
            padding: "18px",
            fontSize: "16px",
            fontWeight: "700",
            color: "#ffffff",
            background: submitting ? "var(--text-muted)" : "var(--accent)",
            border: "none",
            borderRadius: "14px",
            cursor: submitting ? "not-allowed" : "pointer",
            transition: "all 0.2s",
            marginBottom: "40px",
          }}
        >
          {submitting ? "Submitting..." : `Submit Report — $${totalSales.toFixed(2)}`}
        </button>
      </form>
    </div>
  );
}
