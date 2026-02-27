"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

const SHIFT_TYPES = [
  { value: "morning", label: "Morning", time: "06:00–14:00", emoji: "🌅", color: "#f59e0b" },
  { value: "afternoon", label: "Afternoon", time: "14:00–22:00", emoji: "☀️", color: "#22c55e" },
  { value: "night", label: "Night", time: "22:00–06:00", emoji: "🌙", color: "#8b5cf6" },
  { value: "full", label: "Full Day", time: "24h", emoji: "📅", color: "var(--accent)" },
] as const;

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  scheduled: { color: "var(--accent)", bg: "rgba(196,149,106,0.1)", label: "Scheduled" },
  confirmed: { color: "var(--green)", bg: "var(--green-bg)", label: "Confirmed" },
  off_requested: { color: "var(--orange)", bg: "var(--orange-bg)", label: "Off Requested" },
  off_approved: { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", label: "Day Off ✓" },
  off_denied: { color: "var(--red)", bg: "var(--red-bg)", label: "Off Denied" },
};

// ── Date Helpers ──

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function get2WeekDates(startDate: Date): string[] {
  const monday = getMondayOfWeek(startDate);
  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function getWeekDates(startDate: Date): string[] {
  const monday = getMondayOfWeek(startDate);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return {
    day: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.getDate(),
    month: d.toLocaleDateString("en-US", { month: "short" }),
  };
}

function getMonthDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  return cells;
}

function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  while (current <= last) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// ── Mini Calendar Component ──

