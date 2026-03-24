"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isToday, isFuture } from "date-fns";

interface Booking { id: string; title: string; guestName: string; guestEmail: string; notes: string | null; startTime: string; endTime: string; meetLink: string | null; status: string; isChronos?: boolean; eventType: { title: string; duration: number; }; }
interface EventType { id: string; slug: string; title: string; description: string; duration: number; color?: string; }
interface BlockedTime { id: string; startTime: string; endTime: string; reason: string | null; allDay: boolean; }
interface TimeRange { start: string; end: string; }
interface DaySchedule { enabled: boolean; ranges: TimeRange[]; }
interface Availability { timezone: string; schedule: DaySchedule[]; }

const DEFAULT_SCHEDULE: DaySchedule[] = Array.from({ length: 7 }, (_, i) => ({
  enabled: [1, 2, 3, 4, 5].includes(i),
  ranges: [{ start: "09:00", end: "17:00" }],
}));

function normalizeAvailState(data: any): Availability {
  if (data?.schedule) return { timezone: data.timezone ?? "America/New_York", schedule: data.schedule };
  const enabledDays = (data?.days ?? "1,2,3,4,5").split(",").map(Number);
  const start = `${String(data?.startHour ?? 9).padStart(2, "0")}:00`;
  const end   = `${String(data?.endHour   ?? 17).padStart(2, "0")}:00`;
  return {
    timezone: data?.timezone ?? "America/New_York",
    schedule: Array.from({ length: 7 }, (_, i) => ({ enabled: enabledDays.includes(i), ranges: [{ start, end }] })),
  };
}

type Tab = "bookings" | "schedule" | "events" | "overrides";
const FULL_DAYS  = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES  = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Asia/Kolkata","Asia/Dubai","Australia/Sydney","Pacific/Auckland"];

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_ADMIN_BYPASS === "true";

/* ── Design tokens ─────────────────────────────────────────────── */
const BG      = "#F8F9FB";
const SURFACE = "#FFFFFF";
const PRIMARY    = "oklch(0.8677 0.0735 7.0855)";          /* pink */
const PRIMARY_A10 = "oklch(0.8677 0.0735 7.0855 / 0.10)";
const PRIMARY_A12 = "oklch(0.8677 0.0735 7.0855 / 0.12)";
const PRIMARY_A15 = "oklch(0.8677 0.0735 7.0855 / 0.15)";
const PRIMARY_A20 = "oklch(0.8677 0.0735 7.0855 / 0.20)";
const PRIMARY_A30 = "oklch(0.8677 0.0735 7.0855 / 0.30)";
const PRIMARY_A33 = "oklch(0.8677 0.0735 7.0855 / 0.33)";
const ACCENT     = "oklch(0.8148 0.0819 225.7537)";        /* blue */
const ACCENT_A20  = "oklch(0.8148 0.0819 225.7537 / 0.20)";
const ACCENT_A33  = "oklch(0.8148 0.0819 225.7537 / 0.33)";
const ACCENT_A40  = "oklch(0.8148 0.0819 225.7537 / 0.40)";
const ON_SURF = "#2D3436";
const ON_VAR  = "#636E72";
const OUTLINE = "#DFE6E9";
const DANGER  = "#EF4444";

