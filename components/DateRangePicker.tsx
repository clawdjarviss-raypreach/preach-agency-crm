"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";

/* ─── types ─── */
export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string;
}

interface Props {
  value: DateRange;
  onChange: (r: DateRange) => void;
}

/* ─── helpers ─── */
function fmt(d: Date) {
  return d.toISOString().split("T")[0];
}
function toDate(s: string) {
  return new Date(s + "T12:00:00");
}
function label(s: string) {
  const d = toDate(s);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function sameDay(a: string, b: string) {
  return a === b;
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday-first
  const r = new Date(d);
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/* ─── preset definitions ─── */
type PresetKey =
  | "today" | "yesterday" | "thisWeek" | "lastWeek"
  | "thisMonth" | "lastMonth" | "last7" | "last30"
  | "last90" | "last365" | "allTime";

interface Preset {
  key: PresetKey;
  label: string;
  range: () => DateRange;
}

const PRESETS: Preset[] = [
  {
    key: "today", label: "Today",
    range: () => { const t = fmt(new Date()); return { start: t, end: t }; },
  },
  {
    key: "yesterday", label: "Yesterday",
    range: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = fmt(d); return { start: s, end: s }; },
  },
  {
    key: "thisWeek", label: "This Week",
    range: () => { const now = new Date(); return { start: fmt(startOfWeek(now)), end: fmt(now) }; },
  },
  {
    key: "lastWeek", label: "Last Week",
    range: () => {
      const now = new Date();
      const thisStart = startOfWeek(now);
      const end = new Date(thisStart); end.setDate(end.getDate() - 1);
      const start = startOfWeek(end);
      return { start: fmt(start), end: fmt(end) };
    },
  },
  {
    key: "thisMonth", label: "This Month",
    range: () => {
      const now = new Date();
      return { start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), end: fmt(now) };
    },
  },
  {
    key: "lastMonth", label: "Last Month",
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: fmt(start), end: fmt(end) };
    },
  },
  {
    key: "last7", label: "Last 7 days",
    range: () => { const now = new Date(); const s = new Date(now); s.setDate(s.getDate() - 6); return { start: fmt(s), end: fmt(now) }; },
  },
  {
    key: "last30", label: "Last 30 days",
    range: () => { const now = new Date(); const s = new Date(now); s.setDate(s.getDate() - 29); return { start: fmt(s), end: fmt(now) }; },
  },
  {
    key: "last90", label: "Last 90 days",
    range: () => { const now = new Date(); const s = new Date(now); s.setDate(s.getDate() - 89); return { start: fmt(s), end: fmt(now) }; },
  },
  {
    key: "last365", label: "Last 365 days",
    range: () => { const now = new Date(); const s = new Date(now); s.setDate(s.getDate() - 364); return { start: fmt(s), end: fmt(now) }; },
  },
  {
    key: "allTime", label: "All Time",
    range: () => ({ start: "2020-01-01", end: fmt(new Date()) }),
  },
];

