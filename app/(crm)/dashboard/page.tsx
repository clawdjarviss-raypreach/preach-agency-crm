"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import AdminRevenueDashboard from "./AdminRevenueDashboard";

function SupervisorDashboard({ user, token, now }: { user: any; token: string; now: number }) {
  const [activeShifts, setActiveShifts] = useState<any[] | null>(null);
  const [pendingRequests, setPendingRequests] = useState<any[] | null>(null);
  const [teamStats, setTeamStats] = useState<any[] | null>(null);
  const [weekSchedule, setWeekSchedule] = useState<any[] | null>(null);

  const today = new Date().toISOString().split("T")[0];
  const weekStart = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split("T")[0];
  })();
  const weekEnd = (() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + 7);
    return d.toISOString().split("T")[0];
  })();

  useEffect(() => {
    if (!token) return;

    async function fetchData() {
      // Active shifts with creator name
      const { data: shifts } = await supabase
        .from("crm_shifts")
        .select("*, creator:crm_creators(name)")
        .is("clock_out", null);
      setActiveShifts(shifts || []);

      // Pending day-off requests
      const { data: pending } = await supabase
        .from("crm_schedules")
        .select("*, chatter:crm_chatters(name, avatar_emoji)")
        .eq("status", "off_requested");
      setPendingRequests(
        (pending || []).map((r: any) => ({
          ...r,
          chatterName: r.chatter?.name || "Unknown",
          chatterEmoji: r.chatter?.avatar_emoji || "👤",
        }))
      );

      // Week schedule with chatter + creator info
      const { data: schedule } = await supabase
        .from("crm_schedules")
        .select("*, chatter:crm_chatters(name, avatar_emoji), creator:crm_creators(name)")
        .gte("date", weekStart)
        .lte("date", weekEnd);
      setWeekSchedule(
        (schedule || []).map((s: any) => ({
          ...s,
          chatterName: s.chatter?.name || "Unknown",
          chatterEmoji: s.chatter?.avatar_emoji || "👤",
          creatorName: s.creator?.name || null,
        }))
      );

      // TODO: Implement getSupervisorTeamStats aggregation from shifts + reports
      // Best effort: get chatters assigned to this supervisor's creators and their active shifts
      const { data: chatters } = await supabase
        .from("crm_chatters")
        .select("id, name, avatar_emoji, profile_picture_url");

      const chatterStats = (chatters || []).map((c: any) => {
        const activeShift = (shifts || []).find((s: any) => s.chatter_id === c.id);
        return {
          chatterId: c.id,
          chatterName: c.name,
          avatarEmoji: c.avatar_emoji,
          profilePictureUrl: c.profile_picture_url,
          activeShift: !!activeShift,
          todayWorkMinutes: 0, // TODO: aggregate from today's shifts
          pendingReports: false, // TODO: check pending reports
        };
      });
      setTeamStats(chatterStats);
    }

    fetchData();
  }, [token, weekStart, weekEnd]);

  return (
    <div style={{ maxWidth: "1000px" }}>
      {/* Welcome */}
      <div style={{ marginBottom: "28px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)", display: "flex", alignItems: "center", gap: "12px" }}>
          Team Dashboard
          {user.profilePictureUrl ? (
            <img src={user.profilePictureUrl} alt={user.name} style={{ width: "32px", height: "32px", borderRadius: "10px", objectFit: "cover" }} />
          ) : (
            <span>{user.avatarEmoji || "👋"}</span>
          )}
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Clock In/Out for themselves */}
      <ClockInOutCard user={user} token={token} now={now} compact={false} />

      {/* Team Status */}
      <div style={{
        background: "var(--surface)", borderRadius: "24px", padding: "28px",
        marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "20px" }}>
          👥 Team Status
        </h2>
        {!teamStats || teamStats.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
            No chatters assigned to your creators
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {teamStats.map((chatter: any) => (
              <div key={chatter.chatterId} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", background: "var(--bg)", borderRadius: "14px",
                flexWrap: "wrap", gap: "8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "20px" }}>👤</span>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                      {chatter.chatterName}
                    </div>
                    {chatter.todayWorkMinutes > 0 && (
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Work time: {Math.floor(chatter.todayWorkMinutes / 60)}h {chatter.todayWorkMinutes % 60}m
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {chatter.activeShift ? (
                    <span style={{
                      padding: "4px 10px", fontSize: "11px", fontWeight: "600",
                      background: "var(--green-bg)", color: "var(--green)", borderRadius: "8px",
                    }}>🟢 Working</span>
                  ) : (
                    <span style={{
                      padding: "4px 10px", fontSize: "11px", fontWeight: "600",
                      background: "var(--border-subtle)", color: "var(--text-muted)", borderRadius: "8px",
                    }}>⭕ Offline</span>
                  )}
                  {chatter.pendingReports && (
                    <span style={{
                      padding: "4px 10px", fontSize: "11px", fontWeight: "600",
                      background: "var(--orange-bg)", color: "var(--orange)", borderRadius: "8px",
                    }}>⚠️ Pending Report</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Day-Off Requests */}
      {pendingRequests && pendingRequests.length > 0 && (
        <div style={{
          background: "var(--surface)", borderRadius: "24px", padding: "28px",
          marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          border: "2px solid var(--orange)",
        }}>
          <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--orange)", marginBottom: "16px" }}>
            📋 Pending Requests ({pendingRequests.length})
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendingRequests.map((req: any) => (
              <div key={req.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", background: "var(--bg)", borderRadius: "12px",
                flexWrap: "wrap", gap: "8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>{req.chatterEmoji}</span>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                    {req.chatterName}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    — {new Date(req.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <Link href="/schedule" style={{
            display: "block", marginTop: "12px", textAlign: "center",
            fontSize: "13px", fontWeight: "600", color: "var(--accent)",
          }}>
            Review in Schedule →
          </Link>
        </div>
      )}

      {/* Quick Schedule Preview */}
      <div style={{
        background: "var(--surface)", borderRadius: "24px", padding: "28px",
        marginBottom: "24px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
            📆 This Week&apos;s Schedule
          </h2>
          <Link href="/schedule" style={{
            fontSize: "13px", fontWeight: "600", color: "var(--accent)",
          }}>View Full →</Link>
        </div>
        {!weekSchedule || weekSchedule.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
            No shifts scheduled this week
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {weekSchedule.slice(0, 8).map((entry: any) => (
              <div key={entry.id} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 14px", background: "var(--bg)", borderRadius: "12px",
                fontSize: "13px",
              }}>
                <span style={{ fontWeight: "600", color: "var(--text-secondary)", minWidth: "60px" }}>
                  {new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
                </span>
                <span>{entry.chatterEmoji}</span>
                <span style={{ fontWeight: "600", color: "var(--text)", flex: 1 }}>{entry.chatterName}</span>
                {entry.creatorName && (
                  <span style={{
                    padding: "2px 8px", fontSize: "11px", fontWeight: "500",
                    background: "var(--green-bg)", color: "var(--green)", borderRadius: "6px",
                  }}>{entry.creatorName}</span>
                )}
              </div>
            ))}
            {weekSchedule.length > 8 && (
              <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>
                +{weekSchedule.length - 8} more entries
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatterDashboard({ user, token, now }: { user: any; token: string; now: number }) {
  const [recentReports, setRecentReports] = useState<any[] | null>(null);

  useEffect(() => {
    if (!token || !user?.id) return;

    async function fetchReports() {
      const { data } = await supabase
        .from("crm_sales_reports")
        .select("*")
        .eq("chatter_id", user.id)
        .order("date", { ascending: false })
        .limit(5);

      setRecentReports(
        (data || []).map((r: any) => ({
          ...r,
          busynessRating: r.busyness_rating,
          spenderCount: r.spender_count,
          totalSales: r.total_sales,
        }))
      );
    }

    fetchReports();
  }, [token, user?.id]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return { color: "var(--orange)", bg: "var(--orange-bg)", label: "Submitted" };
      case "reviewed":
        return { color: "var(--green)", bg: "var(--green-bg)", label: "Reviewed" };
      case "flagged":
        return { color: "var(--red)", bg: "var(--red-bg)", label: "Flagged" };
      default:
        return { color: "var(--text-muted)", bg: "var(--border-subtle)", label: status };
    }
  };

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Welcome */}
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)", display: "flex", alignItems: "center", gap: "12px" }}>
          Welcome, {user.name}!
          {user.profilePictureUrl ? (
            <img src={user.profilePictureUrl} alt={user.name} style={{ width: "32px", height: "32px", borderRadius: "10px", objectFit: "cover" }} />
          ) : (
            <span>{user.avatarEmoji || "👋"}</span>
          )}
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
        {user.assignedCreators && user.assignedCreators.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Your creators:</span>
            {user.assignedCreators.map((name: string) => (
              <span key={name} style={{
                padding: "3px 10px", fontSize: "12px", fontWeight: "500",
                background: "var(--surface)", color: "var(--accent)",
                borderRadius: "8px", border: "1px solid var(--border)",
              }}>
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Clock In/Out Card - Primary */}
      <ClockInOutCard user={user} token={token} now={now} compact={false} />

      {/* Quick Actions */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}>
        <Link href="/reports/submit" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          padding: "20px", background: "var(--accent)", color: "#1a1a1a",
          borderRadius: "16px", fontSize: "16px", fontWeight: "600",
          transition: "all 0.2s", textAlign: "center",
        }}>
          📝 Submit Report
        </Link>
        <Link href="/reports" style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: "10px",
          padding: "20px", background: "var(--surface)", color: "var(--text)",
          borderRadius: "16px", fontSize: "16px", fontWeight: "600",
          border: "2px solid var(--border)", transition: "all 0.2s", textAlign: "center",
        }}>
          📋 View Reports
        </Link>
      </div>

      {/* Recent Reports */}
      <div style={{
        background: "var(--surface)", borderRadius: "24px", padding: "28px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "20px" }}>
          📋 Recent Reports
        </h2>
        {!recentReports || recentReports.length === 0 ? (
          <p style={{ fontSize: "14px", color: "var(--text-muted)", textAlign: "center", padding: "24px 0" }}>
            No reports yet. Submit your first report!
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {recentReports.map((report) => {
              const badge = getStatusBadge(report.status);
              return (
                <div key={report.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px", background: "var(--bg)", borderRadius: "14px",
                  flexWrap: "wrap", gap: "8px",
                }}>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                      {new Date(report.date + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short", month: "short", day: "numeric",
                      })}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Busyness: {report.busynessRating}/10 • {report.spenderCount} spenders
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--accent)" }}>
                      ${report.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div style={{
                      padding: "4px 10px", fontSize: "11px", fontWeight: "600",
                      color: badge.color, background: badge.bg, borderRadius: "8px",
                      textTransform: "uppercase",
                    }}>
                      {badge.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared Clock In/Out Card Component ──

function ClockInOutCard({ user, token, now, compact }: { user: any; token: string; now: number; compact: boolean }) {
  const [selectedCreator, setSelectedCreator] = useState<string>("");
  const [clockingIn, setClockingIn] = useState(false);
  const [clockingOut, setClockingOut] = useState(false);
  const [togglingBreak, setTogglingBreak] = useState(false);
  const [activeShift, setActiveShift] = useState<any>(null);
  const [creators, setCreators] = useState<any[] | null>(null);

  useEffect(() => {
    if (!token || !user?.id) return;

    async function fetchData() {
      // Fetch active shift for current user
      const { data: shifts } = await supabase
        .from("crm_shifts")
        .select("*, creator:crm_creators(name)")
        .eq("chatter_id", user.id)
        .is("clock_out", null)
        .limit(1);

      if (shifts && shifts.length > 0) {
        const shift = shifts[0];
        const breaks = shift.breaks || [];
        const onBreak = breaks.length > 0 && !breaks[breaks.length - 1].end;
        const currentBreakStart = onBreak ? new Date(breaks[breaks.length - 1].start).getTime() : null;

        setActiveShift({
          ...shift,
          clockIn: new Date(shift.clock_in).getTime(),
          creatorName: shift.creator?.name || "Unknown",
          onBreak,
          currentBreakStart,
          totalBreakMinutes: shift.total_break_minutes || 0,
        });
      } else {
        setActiveShift(null);
      }

      // Fetch creators list
      const { data: creatorsList } = await supabase.from("crm_creators").select("id, name");
      setCreators(creatorsList || []);
    }

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [token, user?.id]);

  const handleClockIn = async () => {
    if (!selectedCreator || !token) return;
    setClockingIn(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const { error } = await supabase.from("crm_shifts").insert({
        chatter_id: user.id,
        creator_id: selectedCreator,
        clock_in: new Date().toISOString(),
        date: today,
      });
      if (error) throw new Error(error.message);
      // Refresh shift data
      const { data: shifts } = await supabase
        .from("crm_shifts")
        .select("*, creator:crm_creators(name)")
        .eq("chatter_id", user.id)
        .is("clock_out", null)
        .limit(1);
      if (shifts && shifts.length > 0) {
        const shift = shifts[0];
        setActiveShift({
          ...shift,
          clockIn: new Date(shift.clock_in).getTime(),
          creatorName: shift.creator?.name || "Unknown",
          onBreak: false,
          currentBreakStart: null,
          totalBreakMinutes: 0,
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to clock in");
    } finally {
      setClockingIn(false);
    }
  };

  const handleClockOut = async () => {
    if (!token || !activeShift) return;
    setClockingOut(true);
    try {
      const { error } = await supabase
        .from("crm_shifts")
        .update({ clock_out: new Date().toISOString() })
        .eq("id", activeShift.id);
      if (error) throw new Error(error.message);
      setActiveShift(null);
    } catch (err: any) {
      alert(err.message || "Failed to clock out");
    } finally {
      setClockingOut(false);
    }
  };

  const handleToggleBreak = async () => {
    if (!token || !activeShift) return;
    setTogglingBreak(true);
    try {
      const breaks = activeShift.breaks || [];
      if (activeShift.onBreak) {
        // End break
        const lastBreak = breaks[breaks.length - 1];
        lastBreak.end = new Date().toISOString();
        const breakMinutes = Math.floor((new Date(lastBreak.end).getTime() - new Date(lastBreak.start).getTime()) / 60000);
        const { error } = await supabase
          .from("crm_shifts")
          .update({
            breaks,
            total_break_minutes: (activeShift.totalBreakMinutes || 0) + breakMinutes,
          })
          .eq("id", activeShift.id);
        if (error) throw new Error(error.message);
        setActiveShift({
          ...activeShift,
          breaks,
          onBreak: false,
          currentBreakStart: null,
          totalBreakMinutes: (activeShift.totalBreakMinutes || 0) + breakMinutes,
        });
      } else {
        // Start break
        breaks.push({ start: new Date().toISOString() });
        const { error } = await supabase
          .from("crm_shifts")
          .update({ breaks })
          .eq("id", activeShift.id);
        if (error) throw new Error(error.message);
        setActiveShift({
          ...activeShift,
          breaks,
          onBreak: true,
          currentBreakStart: Date.now(),
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to toggle break");
    } finally {
      setTogglingBreak(false);
    }
  };

  const formatElapsed = (clockInTime: number) => {
    const elapsed = Math.max(0, Math.floor((now - clockInTime) / 1000));
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const getNetWorkMinutes = () => {
    if (!activeShift) return 0;
    const totalElapsed = Math.floor((now - activeShift.clockIn) / (1000 * 60));
    const breakMins = activeShift.totalBreakMinutes || 0;
    const currentBreakMins = activeShift.onBreak && activeShift.currentBreakStart
      ? Math.floor((now - activeShift.currentBreakStart) / (1000 * 60))
      : 0;
    return Math.max(0, totalElapsed - breakMins - currentBreakMins);
  };

  return (
    <div style={{
      background: "var(--surface)",
      borderRadius: "24px",
      padding: compact ? "20px" : "28px",
      marginBottom: "24px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      border: activeShift ? "2px solid var(--green)" : "2px solid var(--border)",
    }}>
      <h2 style={{ fontSize: compact ? "16px" : "18px", fontWeight: "600", color: "var(--text)", marginBottom: compact ? "14px" : "20px" }}>
        ⏰ Shift Status
      </h2>

      {activeShift ? (
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap",
          }}>
            <div style={{
              padding: "6px 14px",
              background: activeShift.onBreak ? "var(--orange-bg)" : "var(--green-bg)",
              color: activeShift.onBreak ? "var(--orange)" : "var(--green)",
              borderRadius: "10px", fontSize: "13px", fontWeight: "600",
            }}>
              {activeShift.onBreak ? "☕ On Break" : "🟢 Clocked In"}
            </div>
            <span style={{ fontSize: "15px", color: "var(--text-secondary)" }}>
              Working on <strong style={{ color: "var(--text)" }}>{activeShift.creatorName}</strong>
            </span>
          </div>

          <div style={{
            fontSize: compact ? "36px" : "48px",
            fontWeight: "700",
            color: activeShift.onBreak ? "var(--orange)" : "var(--text)",
            fontVariantNumeric: "tabular-nums",
            marginBottom: "4px",
            letterSpacing: "-1px",
          }}>
            {activeShift.onBreak && activeShift.currentBreakStart
              ? formatElapsed(activeShift.currentBreakStart)
              : formatElapsed(activeShift.clockIn)}
          </div>

          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Total: {formatElapsed(activeShift.clockIn)}
            </div>
            {((activeShift.totalBreakMinutes || 0) > 0 || activeShift.onBreak) && (
              <div style={{ fontSize: "13px", color: "var(--orange)" }}>
                Breaks: {formatMinutes(
                  (activeShift.totalBreakMinutes || 0) +
                  (activeShift.onBreak && activeShift.currentBreakStart
                    ? Math.floor((now - activeShift.currentBreakStart) / (1000 * 60))
                    : 0)
                )}
              </div>
            )}
            <div style={{ fontSize: "13px", color: "var(--green)" }}>
              Net work: {formatMinutes(getNetWorkMinutes())}
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button onClick={handleToggleBreak} disabled={togglingBreak} style={{
              flex: 1, padding: compact ? "12px" : "16px",
              fontSize: compact ? "14px" : "16px", fontWeight: "700", color: "#ffffff",
              background: togglingBreak ? "var(--text-muted)" : activeShift.onBreak ? "var(--green)" : "var(--orange)",
              border: "none", borderRadius: "14px",
              cursor: togglingBreak ? "not-allowed" : "pointer", transition: "all 0.2s",
            }}>
              {togglingBreak ? "..." : activeShift.onBreak ? "▶️ End Break" : "☕ Take Break"}
            </button>
            <button onClick={handleClockOut} disabled={clockingOut || activeShift.onBreak} style={{
              flex: 1, padding: compact ? "12px" : "16px",
              fontSize: compact ? "14px" : "16px", fontWeight: "700", color: "#ffffff",
              background: clockingOut || activeShift.onBreak ? "var(--text-muted)" : "var(--red)",
              border: "none", borderRadius: "14px",
              cursor: clockingOut || activeShift.onBreak ? "not-allowed" : "pointer", transition: "all 0.2s",
            }}>
              {clockingOut ? "Clocking out..." : "🔴 Clock Out"}
            </button>
          </div>
          {activeShift.onBreak && (
            <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", marginTop: "8px" }}>
              End your break before clocking out
            </p>
          )}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{
              display: "block", fontSize: "14px", fontWeight: "600",
              color: "var(--text-secondary)", marginBottom: "8px",
            }}>
              Select Creator
            </label>
            <select value={selectedCreator} onChange={(e) => setSelectedCreator(e.target.value)} style={{
              width: "100%", padding: "14px 16px", fontSize: "16px",
              border: "2px solid var(--border)", borderRadius: "14px",
              background: "var(--bg)", color: "var(--text)", outline: "none",
              cursor: "pointer", appearance: "none",
            }}>
              <option value="">Choose a creator...</option>
              {creators?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button onClick={handleClockIn} disabled={clockingIn || !selectedCreator} style={{
            width: "100%", padding: compact ? "12px" : "16px",
            fontSize: compact ? "14px" : "16px", fontWeight: "700", color: "#ffffff",
            background: clockingIn || !selectedCreator ? "var(--text-muted)" : "var(--green)",
            border: "none", borderRadius: "14px",
            cursor: clockingIn || !selectedCreator ? "not-allowed" : "pointer", transition: "all 0.2s",
          }}>
            {clockingIn ? "Clocking in..." : "🟢 Clock In"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard Page ──

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string>("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!user) return null;

  const role = user.role;

  if (role === "admin" || role === "manager") {
    return <AdminRevenueDashboard user={user} token={token} />;
  }

  if (role === "supervisor") {
    return <SupervisorDashboard user={user} token={token} now={now} />;
  }

  // Default: chatter view
  return <ChatterDashboard user={user} token={token} now={now} />;
}