/* ── Tiny SVG icons ────────────────────────────────────────────── */
function IcoTimer()     { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 14.5 14.5"/><path d="M16.5 3.5 l1.5 1.5"/></svg>; }
function IcoCalendar()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IcoLayers()    { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>; }
function IcoList()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>; }
function IcoGlobe()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>; }
function IcoCheck()     { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>; }
function IcoPlus()      { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function IcoEdit()      { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function IcoTrash()     { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>; }
function IcoExtLink()   { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>; }
function IcoOverride()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="15" x2="15" y2="15"/></svg>; }

/* ══════════════════════════════════════════════════════════════ */
export default function AdminPanel() {
  const { data: session, status } = useSession();
  const [tab, setTab]             = useState<Tab>("schedule");
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [availability, setAvailability] = useState<Availability>({ timezone: "America/New_York", schedule: DEFAULT_SCHEDULE });
  const [loading, setLoading]     = useState(true);
  const [setupDone, setSetupDone] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [copied, setCopied]       = useState(false);

  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideDate, setOverrideDate]         = useState(format(new Date(), "yyyy-MM-dd"));
  const [overrideAllDay, setOverrideAllDay]     = useState(false);
  const [overrideStart, setOverrideStart]       = useState("09:00");
  const [overrideEnd, setOverrideEnd]           = useState("17:00");

  const [editingEvent, setEditingEvent] = useState<EventType | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newTitle, setNewTitle]         = useState("");
  const [newDesc, setNewDesc]           = useState("");
  const [newDuration, setNewDuration]   = useState(30);
  const [newSlug, setNewSlug]           = useState("");
  const [menuOpenId, setMenuOpenId]     = useState<string | null>(null);

  // Track original availability for discard
  const [savedAvailability, setSavedAvailability] = useState<Availability>({ timezone: "America/New_York", schedule: DEFAULT_SCHEDULE });
  const [filterDate, setFilterDate] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [bRes, eRes, btRes, aRes] = await Promise.all([fetch("/api/bookings"), fetch("/api/admin/event-types"), fetch("/api/admin/blocked-times"), fetch("/api/admin/availability")]);
      const [bData, eData, btData, aData] = await Promise.all([bRes.json(), eRes.json(), btRes.json(), aRes.json()]);
      setBookings(bData.bookings || []); setEventTypes(eData.eventTypes || []); setBlockedTimes(btData.blockedTimes || []);
      if (aData.availability) { const norm = normalizeAvailState(aData.availability); setAvailability(norm); setSavedAvailability(norm); }
    } catch { /**/ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (DEV_BYPASS && !setupDone) {
      fetch("/api/setup", { method: "POST" }).then(() => { setSetupDone(true); fetchAll(); });
    } else if (session?.user?.id && !setupDone) {
      fetch("/api/setup", { method: "POST" }).then(() => { setSetupDone(true); fetchAll(); });
    } else if (status === "unauthenticated") setLoading(false);
  }, [session, status, setupDone, fetchAll]);

  const addDateOverride = async () => {
    if (!overrideDate) return;
    const startTime = overrideAllDay
      ? new Date(`${overrideDate}T00:00:00`).toISOString()
      : new Date(`${overrideDate}T${overrideStart}:00`).toISOString();
    const endTime = overrideAllDay
      ? new Date(`${overrideDate}T23:59:59`).toISOString()
      : new Date(`${overrideDate}T${overrideEnd}:00`).toISOString();
    await fetch("/api/admin/blocked-times", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startTime, endTime, reason: null, allDay: overrideAllDay }) });
    const r = await fetch("/api/admin/blocked-times"); const d = await r.json(); setBlockedTimes(d.blockedTimes || []);
    setShowOverrideForm(false);
    setOverrideDate(format(new Date(), "yyyy-MM-dd"));
    setOverrideAllDay(false);
    setOverrideStart("09:00");
    setOverrideEnd("17:00");
  };

  const saveAvailability = async () => {
    setSaving(true);
    await fetch("/api/admin/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(availability) });
    setSavedAvailability(availability);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const deleteBlock = async (id: string) => {
    await fetch(`/api/admin/blocked-times?id=${id}`, { method: "DELETE" });
    setBlockedTimes((p) => p.filter((b) => b.id !== id));
  };

  const saveEvent = async (ev: EventType) => {
    await fetch("/api/admin/event-types", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ev) });
    setEditingEvent(null); fetchAll();
  };

  const createEvent = async () => {
    if (!newTitle || !newSlug) return;
    await fetch("/api/admin/event-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: newTitle, description: newDesc, duration: newDuration, slug: newSlug }) });
    setShowNewEvent(false); setNewTitle(""); setNewDesc(""); setNewDuration(30); setNewSlug(""); fetchAll();
  };

  const deleteEvent = async (id: string) => {
    await fetch(`/api/admin/event-types?id=${id}`, { method: "DELETE" }); fetchAll();
  };

  const toggleDay = (dayIdx: number) => {
    setAvailability((prev) => ({
      ...prev,
      schedule: prev.schedule.map((d, i) => i === dayIdx ? { ...d, enabled: !d.enabled } : d),
    }));
  };

  const addRange = (dayIdx: number) => {
    setAvailability((prev) => ({
      ...prev,
      schedule: prev.schedule.map((d, i) =>
        i === dayIdx ? { ...d, ranges: [...d.ranges, { start: "09:00", end: "17:00" }] } : d
      ),
    }));
  };

  const removeRange = (dayIdx: number, rangeIdx: number) => {
    setAvailability((prev) => ({
      ...prev,
      schedule: prev.schedule.map((d, i) =>
        i === dayIdx ? { ...d, ranges: d.ranges.filter((_, ri) => ri !== rangeIdx) } : d
      ),
    }));
  };

  const updateRange = (dayIdx: number, rangeIdx: number, field: "start" | "end", value: string) => {
    setAvailability((prev) => ({
      ...prev,
      schedule: prev.schedule.map((d, i) =>
        i === dayIdx
          ? { ...d, ranges: d.ranges.map((r, ri) => ri === rangeIdx ? { ...r, [field]: value } : r) }
          : d
      ),
    }));
  };

  /* ── Loading ── */
  if ((DEV_BYPASS ? false : status === "loading") || loading) return (
    <div style={{ background: BG, minHeight: "100vh" }} className="flex items-center justify-center">
      <div className="w-6 h-6 rounded-full animate-spin"
        style={{ border: `2px solid ${OUTLINE}`, borderTopColor: PRIMARY }} />
    </div>
  );

  /* ── Sign-in ── */
  if (!DEV_BYPASS && !session) return (
    <div style={{ background: BG, minHeight: "100vh", color: ON_SURF }} className="flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl p-10 max-w-sm w-full text-center"
        style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.06)" }}>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-6"
          style={{ background: PRIMARY, color: "#fff" }}>
          <IcoTimer />
        </div>
        <p className="text-2xl font-bold mb-2">Chronos Admin</p>
        <p className="text-sm mb-8" style={{ color: ON_VAR }}>Sign in to manage your availability</p>
        <button onClick={() => signIn("google")}
          className="w-full flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-medium text-sm transition-all cursor-pointer"
          style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );

  const upcomingBookings = bookings.filter((b) => isFuture(new Date(b.startTime)) || isToday(new Date(b.startTime)));
  const bookingLink      = typeof window !== "undefined" ? window.location.origin : "";

  const timeOptions = Array.from({ length: 36 }, (_, i) => {
    const idx = i + 12; // start from 6:00 AM (index 12 = 06:00)
    const h = Math.floor(idx / 2); const m = idx % 2 === 0 ? "00" : "30";
    const val = `${String(h).padStart(2, "0")}:${m}`;
    const label = format(new Date(2000, 0, 1, h, idx % 2 === 0 ? 0 : 30), "h:mm a");
    return { value: val, label };
  });

  const sidebarItems: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "schedule",  label: "Availability",    icon: <IcoCalendar /> },
    { id: "overrides", label: "Date Overrides",  icon: <IcoOverride /> },
    { id: "events",    label: "Event Types",     icon: <IcoLayers /> },
    { id: "bookings",  label: "Bookings",        icon: <IcoList /> },
  ];

  return (
    <div style={{ background: BG, minHeight: "100vh", color: ON_SURF, fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Top Nav ── */}

      <main className="pt-28 pb-16 px-6 max-w-7xl mx-auto">

        {/* ── Public URL bar ── */}
        {/* <div className="flex items-center justify-between gap-3 flex-wrap mb-10 px-5 py-3.5 rounded-xl"
          style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${PRIMARY}15` }}>
              <IcoExtLink />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: ON_VAR }}>Your Public Booking URL</p>
              <code className="text-xs truncate block" style={{ color: ON_SURF }}>{bookingLink}</code>
            </div>
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(bookingLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-all cursor-pointer shrink-0"
            style={{ background: copied ? `${ACCENT}33` : `${PRIMARY}12`, color: copied ? "#00B894" : PRIMARY, border: `1px solid ${copied ? ACCENT : `${PRIMARY}30`}` }}>
            {copied ? <><IcoCheck /> Copied!</> : "Copy Link"}
          </button>
        </div> */}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">

          {/* ── Sidebar ── */}
          <aside className="lg:col-span-3">
            <div className="flex flex-col gap-1.5 mb-8">
              {sidebarItems.map(({ id, label, icon }) => (
                <SidebarItem key={id} active={tab === id} onClick={() => setTab(id)} label={label} icon={icon} />
              ))}
            </div>

            {/* Timezone card */}
            <div className="p-5 rounded-2xl" style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.04)" }}>
              <h4 className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: `${ON_VAR}99` }}>Current Timezone</h4>
              <div className="flex items-center gap-2">
                <span style={{ color: ON_VAR }}><IcoGlobe /></span>
                <select value={availability.timezone}
                  onChange={async (e) => {
                    const updated = { ...availability, timezone: e.target.value };
                    setAvailability(updated);
                    await fetch("/api/admin/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
                    setSavedAvailability(updated);
                  }}
                  className="text-xs font-semibold outline-none cursor-pointer flex-1"
                  style={{ background: "transparent", color: ON_SURF, colorScheme: "light" }}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                </select>
              </div>
            </div>

            {/* Quick tips */}
            {tab === "schedule" && (
              <div className="mt-4 p-5 rounded-2xl" style={{ background: ACCENT_A20, border: `1px solid ${ACCENT_A40}` }}>
                <p className="text-xs font-bold mb-1" style={{ color: ON_SURF }}>Instant Sync</p>
                <p className="text-xs leading-relaxed" style={{ color: ON_VAR }}>Changes instantly update your booking page for all active event types.</p>
              </div>
            )}
          </aside>

          {/* ── Main content ── */}
          <div className="lg:col-span-9">
            <AnimatePresence mode="wait">

              {/* ════ SCHEDULE TAB ════ */}
              {tab === "schedule" && (
                <motion.div key="schedule" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <section className="rounded-3xl p-8" style={{ background: SURFACE, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)", border: `1px solid ${OUTLINE}` }}>

                    {/* Card header */}
                    <div className="flex items-center justify-between mb-10">
                      <h3 className="text-lg font-bold" style={{ color: ON_SURF }}>Standard Working Hours</h3>
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                        style={{ background: ACCENT_A20, border: `1px solid ${ACCENT_A40}` }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT }} />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#00897B" }}>Active Schedule</span>
                      </div>
                    </div>

                    {/* Timezone row */}
                    <div className="mb-6 flex items-center gap-4 p-4 rounded-xl" style={{ background: BG, border: `1px solid ${OUTLINE}` }}>
                      <label className="text-xs font-bold uppercase tracking-wider shrink-0" style={{ color: ON_VAR }}>Timezone</label>
                      <select value={availability.timezone}
                        onChange={(e) => setAvailability({ ...availability, timezone: e.target.value })}
                        className="flex-1 text-sm font-medium outline-none cursor-pointer"
                        style={{ background: "transparent", color: ON_SURF, colorScheme: "light" }}>
                        {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                      </select>
                    </div>

                    {/* Day rows */}
                    <div style={{ borderTop: `1px solid ${OUTLINE}` }}>
                      {FULL_DAYS.map((dayName, i) => {
                        const day = availability.schedule[i];
                        return (
                          <div key={i} className="flex items-start gap-6 py-5"
                            style={{ borderBottom: i < 6 ? `1px solid ${OUTLINE}` : "none", opacity: day.enabled ? 1 : 0.45 }}>
                            {/* Toggle + day name */}
                            <div className="w-36 flex items-center gap-3 shrink-0 pt-1.5">
                              <ToggleSwitch checked={day.enabled} onChange={() => toggleDay(i)} />
                              <span className="text-sm font-semibold" style={{ color: ON_SURF }}>{dayName}</span>
                            </div>

                            {/* Time ranges */}
                            <div className="flex-1 space-y-2">
                              {day.enabled ? (
                                <>
                                  {day.ranges.map((range, ri) => (
                                    <div key={ri} className="flex items-center gap-2">
                                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                                        style={{ background: BG, border: `1px solid ${OUTLINE}` }}>
                                        <select value={range.start}
                                          onChange={(e) => updateRange(i, ri, "start", e.target.value)}
                                          className="text-sm font-medium outline-none cursor-pointer"
                                          style={{ background: "transparent", color: ON_SURF, colorScheme: "light" }}>
                                          {timeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                        <span style={{ color: OUTLINE }}>→</span>
                                        <select value={range.end}
                                          onChange={(e) => updateRange(i, ri, "end", e.target.value)}
                                          className="text-sm font-medium outline-none cursor-pointer"
                                          style={{ background: "transparent", color: ON_SURF, colorScheme: "light" }}>
                                          {timeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                      </div>
                                      {day.ranges.length > 1 && (
                                        <button onClick={() => removeRange(i, ri)}
                                          className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer text-base leading-none transition-all"
                                          style={{ color: ON_VAR, border: `1px solid ${OUTLINE}`, background: SURFACE }}
                                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = DANGER; (e.currentTarget as HTMLElement).style.borderColor = `${DANGER}50`; }}
                                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ON_VAR; (e.currentTarget as HTMLElement).style.borderColor = OUTLINE; }}>
                                          ×
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button onClick={() => addRange(i)}
                                    className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                                    style={{ color: PRIMARY, background: PRIMARY_A10, border: `1px solid ${PRIMARY_A20}` }}>
                                    <IcoPlus /> Add
                                  </button>
                                </>
                              ) : (
                                <span className="italic text-xs pt-1.5 block" style={{ color: ON_VAR }}>No availability scheduled</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Actions */}
                    <div className="mt-10 pt-8 flex justify-end gap-3" style={{ borderTop: `1px solid ${OUTLINE}` }}>
                      <button
                        onClick={() => setAvailability(savedAvailability)}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        style={{ background: BG, color: ON_VAR, border: `1px solid ${OUTLINE}` }}>
                        Discard Changes
                      </button>
                      <button onClick={saveAvailability} disabled={saving}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50"
                        style={{ background: PRIMARY, color: "#000", boxShadow: `0 4px 12px ${PRIMARY_A33}` }}>
                        {saving ? "Saving…" : "Save Availability"}
                      </button>
                    </div>
                  </section>

                </motion.div>
              )}

              {/* ════ OVERRIDES TAB ════ */}
              {tab === "overrides" && (
                <motion.div key="overrides" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <section className="rounded-3xl p-8" style={{ background: SURFACE, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)", border: `1px solid ${OUTLINE}` }}>
                    <div className="flex items-start justify-between mb-6">
                      <div>
                        <h3 className="text-lg font-bold" style={{ color: ON_SURF }}>Date Overrides</h3>
                        <p className="text-xs mt-1" style={{ color: ON_VAR }}>Add dates when your availability changes from your weekly hours.</p>
                      </div>
                      <button onClick={() => setShowOverrideForm((v) => !v)}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl cursor-pointer transition-all shrink-0"
                        style={{ background: showOverrideForm ? BG : PRIMARY_A12, color: showOverrideForm ? ON_VAR : PRIMARY, border: `1px solid ${showOverrideForm ? OUTLINE : PRIMARY_A30}` }}>
                        <IcoPlus /> Add date override
                      </button>
                    </div>

                    <AnimatePresence>
                      {showOverrideForm && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
                          <div className="p-5 rounded-2xl space-y-4" style={{ background: BG, border: `1px solid ${OUTLINE}` }}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <AdminLabel>Date</AdminLabel>
                                <input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)}
                                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                  style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }} />
                              </div>
                              <div className="flex items-end pb-1">
                                <label className="flex items-center gap-2.5 cursor-pointer h-[42px]">
                                  <ToggleSwitch checked={overrideAllDay} onChange={() => setOverrideAllDay((v) => !v)} />
                                  <span className="text-sm font-semibold" style={{ color: ON_SURF }}>All day</span>
                                </label>
                              </div>
                            </div>
                            {!overrideAllDay && (
                              <div className="flex items-center gap-3">
                                <div className="flex-1">
                                  <AdminLabel>Start time</AdminLabel>
                                  <select value={overrideStart} onChange={(e) => setOverrideStart(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                                    style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }}>
                                    {timeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                  </select>
                                </div>
                                <span className="text-sm shrink-0 mt-5" style={{ color: ON_VAR }}>→</span>
                                <div className="flex-1">
                                  <AdminLabel>End time</AdminLabel>
                                  <select value={overrideEnd} onChange={(e) => setOverrideEnd(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                                    style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }}>
                                    {timeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                  </select>
                                </div>
                              </div>
                            )}
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setShowOverrideForm(false)}
                                className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                                style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_VAR }}>Cancel</button>
                              <button onClick={addDateOverride} disabled={!overrideDate}
                                className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-30"
                                style={{ background: PRIMARY, color: "#fff" }}>Add override</button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {blockedTimes.length === 0 ? (
                      <div className="py-10 text-center rounded-2xl" style={{ border: `1px dashed ${OUTLINE}` }}>
                        <p className="text-sm font-semibold mb-1" style={{ color: ON_SURF }}>No overrides for this schedule yet</p>
                        <p className="text-xs" style={{ color: ON_VAR }}>Override specific dates to remove hours or block full days.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {blockedTimes.map((bt) => (
                          <div key={bt.id} className="flex items-center justify-between px-4 py-3 rounded-xl"
                            style={{ border: `1px solid ${OUTLINE}`, background: BG }}>
                            <div className="flex items-center gap-3">
                              <div className="px-3 py-1.5 rounded-lg text-center shrink-0"
                                style={{ background: SURFACE, border: `1px solid ${OUTLINE}` }}>
                                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: ON_VAR }}>
                                  {format(new Date(bt.startTime), "MMM")}
                                </p>
                                <p className="text-lg font-bold leading-none" style={{ color: ON_SURF }}>
                                  {format(new Date(bt.startTime), "d")}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm font-semibold" style={{ color: ON_SURF }}>
                                  {format(new Date(bt.startTime), "EEEE, MMMM d, yyyy")}
                                </p>
                                <p className="text-xs" style={{ color: ON_VAR }}>
                                  {bt.allDay ? "All day · Unavailable" : `${format(new Date(bt.startTime), "h:mm a")} – ${format(new Date(bt.endTime), "h:mm a")} · Unavailable`}
                                </p>
                              </div>
                            </div>
                            <button onClick={() => deleteBlock(bt.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                              style={{ color: ON_VAR }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = DANGER; (e.currentTarget as HTMLElement).style.background = `${DANGER}12`; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = ON_VAR; (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                              <IcoTrash />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </motion.div>
              )}

              {/* ════ EVENTS TAB ════ */}
              {tab === "events" && (
                <motion.div key="events" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                  {/* New event type form */}
                  <AnimatePresence>
                    {showNewEvent && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-5">
                        <div className="rounded-2xl p-6 space-y-4" style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)" }}>
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold" style={{ color: ON_SURF }}>New event type</p>
                            <button onClick={() => { setShowNewEvent(false); setNewTitle(""); setNewDesc(""); }}
                              className="text-xs cursor-pointer" style={{ color: ON_VAR }}>Cancel</button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <AdminLabel>Title</AdminLabel>
                              <AdminInput type="text" value={newTitle} placeholder="e.g. Quick Chat"
                                onChange={(v) => { setNewTitle(v); setNewSlug(v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); }} />
                            </div>
                            <div>
                              <AdminLabel>Duration</AdminLabel>
                              <select value={newDuration} onChange={(e) => setNewDuration(parseInt(e.target.value))}
                                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                                style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }}>
                                <option value={15}>15 minutes</option><option value={30}>30 minutes</option>
                                <option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <AdminLabel>Description</AdminLabel>
                            <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                              placeholder="A brief description of this event type" rows={2}
                              className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none"
                              style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }} />
                          </div>
                          <div>
                            <AdminLabel>URL slug</AdminLabel>
                            <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ border: `1px solid ${OUTLINE}` }}>
                              <span className="px-3 py-2.5 text-sm shrink-0" style={{ background: BG, color: ON_VAR, borderRight: `1px solid ${OUTLINE}` }}>your-link/</span>
                              <input type="text" value={newSlug} onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""))}
                                className="flex-1 px-3 py-2.5 text-sm outline-none"
                                style={{ background: SURFACE, color: ON_SURF, colorScheme: "light" }} />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-1">
                            <button onClick={createEvent} disabled={!newTitle}
                              className="px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all disabled:opacity-30"
                              style={{ background: PRIMARY, color: "#fff" }}>Continue</button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Event type list */}
                  <section className="rounded-3xl overflow-hidden" style={{ background: SURFACE, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)", border: `1px solid ${OUTLINE}` }}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid ${OUTLINE}` }}>
                      <div>
                        <h3 className="text-sm font-bold" style={{ color: ON_SURF }}>Event Types</h3>
                        <p className="text-xs mt-0.5" style={{ color: ON_VAR }}>{eventTypes.length} event type{eventTypes.length !== 1 ? "s" : ""}</p>
                      </div>
                      <button onClick={() => { setShowNewEvent(true); setMenuOpenId(null); }}
                        className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl cursor-pointer transition-all"
                        style={{ background: PRIMARY, color: "#fff" }}>
                        <IcoPlus /> New event type
                      </button>
                    </div>

                    {/* Empty state */}
                    {eventTypes.length === 0 && !showNewEvent && (
                      <div className="py-20 text-center" style={{ color: ON_VAR }}>
                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: BG }}>
                          <IcoLayers />
                        </div>
                        <p className="text-sm font-semibold mb-1" style={{ color: ON_SURF }}>No event types</p>
                        <p className="text-xs">Create your first event type to start accepting bookings.</p>
                      </div>
                    )}

                    {/* List */}
                    {eventTypes.map((ev, evIdx) => (
                      <div key={ev.id} style={{ borderBottom: evIdx < eventTypes.length - 1 ? `1px solid ${OUTLINE}` : "none" }}>
                        {editingEvent?.id === ev.id ? (
                          /* ── Inline edit form ── */
                          <div className="p-6 space-y-4" style={{ background: BG }}>
                            <p className="text-sm font-bold" style={{ color: ON_SURF }}>Edit event type</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <AdminLabel>Title</AdminLabel>
                                <AdminInput type="text" value={editingEvent.title} onChange={(v) => setEditingEvent({ ...editingEvent, title: v })} />
                              </div>
                              <div>
                                <AdminLabel>Duration</AdminLabel>
                                <select value={editingEvent.duration} onChange={(e) => setEditingEvent({ ...editingEvent, duration: parseInt(e.target.value) })}
                                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
                                  style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }}>
                                  <option value={15}>15 min</option><option value={30}>30 min</option>
                                  <option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option>
                                </select>
                              </div>
                            </div>
                            <div>
                              <AdminLabel>Description</AdminLabel>
                              <textarea value={editingEvent.description} onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })} rows={2}
                                className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none"
                                style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }} />
                            </div>
                            <div>
                              <AdminLabel>URL slug</AdminLabel>
                              <div className="flex items-center gap-0 rounded-xl overflow-hidden" style={{ border: `1px solid ${OUTLINE}` }}>
                                <span className="px-3 py-2.5 text-sm shrink-0" style={{ background: BG, color: ON_VAR, borderRight: `1px solid ${OUTLINE}` }}>your-link/</span>
                                <input type="text" value={editingEvent.slug}
                                  onChange={(e) => setEditingEvent({ ...editingEvent, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })}
                                  className="flex-1 px-3 py-2.5 text-sm outline-none"
                                  style={{ background: SURFACE, color: ON_SURF, colorScheme: "light" }} />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button onClick={() => setEditingEvent(null)}
                                className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                                style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_VAR }}>Discard</button>
                              <button onClick={() => saveEvent(editingEvent)}
                                className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                                style={{ background: PRIMARY, color: "#fff" }}>Save changes</button>
                            </div>
                          </div>
                        ) : (
                          /* ── Event type row ── */
                          <div className="flex items-center gap-4 px-6 py-4 group" style={{ background: SURFACE }}>
                            {/* Color bar */}
                            <div className="w-1 h-10 rounded-full shrink-0" style={{ background: ev.color || PRIMARY }} />
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <p className="font-semibold text-sm" style={{ color: ON_SURF }}>{ev.title}</p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                  style={{ background: PRIMARY_A15, color: PRIMARY }}>{ev.duration} min</span>
                              </div>
                              <p className="text-xs truncate mb-0.5" style={{ color: ON_VAR }}>{ev.description || "No description"}</p>
                              <p className="text-[10px]" style={{ color: `${ON_VAR}70` }}>/{ev.slug}</p>
                            </div>
                            {/* "⋯" Dropdown */}
                            <div className="relative shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === ev.id ? null : ev.id); }}
                                className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all text-lg font-bold leading-none"
                                style={{ background: menuOpenId === ev.id ? PRIMARY_A12 : "transparent", color: ON_VAR, border: `1px solid ${menuOpenId === ev.id ? PRIMARY_A30 : "transparent"}` }}>
                                ···
                              </button>
                              {menuOpenId === ev.id && (
                                <div className="absolute right-0 top-9 z-20 rounded-xl shadow-xl py-1 min-w-36 overflow-hidden"
                                  style={{ background: SURFACE, border: `1px solid ${OUTLINE}` }}>
                                  <button
                                    onClick={() => { setEditingEvent({ ...ev }); setMenuOpenId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-medium text-left transition-colors cursor-pointer"
                                    style={{ color: ON_SURF }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = BG)}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                    <IcoEdit /> Edit
                                  </button>
                                  <div style={{ height: 1, background: OUTLINE, margin: "2px 0" }} />
                                  <button
                                    onClick={() => { deleteEvent(ev.id); setMenuOpenId(null); }}
                                    className="flex items-center gap-2.5 w-full px-4 py-2.5 text-xs font-medium text-left transition-colors cursor-pointer"
                                    style={{ color: DANGER }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = `${DANGER}08`)}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                    <IcoTrash /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </section>
                </motion.div>
              )}

              {/* ════ BOOKINGS TAB ════ */}
              {tab === "bookings" && (
                <motion.div key="bookings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {(() => {
                      const upcoming = bookings.filter((b) => isFuture(new Date(b.startTime)) || isToday(new Date(b.startTime)));
                      return [
                        { label: "Upcoming", value: upcoming.length,                                                    color: PRIMARY },
                        { label: "Today",    value: upcoming.filter((b) => isToday(new Date(b.startTime))).length,      color: ACCENT },
                        { label: "Total",    value: upcoming.length,                                                    color: ON_VAR },
                      ];
                    })().map(({ label, value, color }) => (
                      <div key={label} className="rounded-2xl p-5"
                        style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.04)" }}>
                        <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: ON_VAR }}>{label}</p>
                        <p className="text-3xl font-bold" style={{ color }}>{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Calendar filter bar */}
                  <div className="flex items-center gap-3 mb-4">
                    <input ref={dateInputRef} type="date" value={filterDate ?? ""}
                      min={format(new Date(), "yyyy-MM-dd")}
                      onChange={(e) => setFilterDate(e.target.value || null)}
                      className="sr-only" style={{ colorScheme: "light" }} />
                    <button onClick={() => dateInputRef.current?.showPicker()}
                      className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer"
                      style={{
                        background: filterDate ? PRIMARY : SURFACE,
                        color: filterDate ? "#000" : ON_VAR,
                        border: `1px solid ${filterDate ? PRIMARY : OUTLINE}`,
                      }}>
                      <IcoCalendar />
                      {filterDate ? format(new Date(filterDate + "T00:00:00"), "MMM d, yyyy") : "Filter by date"}
                    </button>
                    {filterDate && (
                      <button onClick={() => setFilterDate(null)}
                        className="text-xs font-bold px-3 py-2 rounded-full cursor-pointer"
                        style={{ background: BG, color: ON_VAR, border: `1px solid ${OUTLINE}` }}>
                        Clear
                      </button>
                    )}
                  </div>

                  <section className="rounded-3xl overflow-hidden" style={{ background: SURFACE, boxShadow: "0 4px 20px -2px rgba(0,0,0,0.05)", border: `1px solid ${OUTLINE}` }}>
                    {(() => {
                      const displayed = filterDate
                        ? bookings.filter((b) => format(new Date(b.startTime), "yyyy-MM-dd") === filterDate)
                        : upcomingBookings;
                      if (displayed.length === 0) return (
                        <div className="py-20 text-center" style={{ color: ON_VAR }}>
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: BG }}>
                            <IcoList />
                          </div>
                          <p className="text-sm font-semibold mb-1" style={{ color: ON_SURF }}>
                            {filterDate ? "No bookings on this day" : "No upcoming bookings"}
                          </p>
                          <p className="text-xs">{filterDate ? "Try a different date." : "New bookings will appear here."}</p>
                        </div>
                      );
                      return (
                        <>
                          <div className="hidden sm:grid px-6 py-3 text-[10px] font-bold uppercase tracking-wider"
                            style={{ gridTemplateColumns: "2fr 1.2fr 1.4fr 80px 100px", borderBottom: `1px solid ${OUTLINE}`, color: ON_VAR, background: BG }}>
                            <span>Attendee</span>
                            <span>Event type</span>
                            <span>Date &amp; time</span>
                            <span>Status</span>
                            <span className="text-right">Action</span>
                          </div>
                          {displayed.map((b) => (
                            <BookingTableRow key={b.id} b={b} upcoming={isFuture(new Date(b.startTime)) || isToday(new Date(b.startTime))} />
                          ))}
                        </>
                      );
                    })()}
                  </section>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* ── Success Toast ── */}
      <AnimatePresence>
        {saved && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-5 py-3 rounded-xl shadow-2xl z-50"
            style={{ background: ON_SURF, color: "#fff" }}>
            <span style={{ color: ACCENT }}><IcoCheck /></span>
            <span className="text-xs font-semibold">Availability saved successfully</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Powered by */}
      <div className="fixed bottom-0 left-0 right-0 text-center text-sm z-40 py-3" style={{ color: "rgba(45,52,54,0.45)", background: BG }}>
        Powered by <strong style={{ color: "rgba(45,52,54,0.7)" }}>NeuralArc Inc</strong>
      </div>
    </div>
  );
}