function MiniCalendar({ selectedDate, onSelectDate }: {
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  const monthDays = useMemo(() => getMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = new Date().toISOString().split("T")[0];
  const selectedStr = selectedDate.toISOString().split("T")[0];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ background: "var(--surface)", borderRadius: "16px", padding: "16px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
      {/* Month Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <button onClick={prevMonth} style={miniNavBtn}>‹</button>
        <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>{monthLabel}</span>
        <button onClick={nextMonth} style={miniNavBtn}>›</button>
      </div>

      {/* Day Headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: "10px", fontWeight: "600", color: "var(--text-muted)", padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Days */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {monthDays.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedStr;

          return (
            <button
              key={i}
              onClick={() => onSelectDate(new Date(dateStr + "T12:00:00"))}
              style={{
                width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "12px", fontWeight: isToday || isSelected ? "700" : "400",
                color: isSelected ? "#fff" : isToday ? "var(--accent)" : "var(--text)",
                background: isSelected ? "var(--accent)" : isToday ? "rgba(196,149,106,0.15)" : "transparent",
                border: "none", borderRadius: "8px", cursor: "pointer",
                transition: "all 0.1s", margin: "0 auto",
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Quick Presets Component ──

function QuickPresets({ onSelect }: { onSelect: (d: Date) => void }) {
  const now = new Date();
  const presets = [
    { label: "Today", action: () => onSelect(new Date()) },
    { label: "This Week", action: () => onSelect(getMondayOfWeek(new Date())) },
    { label: "Last Week", action: () => { const d = new Date(); d.setDate(d.getDate() - 7); onSelect(getMondayOfWeek(d)); } },
    { label: "Next Week", action: () => { const d = new Date(); d.setDate(d.getDate() + 7); onSelect(getMondayOfWeek(d)); } },
  ];

  return (
    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
      {presets.map((p) => (
        <button key={p.label} onClick={p.action} style={{
          padding: "6px 12px", fontSize: "12px", fontWeight: "600",
          color: "var(--text-secondary)", background: "var(--bg)",
          border: "1px solid var(--border)", borderRadius: "8px",
          cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
        }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── Bulk Add Modal ──

function BulkAddModal({
  token, chatters, creators, onClose,
}: {
  token: string;
  chatters: any[];
  creators: any[];
  onClose: () => void;
}) {
  const [selectedChatters, setSelectedChatters] = useState<Record<string, boolean>>({});
  const [creatorId, setCreatorId] = useState("");
  const [shiftType, setShiftType] = useState<string>("morning");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().split("T")[0];
  });
  const [ongoing, setOngoing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"form" | "preview">("form");

  const createSchedule = useMutation(api.crm.schedule.create);

  const selectedChatterList = useMemo(() => {
    return chatters.filter((c: any) => selectedChatters[c.id]);
  }, [chatters, selectedChatters]);

  const effectiveEndDate = useMemo(() => {
    if (ongoing) {
      // 3 months ahead
      const d = new Date(startDate + "T12:00:00");
      d.setMonth(d.getMonth() + 3);
      return d.toISOString().split("T")[0];
    }
    return endDate;
  }, [startDate, endDate, ongoing]);

  const dates = useMemo(() => {
    if (!startDate || !effectiveEndDate || startDate > effectiveEndDate) return [];
    return datesBetween(startDate, effectiveEndDate);
  }, [startDate, effectiveEndDate]);

  const totalShifts = selectedChatterList.length * dates.length;

  const selectedCreatorName = creators.find((c: any) => c.id === creatorId)?.name || "No specific creator";

  const handleCreate = async () => {
    setSaving(true);
    setError("");
    try {
      for (const chatter of selectedChatterList) {
        for (const date of dates) {
          await createSchedule({
            token,
            chatterId: chatter.id as any,
            date,
            shiftType: shiftType as any,
            creatorId: creatorId ? (creatorId as any) : undefined,
          });
        }
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create shifts");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...modalStyle, maxWidth: "560px" }}>
        <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" }}>
          📋 Bulk Add Shifts
        </h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Create multiple shifts at once
        </p>

        {step === "form" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Select Chatters */}
            <div>
              <label style={labelStyle}>Select Chatter(s) *</label>
              <div style={{ maxHeight: "180px", overflow: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
                {chatters.filter((c: any) => c.status === "active").map((c: any) => (
                  <label key={c.id} style={{
                    display: "flex", alignItems: "center", gap: "10px",
                    padding: "8px 12px", borderRadius: "8px", cursor: "pointer",
                    background: selectedChatters[c.id] ? "var(--green-bg)" : "var(--bg)",
                    border: selectedChatters[c.id] ? "1px solid var(--green)" : "1px solid var(--border)",
                    transition: "all 0.1s",
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedChatters[c.id] || false}
                      onChange={(e) => setSelectedChatters({ ...selectedChatters, [c.id]: e.target.checked })}
                      style={{ width: "16px", height: "16px", accentColor: "var(--green)" }}
                    />
                    {c.profilePictureUrl ? (
                      <img src={c.profilePictureUrl} alt={c.name} style={{ width: "20px", height: "20px", borderRadius: "6px", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: "14px" }}>{c.avatarEmoji || "👤"}</span>
                    )}
                    <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Creator */}
            <div>
              <label style={labelStyle}>Creator</label>
              <select value={creatorId} onChange={(e) => setCreatorId(e.target.value)} style={inputStyle}>
                <option value="">No specific creator</option>
                {creators.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Shift Type */}
            <div>
              <label style={labelStyle}>Shift Type</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                {SHIFT_TYPES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setShiftType(s.value)}
                    style={{
                      padding: "10px", fontSize: "13px", fontWeight: "600",
                      border: shiftType === s.value ? `2px solid ${s.color}` : "2px solid var(--border)",
                      borderRadius: "10px", cursor: "pointer",
                      background: shiftType === s.value ? `${s.color}10` : "var(--bg)",
                      color: shiftType === s.value ? s.color : "var(--text-secondary)",
                      transition: "all 0.15s",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                    }}
                  >
                    <span>{s.emoji} {s.label}</span>
                    <span style={{ fontSize: "10px", opacity: 0.7 }}>{s.time}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ongoing Toggle */}
            <label style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 16px", borderRadius: "12px", cursor: "pointer",
              background: ongoing ? "rgba(139,92,246,0.1)" : "var(--bg)",
              border: ongoing ? "2px solid #8b5cf6" : "2px solid var(--border)",
              transition: "all 0.15s",
            }}>
              <input
                type="checkbox"
                checked={ongoing}
                onChange={(e) => setOngoing(e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "#8b5cf6" }}
              />
              <div>
                <div style={{ fontSize: "14px", fontWeight: "600", color: ongoing ? "#8b5cf6" : "var(--text)" }}>
                  🔄 Ongoing shift (no end date)
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  Creates shifts for 3 months ahead — continuous/recurring
                </div>
              </div>
            </label>

            {/* Date Range */}
            <div style={{ display: "grid", gridTemplateColumns: ongoing ? "1fr" : "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>Start Date *</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              {!ongoing && (
                <div>
                  <label style={labelStyle}>End Date *</label>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
              <button onClick={onClose} style={cancelBtnStyle}>Cancel</button>
              <button
                onClick={() => setStep("preview")}
                disabled={selectedChatterList.length === 0 || dates.length === 0}
                style={{
                  ...saveBtnStyle,
                  opacity: selectedChatterList.length === 0 || dates.length === 0 ? 0.5 : 1,
                  cursor: selectedChatterList.length === 0 || dates.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                Preview ({totalShifts} shifts)
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Preview */}
            <div style={{
              background: "var(--bg)", borderRadius: "14px", padding: "16px",
              border: "2px solid var(--accent)",
            }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)", marginBottom: "12px" }}>
                📋 Preview: Create {totalShifts} shift{totalShifts !== 1 ? "s" : ""}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
                <div>
                  <strong>Chatters:</strong> {selectedChatterList.map((c: any) => c.name).join(", ")}
                </div>
                <div>
                  <strong>Creator:</strong> {selectedCreatorName}
                </div>
                <div>
                  <strong>Shift:</strong> {SHIFT_TYPES.find((s) => s.value === shiftType)?.emoji} {SHIFT_TYPES.find((s) => s.value === shiftType)?.label} ({SHIFT_TYPES.find((s) => s.value === shiftType)?.time})
                </div>
                <div>
                  <strong>Dates:</strong> {new Date(startDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(effectiveEndDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} ({dates.length} days)
                  {ongoing && <span style={{ color: "#8b5cf6", fontWeight: "600", marginLeft: "6px" }}>🔄 Ongoing</span>}
                </div>
              </div>

              {/* Per-chatter breakdown */}
              <div style={{ marginTop: "12px", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
                {selectedChatterList.map((c: any) => (
                  <div key={c.id} style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    {c.profilePictureUrl ? (
                      <img src={c.profilePictureUrl} alt={c.name} style={{ width: "16px", height: "16px", borderRadius: "4px", objectFit: "cover" }} />
                    ) : (
                      <span>{c.avatarEmoji || "👤"}</span>
                    )}
                    Create {dates.length} shifts for <strong>{c.name}</strong> on {selectedCreatorName} ({new Date(startDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}–{new Date(effectiveEndDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})
                  </div>
                ))}
              </div>
            </div>

            {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>❌ {error}</div>}

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setStep("form")} style={cancelBtnStyle}>← Back</button>
              <button onClick={handleCreate} disabled={saving} style={saveBtnStyle}>
                {saving ? "Creating..." : `✅ Create ${totalShifts} Shifts`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Schedule Page ──

export default function SchedulePage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showOffModal, setShowOffModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  // Add form state
  const [addChatterId, setAddChatterId] = useState("");
  const [addShiftType, setAddShiftType] = useState<string>("morning");
  const [addCreatorId, setAddCreatorId] = useState("");
  const [addNotes, setAddNotes] = useState("");

  // Off-day request state
  const [offNotes, setOffNotes] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const isAdmin = user && ["admin", "manager", "supervisor"].includes(user.role);

  // 2-week view for desktop admins, 1-week for mobile or chatters
  const use2Week = isAdmin && !isMobile;
  const viewDates = useMemo(
    () => use2Week ? get2WeekDates(viewDate) : getWeekDates(viewDate),
    [viewDate, use2Week]
  );
  const startDate = viewDates[0];
  const endDate = viewDates[viewDates.length - 1];

  const schedules = useQuery(
    api.crm.schedule.listByDateRange,
    token ? { token, startDate, endDate } : "skip"
  );
  const chatters = useQuery(api.crm.chatters.list, token && isAdmin ? { token } : "skip");
  const creators = useQuery(api.crm.creators.list, token ? { token } : "skip");
  const pendingRequests = useQuery(
    api.crm.schedule.getPendingRequests,
    token && isAdmin ? { token } : "skip"
  );

  const createSchedule = useMutation(api.crm.schedule.create);
  const removeSchedule = useMutation(api.crm.schedule.remove);
  const requestDayOff = useMutation(api.crm.schedule.requestDayOff);
  const approveDayOff = useMutation(api.crm.schedule.approveDayOff);
  const denyDayOff = useMutation(api.crm.schedule.denyDayOff);

  const today = new Date().toISOString().split("T")[0];

  // Group schedules by date
  const schedulesByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    viewDates.forEach((d) => (map[d] = []));
    (schedules || []).forEach((s: any) => {
      if (map[s.date]) map[s.date].push(s);
    });
    return map;
  }, [schedules, viewDates]);

  const handleAddSchedule = async () => {
    if (!addChatterId || !selectedDate) return;
    setSaving(true);
    setError("");
    try {
      await createSchedule({
        token,
        chatterId: addChatterId as any,
        date: selectedDate,
        shiftType: addShiftType as any,
        creatorId: addCreatorId ? (addCreatorId as any) : undefined,
        notes: addNotes || undefined,
      });
      setShowAddModal(false);
      setAddChatterId("");
      setAddShiftType("morning");
      setAddCreatorId("");
      setAddNotes("");
    } catch (err: any) {
      setError(err.message || "Failed to add schedule");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveSchedule = async (scheduleId: string) => {
    if (!confirm("Remove this schedule entry?")) return;
    try {
      await removeSchedule({ token, scheduleId: scheduleId as any });
    } catch (err: any) {
      alert(err.message || "Failed to remove");
    }
  };

  const handleRequestDayOff = async () => {
    if (!selectedDate) return;
    setSaving(true);
    setError("");
    try {
      await requestDayOff({
        token,
        date: selectedDate,
        notes: offNotes || undefined,
      });
      setShowOffModal(false);
      setOffNotes("");
    } catch (err: any) {
      setError(err.message || "Failed to request day off");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (scheduleId: string) => {
    try {
      await approveDayOff({ token, scheduleId: scheduleId as any });
    } catch (err: any) {
      alert(err.message || "Failed to approve");
    }
  };

  const handleDeny = async (scheduleId: string) => {
    try {
      await denyDayOff({ token, scheduleId: scheduleId as any });
    } catch (err: any) {
      alert(err.message || "Failed to deny");
    }
  };

  const openAddForDate = (date: string) => {
    setSelectedDate(date);
    setError("");
    setShowAddModal(true);
  };

  const openOffForDate = (date: string) => {
    setSelectedDate(date);
    setError("");
    setOffNotes("");
    setShowOffModal(true);
  };

  const navigateWeek = (dir: number) => {
    const d = new Date(viewDate);
    d.setDate(d.getDate() + dir * (use2Week ? 14 : 7));
    setViewDate(d);
  };

  const goToToday = () => setViewDate(new Date());

  if (!user) return null;

  const numColumns = use2Week ? 14 : 7;

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>📆 Schedule</h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {use2Week ? "2-week" : "Weekly"} shift schedule
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowBulkModal(true)} style={{
            padding: "10px 20px", fontSize: "13px", fontWeight: "600",
            color: "#fff", background: "#8b5cf6", border: "none",
            borderRadius: "12px", cursor: "pointer", transition: "all 0.2s",
          }}>
            📋 Bulk Add
          </button>
        )}
      </div>

      {/* Pending Off-Day Requests (admin only) */}
      {isAdmin && pendingRequests && pendingRequests.length > 0 && (
        <div style={{
          background: "var(--orange-bg)", borderRadius: "20px", padding: "20px",
          marginBottom: "20px", border: "2px solid var(--orange)",
        }}>
          <h3 style={{ fontSize: "15px", fontWeight: "600", color: "var(--orange)", marginBottom: "12px" }}>
            📋 Pending Day-Off Requests ({pendingRequests.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendingRequests.map((req: any) => (
              <div key={req.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", background: "var(--surface)", borderRadius: "14px",
                flexWrap: "wrap", gap: "8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {req.chatterProfilePictureUrl ? (
                    <img src={req.chatterProfilePictureUrl} alt={req.chatterName} style={{ width: "28px", height: "28px", borderRadius: "8px", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "20px" }}>{req.chatterEmoji}</span>
                  )}
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>{req.chatterName}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {new Date(req.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {req.notes && ` — ${req.notes}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => handleApprove(req.id)} style={{
                    padding: "8px 16px", fontSize: "13px", fontWeight: "600",
                    color: "#fff", background: "var(--green)", border: "none",
                    borderRadius: "10px", cursor: "pointer",
                  }}>✓ Approve</button>
                  <button onClick={() => handleDeny(req.id)} style={{
                    padding: "8px 16px", fontSize: "13px", fontWeight: "600",
                    color: "var(--red)", background: "var(--red-bg)", border: "1px solid var(--red)",
                    borderRadius: "10px", cursor: "pointer",
                  }}>✗ Deny</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date Picker Section */}
      <div style={{ display: "flex", gap: "20px", marginBottom: "20px", flexWrap: "wrap" }}>
        {/* Mini Calendar (desktop only) */}
        {!isMobile && (
          <div style={{ width: "260px", flexShrink: 0 }}>
            <MiniCalendar
              selectedDate={viewDate}
              onSelectDate={(d) => setViewDate(d)}
            />
            <div style={{ marginTop: "12px" }}>
              <QuickPresets onSelect={(d) => setViewDate(d)} />
            </div>
          </div>
        )}

        {/* Main Calendar Area */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Week Navigator */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: "16px", flexWrap: "wrap", gap: "8px",
          }}>
            <button onClick={() => navigateWeek(-1)} style={navBtnStyle}>← Prev</button>
            <div style={{ textAlign: "center", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ fontSize: "15px", fontWeight: "600", color: "var(--text)" }}>
                {new Date(startDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" — "}
                {new Date(endDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <button onClick={goToToday} style={{
                padding: "4px 12px", fontSize: "12px", fontWeight: "600",
                color: "var(--accent)", background: "transparent", border: "1px solid var(--accent)",
                borderRadius: "8px", cursor: "pointer",
              }}>
                Today
              </button>
            </div>
            <button onClick={() => navigateWeek(1)} style={navBtnStyle}>Next →</button>
          </div>

          {/* Mobile Quick Presets */}
          {isMobile && (
            <div style={{ marginBottom: "12px" }}>
              <QuickPresets onSelect={(d) => setViewDate(d)} />
            </div>
          )}

          {/* Calendar Grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${numColumns}, 1fr)`,
            gap: use2Week ? "4px" : "8px",
            marginBottom: "20px",
            overflowX: "auto",
          }}>
            {viewDates.map((dateStr) => {
              const { day, date, month } = formatDateHeader(dateStr);
              const entries = schedulesByDate[dateStr] || [];
              const isToday = dateStr === today;
              const isPast = dateStr < today;
              const isWeekend = (() => {
                const dow = new Date(dateStr + "T12:00:00").getDay();
                return dow === 0 || dow === 6;
              })();

              return (
                <div
                  key={dateStr}
                  style={{
                    background: isToday ? "var(--green-bg)" : isWeekend ? "rgba(0,0,0,0.02)" : "var(--surface)",
                    borderRadius: use2Week ? "12px" : "16px",
                    padding: use2Week ? "8px" : "12px",
                    minHeight: use2Week ? "120px" : "160px",
                    border: isToday ? "2px solid var(--green)" : "1px solid var(--border)",
                    opacity: isPast ? 0.7 : 1,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Day header */}
                  <div style={{ textAlign: "center", marginBottom: use2Week ? "6px" : "10px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: use2Week ? "4px" : "8px" }}>
                    <div style={{ fontSize: use2Week ? "9px" : "11px", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase" }}>{day}</div>
                    <div style={{ fontSize: use2Week ? "16px" : "20px", fontWeight: "700", color: isToday ? "var(--green)" : "var(--text)" }}>{date}</div>
                    {!use2Week && <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>{month}</div>}
                  </div>

                  {/* Schedule entries */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: use2Week ? "3px" : "6px" }}>
                    {entries.map((entry: any) => {
                      const mappedType = entry.shiftType === "evening" ? "night" : entry.shiftType;
                      const shift = SHIFT_TYPES.find((s) => s.value === mappedType);
                      const statusStyle = STATUS_STYLES[entry.status] || STATUS_STYLES.scheduled;

                      return (
                        <div
                          key={entry.id}
                          style={{
                            padding: use2Week ? "3px 5px" : "6px 8px",
                            background: statusStyle.bg,
                            borderRadius: use2Week ? "6px" : "8px",
                            borderLeft: `3px solid ${statusStyle.color}`,
                            position: "relative",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "3px", marginBottom: "1px" }}>
                            {entry.chatterProfilePictureUrl ? (
                              <img src={entry.chatterProfilePictureUrl} alt={entry.chatterName} style={{ width: use2Week ? "12px" : "16px", height: use2Week ? "12px" : "16px", borderRadius: "4px", objectFit: "cover" }} />
                            ) : (
                              <span style={{ fontSize: use2Week ? "10px" : "12px" }}>{entry.chatterEmoji}</span>
                            )}
                            <span style={{ fontSize: use2Week ? "9px" : "11px", fontWeight: "600", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {entry.chatterName}
                            </span>
                          </div>
                          <div style={{ fontSize: use2Week ? "8px" : "10px", color: "var(--text-muted)" }}>
                            {shift?.emoji} {use2Week ? "" : `${shift?.label} `}
                            {!use2Week && shift && <span style={{ opacity: 0.7 }}>({shift.time})</span>}
                            {entry.creatorName && ` ${use2Week ? "" : "• "}${entry.creatorName}`}
                          </div>
                          {entry.status !== "scheduled" && (
                            <div style={{
                              fontSize: use2Week ? "7px" : "9px", fontWeight: "600", color: statusStyle.color,
                              marginTop: "1px", textTransform: "uppercase",
                            }}>
                              {statusStyle.label}
                            </div>
                          )}
                          {isAdmin && !isPast && (
                            <button
                              onClick={() => handleRemoveSchedule(entry.id)}
                              style={{
                                position: "absolute", top: "2px", right: "2px",
                                background: "none", border: "none", cursor: "pointer",
                                fontSize: use2Week ? "8px" : "10px", color: "var(--text-muted)", padding: "2px",
                                lineHeight: 1,
                              }}
                            >✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Action buttons */}
                  {!isPast && (
                    <div style={{ display: "flex", gap: "3px", marginTop: use2Week ? "4px" : "8px" }}>
                      {isAdmin && (
                        <button
                          onClick={() => openAddForDate(dateStr)}
                          style={{
                            flex: 1, padding: use2Week ? "3px" : "6px",
                            fontSize: use2Week ? "10px" : "11px", fontWeight: "600",
                            color: "var(--accent)", background: "rgba(196,149,106,0.1)",
                            border: "none", borderRadius: use2Week ? "5px" : "8px", cursor: "pointer",
                          }}
                        >+</button>
                      )}
                      <button
                        onClick={() => openOffForDate(dateStr)}
                        style={{
                          flex: 1, padding: use2Week ? "3px" : "6px",
                          fontSize: use2Week ? "10px" : "11px", fontWeight: "600",
                          color: "var(--orange)", background: "var(--orange-bg)",
                          border: "none", borderRadius: use2Week ? "5px" : "8px", cursor: "pointer",
                        }}
                      >🏖️</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        background: "var(--surface)", borderRadius: "20px", padding: "20px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <h3 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)", marginBottom: "12px" }}>Legend</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {SHIFT_TYPES.map((s) => (
            <div key={s.value} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
              <span>{s.emoji}</span> {s.label} <span style={{ fontSize: "11px", opacity: 0.7 }}>({s.time})</span>
            </div>
          ))}
          <div style={{ width: "1px", background: "var(--border)", margin: "0 4px" }} />
          {Object.entries(STATUS_STYLES).map(([key, style]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: style.color }} />
              <span style={{ color: "var(--text-secondary)" }}>{style.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── ADD SCHEDULE MODAL ── */}
      {showAddModal && (
        <div onClick={() => setShowAddModal(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" }}>
              ➕ Add Schedule
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Team Member *</label>
                <select value={addChatterId} onChange={(e) => setAddChatterId(e.target.value)} style={inputStyle}>
                  <option value="">Select member...</option>
                  {(chatters || []).filter((c: any) => c.status === "active").map((c: any) => (
                    <option key={c.id} value={c.id}>{c.avatarEmoji || "👤"} {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Shift Type</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                  {SHIFT_TYPES.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setAddShiftType(s.value)}
                      style={{
                        padding: "12px", fontSize: "14px", fontWeight: "600",
                        border: addShiftType === s.value ? `2px solid ${s.color}` : "2px solid var(--border)",
                        borderRadius: "12px", cursor: "pointer",
                        background: addShiftType === s.value ? `${s.color}10` : "var(--bg)",
                        color: addShiftType === s.value ? s.color : "var(--text-secondary)",
                        transition: "all 0.15s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                      }}
                    >
                      <span>{s.emoji} {s.label}</span>
                      <span style={{ fontSize: "10px", opacity: 0.7 }}>{s.time}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Creator (optional)</label>
                <select value={addCreatorId} onChange={(e) => setAddCreatorId(e.target.value)} style={inputStyle}>
                  <option value="">No specific creator</option>
                  {(creators || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <input value={addNotes} onChange={(e) => setAddNotes(e.target.value)} placeholder="Optional notes..." style={inputStyle} />
              </div>
              {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>❌ {error}</div>}
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setShowAddModal(false)} style={cancelBtnStyle}>Cancel</button>
                <button onClick={handleAddSchedule} disabled={saving || !addChatterId} style={saveBtnStyle}>
                  {saving ? "Adding..." : "Add Schedule"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REQUEST DAY OFF MODAL ── */}
      {showOffModal && (
        <div onClick={() => setShowOffModal(false)} style={overlayStyle}>
          <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
            <h3 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)", marginBottom: "4px" }}>
              🏖️ Request Day Off
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
              {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={labelStyle}>Reason (optional)</label>
                <input value={offNotes} onChange={(e) => setOffNotes(e.target.value)} placeholder="Why do you need this day off?" style={inputStyle} />
              </div>
              {error && <div style={{ color: "var(--red)", fontSize: "13px" }}>❌ {error}</div>}
              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setShowOffModal(false)} style={cancelBtnStyle}>Cancel</button>
                <button onClick={handleRequestDayOff} disabled={saving} style={{
                  ...saveBtnStyle, background: saving ? "var(--text-muted)" : "var(--orange)",
                }}>
                  {saving ? "Requesting..." : "Request Day Off"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── BULK ADD MODAL ── */}
      {showBulkModal && chatters && creators && (
        <BulkAddModal
          token={token}
          chatters={chatters}
          creators={creators}
          onClose={() => setShowBulkModal(false)}
        />
      )}
    </div>
  );
}

// ── Shared Styles ──
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  fontSize: "15px",
  border: "2px solid var(--border)",
  borderRadius: "12px",
  background: "var(--bg)",
  color: "var(--text)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 100, padding: "16px",
};

const modalStyle: React.CSSProperties = {
  background: "var(--surface)", borderRadius: "24px", padding: "28px",
  width: "100%", maxWidth: "480px", maxHeight: "90vh", overflow: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const navBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  cursor: "pointer",
};

const miniNavBtn: React.CSSProperties = {
  width: "28px", height: "28px", display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: "16px", fontWeight: "700", color: "var(--text-secondary)",
  background: "var(--bg)", border: "1px solid var(--border)",
  borderRadius: "8px", cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: "14px", fontSize: "14px", fontWeight: "600",
  color: "var(--text-secondary)", background: "var(--bg)",
  border: "2px solid var(--border)", borderRadius: "14px", cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  flex: 1, padding: "14px", fontSize: "14px", fontWeight: "600",
  color: "#fff", background: "var(--accent)",
  border: "none", borderRadius: "14px", cursor: "pointer",
};