/* ─── CalendarMonth ─── */
function CalendarMonth({
  year, month, rangeStart, rangeEnd, hoverDate,
  onSelect, onHover,
}: {
  year: number; month: number;
  rangeStart: string | null; rangeEnd: string | null;
  hoverDate: string | null;
  onSelect: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const totalDays = daysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  const weeks: (string | null)[][] = [];
  let week: (string | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= totalDays; d++) {
    const ds = fmt(new Date(year, month, d));
    week.push(ds);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const effectiveEnd = rangeEnd || hoverDate;
  const lo = rangeStart && effectiveEnd ? (rangeStart < effectiveEnd ? rangeStart : effectiveEnd) : null;
  const hi = rangeStart && effectiveEnd ? (rangeStart > effectiveEnd ? rangeStart : effectiveEnd) : null;

  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const dayHeaders = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const todayStr = fmt(new Date());

  return (
    <div style={{ minWidth: "260px" }}>
      <div style={{ textAlign: "center", fontSize: "13px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>
        {monthLabel}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
        {dayHeaders.map((h) => (
          <div key={h} style={{ textAlign: "center", fontSize: "11px", color: "#666", padding: "4px 0", fontWeight: 500 }}>{h}</div>
        ))}
        {weeks.flat().map((ds, i) => {
          if (!ds) return <div key={`e${i}`} />;
          const isStart = rangeStart ? sameDay(ds, rangeStart) : false;
          const isEnd = (rangeEnd ? sameDay(ds, rangeEnd) : false) || (!rangeEnd && hoverDate ? sameDay(ds, hoverDate) : false);
          const inRange = !!(lo && hi && ds >= lo && ds <= hi);
          const isToday = ds === todayStr;

          let bg = "transparent";
          let color = "#ccc";
          let fontWeight: string | number = 400;
          let borderRadius = "6px";

          if (isStart || isEnd) {
            bg = "#f1ae38";
            color = "#1a1a1a";
            fontWeight = 700;
          } else if (inRange) {
            bg = "rgba(241,174,56,0.15)";
            color = "#fff";
            borderRadius = "0";
          }

          if (isStart && inRange) borderRadius = "6px 0 0 6px";
          if (isEnd && inRange) borderRadius = "0 6px 6px 0";
          if (isStart && isEnd) borderRadius = "6px";

          return (
            <div
              key={ds}
              onClick={() => onSelect(ds)}
              onMouseEnter={() => onHover(ds)}
              style={{
                textAlign: "center", padding: "6px 0", fontSize: "12px",
                cursor: "pointer", background: bg, color, fontWeight,
                borderRadius, transition: "all 0.15s",
                border: isToday && !isStart && !isEnd ? "1px solid #555" : "1px solid transparent",
              }}
            >
              {new Date(ds + "T12:00:00").getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── DateRangePicker ─── */
export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetKey | null>("last7");
  const [selectingStart, setSelectingStart] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const now = useMemo(() => new Date(), []);
  const viewYear = now.getFullYear();
  const viewMonth = now.getMonth();
  const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectingStart(null);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handlePreset = useCallback((p: Preset) => {
    setActivePreset(p.key);
    const r = p.range();
    onChange(r);
    setSelectingStart(null);
    setOpen(false);
  }, [onChange]);

  const handleDaySelect = useCallback((ds: string) => {
    if (!selectingStart) {
      setSelectingStart(ds);
      setActivePreset(null);
    } else {
      const lo = selectingStart < ds ? selectingStart : ds;
      const hi = selectingStart > ds ? selectingStart : ds;
      onChange({ start: lo, end: hi });
      setSelectingStart(null);
      setActivePreset(null);
      setOpen(false);
    }
  }, [selectingStart, onChange]);

  const displayLabel = `${label(value.start)} – ${label(value.end)}`;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 16px", fontSize: "13px", fontWeight: 600,
          color: "#fff", background: "#1e1e1e", border: "1px solid #333",
          borderRadius: "10px", cursor: "pointer", transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: "14px" }}>📅</span>
        {displayLabel}
        <span style={{ fontSize: "10px", color: "#666", marginLeft: "4px" }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          zIndex: 1000, display: "flex",
          background: "#1a1a1a", border: "1px solid #333", borderRadius: "14px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
          overflow: "hidden",
        }}>
          <div style={{
            width: "170px", borderRight: "1px solid #2a2a2a",
            padding: "12px 8px", display: "flex", flexDirection: "column", gap: "2px",
            overflowY: "auto", maxHeight: "380px",
          }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePreset(p)}
                style={{
                  padding: "8px 12px", fontSize: "12px", fontWeight: 500,
                  color: activePreset === p.key ? "#1a1a1a" : "#ccc",
                  background: activePreset === p.key ? "#f1ae38" : "transparent",
                  border: "none", borderRadius: "8px", cursor: "pointer",
                  textAlign: "left", transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ padding: "16px 20px", display: "flex", gap: "24px" }}>
            <CalendarMonth
              year={viewYear} month={viewMonth}
              rangeStart={selectingStart || value.start}
              rangeEnd={selectingStart ? null : value.end}
              hoverDate={selectingStart ? hoverDate : null}
              onSelect={handleDaySelect}
              onHover={setHoverDate}
            />
            <CalendarMonth
              year={nextYear} month={nextMonth}
              rangeStart={selectingStart || value.start}
              rangeEnd={selectingStart ? null : value.end}
              hoverDate={selectingStart ? hoverDate : null}
              onSelect={handleDaySelect}
              onHover={setHoverDate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