/* ── Reusable mini-components ────────────────────────────────── */

function SidebarItem({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer w-full text-left"
      style={{
        background: active ? SURFACE : "transparent",
        color: active ? PRIMARY : ON_VAR,
        boxShadow: active ? "0 4px 20px -2px rgba(0,0,0,0.05)" : "none",
        border: active ? `1px solid ${PRIMARY_A20}` : "1px solid transparent",
      }}>
      <span style={{ color: active ? PRIMARY : ON_VAR }}>{icon}</span>
      {label}
    </button>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className="relative inline-flex items-center shrink-0 cursor-pointer transition-colors duration-200"
      style={{ width: 36, height: 20, borderRadius: 10, background: checked ? ACCENT : OUTLINE }}>
      <span className="inline-block rounded-full transition-transform duration-200"
        style={{ width: 16, height: 16, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transform: `translateX(${checked ? 18 : 2}px)` }} />
    </button>
  );
}

function AdminInput({ type, value, onChange, placeholder }: { type: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
      style={{ background: SURFACE, border: `1px solid ${OUTLINE}`, color: ON_SURF, colorScheme: "light" }} />
  );
}

function AdminLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: ON_VAR }}>{children}</label>;
}



function BookingTableRow({ b, upcoming }: { b: Booking; upcoming: boolean }) {
  return (
    <div className="grid px-6 py-4 items-center gap-4 transition-colors"
      style={{
        gridTemplateColumns: "2fr 1.2fr 1.4fr 80px 100px",
        borderBottom: `1px solid ${OUTLINE}`,
        background: upcoming ? SURFACE : BG,
        opacity: upcoming ? 1 : 0.75,
      }}>
      {/* Attendee */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
          style={{ background: upcoming ? PRIMARY_A15 : OUTLINE, color: upcoming ? PRIMARY : ON_VAR }}>
          {b.guestName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: ON_SURF }}>{b.guestName}</p>
          <p className="text-xs truncate" style={{ color: ON_VAR }}>{b.guestEmail}</p>
        </div>
      </div>
      {/* Event type */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium truncate" style={{ color: ON_SURF }}>{b.eventType.title}</p>
          {!b.isChronos && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: OUTLINE, color: ON_VAR }}>EXT</span>
          )}
        </div>
        <p className="text-[10px]" style={{ color: ON_VAR }}>{b.eventType.duration} min</p>
      </div>
      {/* Date & time */}
      <div>
        <p className="text-xs font-semibold" style={{ color: ON_SURF }}>{format(new Date(b.startTime), "EEE, MMM d, yyyy")}</p>
        <p className="text-[10px]" style={{ color: ON_VAR }}>{format(new Date(b.startTime), "h:mm a")} – {format(new Date(b.endTime), "h:mm a")}</p>
      </div>
      {/* Status badge */}
      <div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-full"
          style={{
            background: upcoming ? PRIMARY_A15 : "oklch(0.636 0.046 257.3 / 0.12)",
            color: upcoming ? PRIMARY : ON_VAR,
          }}>
          {upcoming ? (isToday(new Date(b.startTime)) ? "Today" : "Upcoming") : "Past"}
        </span>
      </div>
      {/* Action */}
      <div className="flex justify-end">
        {b.meetLink ? (
          <a href={b.meetLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: PRIMARY_A12, color: PRIMARY }}>
            Join <IcoExtLink />
          </a>
        ) : (
          <span className="text-[10px]" style={{ color: `${ON_VAR}50` }}>—</span>
        )}
      </div>
    </div>
  );
}
