"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, isPast, isToday, isFuture, addDays } from "date-fns";

interface Booking { id: string; title: string; guestName: string; guestEmail: string; notes: string | null; startTime: string; endTime: string; meetLink: string | null; status: string; eventType: { title: string; duration: number; }; }
interface EventType { id: string; slug: string; title: string; description: string; duration: number; }
interface BlockedTime { id: string; startTime: string; endTime: string; reason: string | null; allDay: boolean; }
interface Availability { startHour: number; endHour: number; days: string; timezone: string; }

type Tab = "bookings" | "schedule" | "blocked" | "events";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Toronto","Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Asia/Kolkata","Asia/Dubai","Australia/Sydney","Pacific/Auckland"];

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>("schedule");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [availability, setAvailability] = useState<Availability>({ startHour: 9, endHour: 17, days: "1,2,3,4,5", timezone: "America/New_York" });
  const [loading, setLoading] = useState(true);
  const [setupDone, setSetupDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Block form
  const [blockDate, setBlockDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [viewDate, setViewDate] = useState(format(new Date(), "yyyy-MM-dd"));

  // Event form
  const [editingEvent, setEditingEvent] = useState<EventType | null>(null);
  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDuration, setNewDuration] = useState(30);
  const [newSlug, setNewSlug] = useState("");

  const fetchAll = useCallback(async () => {
    try {
      const [bRes, eRes, btRes, aRes] = await Promise.all([fetch("/api/bookings"), fetch("/api/admin/event-types"), fetch("/api/admin/blocked-times"), fetch("/api/admin/availability")]);
      const [bData, eData, btData, aData] = await Promise.all([bRes.json(), eRes.json(), btRes.json(), aRes.json()]);
      setBookings(bData.bookings || []); setEventTypes(eData.eventTypes || []); setBlockedTimes(btData.blockedTimes || []);
      if (aData.availability) setAvailability(aData.availability);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session?.user?.id && !setupDone) {
      fetch("/api/setup", { method: "POST" }).then(() => { setSetupDone(true); fetchAll(); });
    } else if (status === "unauthenticated") setLoading(false);
  }, [session, status, setupDone, fetchAll]);

  const saveAvailability = async () => { setSaving(true); await fetch("/api/admin/availability", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(availability) }); setSaving(false); };

  const blockHour = async (hour: number) => {
    const startTime = `${viewDate}T${String(hour).padStart(2, "0")}:00:00`;
    const endTime = `${viewDate}T${String(hour).padStart(2, "0")}:59:59`;
    await fetch("/api/admin/blocked-times", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startTime, endTime, reason: null, allDay: false }) });
    const r = await fetch("/api/admin/blocked-times"); const d = await r.json(); setBlockedTimes(d.blockedTimes || []);
  };

  const unblockHour = async (hour: number) => {
    const matching = blockedTimes.filter((bt) => {
      const s = new Date(bt.startTime); const sd = format(s, "yyyy-MM-dd");
      return sd === viewDate && s.getHours() === hour && !bt.allDay;
    });
    for (const bt of matching) { await fetch(`/api/admin/blocked-times?id=${bt.id}`, { method: "DELETE" }); }
    const r = await fetch("/api/admin/blocked-times"); const d = await r.json(); setBlockedTimes(d.blockedTimes || []);
  };

  const blockFullDay = async () => {
    await fetch("/api/admin/blocked-times", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startTime: `${viewDate}T00:00:00`, endTime: `${viewDate}T23:59:59`, reason: "Full day blocked", allDay: true }) });
    const r = await fetch("/api/admin/blocked-times"); const d = await r.json(); setBlockedTimes(d.blockedTimes || []);
  };

  const deleteBlock = async (id: string) => {
    await fetch(`/api/admin/blocked-times?id=${id}`, { method: "DELETE" });
    setBlockedTimes((p) => p.filter((b) => b.id !== id));
  };

  const isHourBlocked = (hour: number) => {
    return blockedTimes.some((bt) => {
      const s = new Date(bt.startTime); const e = new Date(bt.endTime); const sd = format(s, "yyyy-MM-dd");
      if (bt.allDay && sd === viewDate) return true;
      if (sd === viewDate && s.getHours() <= hour && (e.getHours() > hour || (e.getHours() === hour && e.getMinutes() > 0))) return true;
      return false;
    });
  };

  const isFullDayBlocked = blockedTimes.some((bt) => bt.allDay && format(new Date(bt.startTime), "yyyy-MM-dd") === viewDate);

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

  const toggleDay = (d: number) => {
    const cur = availability.days.split(",").map(Number);
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort();
    setAvailability({ ...availability, days: next.join(",") });
  };

  if (status === "loading" || loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>;

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="border border-white/20 rounded-2xl p-10 max-w-sm w-full text-center bg-[#0a0a0a]">
        <p className="text-2xl font-bold mb-2 text-white">Admin</p>
        <p className="text-white/50 text-sm mb-8">Sign in to manage Chronos</p>
        <button onClick={() => signIn("google")} className="w-full flex items-center justify-center gap-3 bg-white text-black px-6 py-3.5 rounded-lg font-medium text-sm hover:bg-white/90 transition-colors cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Sign in with Google
        </button>
      </motion.div>
    </div>
  );

  const upcomingBookings = bookings.filter((b) => isFuture(new Date(b.startTime)) || isToday(new Date(b.startTime)));
  const pastBookings = bookings.filter((b) => isPast(new Date(b.startTime)) && !isToday(new Date(b.startTime)));
  const bookingLink = typeof window !== "undefined" ? window.location.origin : "";
  const hours = Array.from({ length: availability.endHour - availability.startHour }, (_, i) => availability.startHour + i);

  return (
    <div className="min-h-screen">
      <nav className="border-b border-white/10 sticky top-0 z-50 bg-black/90 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tracking-wide uppercase">Chronos</span>
            <span className="text-[10px] border border-white/15 px-2 py-0.5 rounded-full text-muted uppercase tracking-wider">Admin</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <a href="/" target="_blank" className="text-xs text-muted hover:text-foreground transition-colors hidden sm:block">Public page ↗</a>
            {session.user.image && <img src={session.user.image} alt="" className="w-7 h-7 rounded-full grayscale" />}
            <button onClick={() => signOut()} className="text-xs text-muted hover:text-foreground cursor-pointer">Sign out</button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Link bar */}
        <div className="border border-white/15 rounded-lg p-3 sm:p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0"><p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Public URL</p><code className="text-xs truncate block">{bookingLink}</code></div>
          <button onClick={() => { navigator.clipboard.writeText(bookingLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-xs border border-white/15 px-3 py-1.5 rounded-lg hover:border-white/20 transition-colors cursor-pointer shrink-0">{copied ? "Copied" : "Copy"}</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 mb-8 border-b border-white/10 overflow-x-auto">
          {(["schedule", "blocked", "events", "bookings"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2.5 text-sm font-medium transition-all cursor-pointer whitespace-nowrap capitalize border-b-2 -mb-px ${tab === t ? "border-white text-white" : "border-transparent text-muted hover:text-white/70"}`}>
              {t === "blocked" ? "Block Times" : t === "schedule" ? "Schedule" : t}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* SCHEDULE TAB */}
          {tab === "schedule" && (
            <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex flex-col lg:flex-row gap-8">
                <div className="flex-1">
                  <h2 className="text-lg font-bold mb-1">Working Hours</h2>
                  <p className="text-muted text-sm mb-6">Set your available days and hours</p>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs text-muted uppercase tracking-wider mb-3">Available Days</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAY_NAMES.map((n, i) => {
                          const on = availability.days.split(",").map(Number).includes(i);
                          return <button key={i} onClick={() => toggleDay(i)} className={`w-11 h-11 rounded-lg text-xs font-medium transition-all cursor-pointer border ${on ? "border-white bg-white text-black" : "border-border text-muted hover:border-white/20"}`}>{n.slice(0, 2)}</button>;
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Start</label>
                        <select value={availability.startHour} onChange={(e) => setAvailability({ ...availability, startHour: parseInt(e.target.value) })} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none cursor-pointer">
                          {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{format(new Date(2000, 0, 1, h), "h:mm a")}</option>)}
                        </select></div>
                      <div><label className="block text-xs text-muted uppercase tracking-wider mb-1.5">End</label>
                        <select value={availability.endHour} onChange={(e) => setAvailability({ ...availability, endHour: parseInt(e.target.value) })} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none cursor-pointer">
                          {Array.from({ length: 24 }).map((_, h) => <option key={h} value={h}>{format(new Date(2000, 0, 1, h), "h:mm a")}</option>)}
                        </select></div>
                    </div>

                    <div><label className="block text-xs text-muted uppercase tracking-wider mb-1.5">Timezone</label>
                      <select value={availability.timezone} onChange={(e) => setAvailability({ ...availability, timezone: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none cursor-pointer">
                        {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>)}
                      </select></div>

                    <button onClick={saveAvailability} disabled={saving} className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-30 cursor-pointer">
                      {saving ? "Saving..." : "Save schedule"}
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <div className="lg:w-72 shrink-0">
                  <p className="text-xs text-muted uppercase tracking-wider mb-3">Preview</p>
                  <div className="border border-white/15 rounded-xl p-4 space-y-1.5">
                    {DAY_NAMES.map((n, i) => {
                      const on = availability.days.split(",").map(Number).includes(i);
                      return <div key={i} className={`flex items-center justify-between text-xs py-1 ${on ? "text-foreground" : "text-muted/30 line-through"}`}>
                        <span>{n}</span>
                        {on && <span>{format(new Date(2000,0,1,availability.startHour), "ha")} – {format(new Date(2000,0,1,availability.endHour), "ha")}</span>}
                      </div>;
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* BLOCK TIMES TAB */}
          {tab === "blocked" && (
            <motion.div key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h2 className="text-lg font-bold mb-1">Block Times</h2>
              <p className="text-muted text-sm mb-6">Click hour slots to block/unblock them</p>

              {/* Date picker */}
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                <button onClick={() => setViewDate(format(addDays(new Date(viewDate), -1), "yyyy-MM-dd"))} className="w-8 h-8 rounded-lg border border-white/15 flex items-center justify-center hover:border-white/20 cursor-pointer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} className="px-3 py-2 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none" />
                <button onClick={() => setViewDate(format(addDays(new Date(viewDate), 1), "yyyy-MM-dd"))} className="w-8 h-8 rounded-lg border border-white/15 flex items-center justify-center hover:border-white/20 cursor-pointer">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
                <span className="text-sm font-medium ml-2">{format(new Date(viewDate + "T12:00:00"), "EEEE, MMMM d")}</span>
                <div className="flex-1" />
                <button onClick={blockFullDay} disabled={isFullDayBlocked} className="text-xs border border-danger/30 text-danger px-3 py-1.5 rounded-lg hover:bg-danger/10 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Block entire day
                </button>
              </div>

              {/* Visual day view */}
              <div className="border border-white/15 rounded-xl overflow-hidden">
                {hours.map((h) => {
                  const blocked = isHourBlocked(h);
                  const booking = bookings.find((b) => {
                    const bs = new Date(b.startTime); return format(bs, "yyyy-MM-dd") === viewDate && bs.getHours() === h;
                  });
                  return (
                    <div key={h} className={`flex items-stretch border-b border-white/10 last:border-b-0 transition-colors ${blocked ? "bg-white/[0.03]" : ""}`}>
                      <div className="w-20 sm:w-24 shrink-0 py-3 px-3 sm:px-4 text-xs text-muted border-r border-white/10 flex items-center">
                        {format(new Date(2000, 0, 1, h), "h:mm a")}
                      </div>
                      <div className="flex-1 py-3 px-3 sm:px-4 flex items-center gap-3 min-h-[48px]">
                        {blocked && !booking && (
                          <div className="flex items-center gap-2 flex-1">
                            <span className="text-xs text-muted">Blocked</span>
                            <div className="flex-1" />
                            <button onClick={() => unblockHour(h)} className="text-[10px] text-muted hover:text-foreground border border-white/15 px-2 py-1 rounded cursor-pointer transition-colors">Unblock</button>
                          </div>
                        )}
                        {booking && (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <div className="w-1.5 h-8 bg-white/30 rounded-full shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{booking.guestName}</p>
                              <p className="text-[10px] text-muted truncate">{booking.eventType.title} · {booking.guestEmail}</p>
                            </div>
                          </div>
                        )}
                        {!blocked && !booking && (
                          <button onClick={() => blockHour(h)} className="text-[10px] text-muted hover:text-foreground opacity-0 hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer">
                            + Block
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All blocked list */}
              {blockedTimes.length > 0 && (
                <div className="mt-8">
                  <p className="text-xs text-muted uppercase tracking-wider mb-3">All blocked slots</p>
                  <div className="space-y-1.5">
                    {blockedTimes.map((bt) => (
                      <div key={bt.id} className="flex items-center justify-between py-2 px-3 rounded-lg border border-white/15 text-xs">
                        <span>{format(new Date(bt.startTime), "MMM d")} {bt.allDay ? "(all day)" : `${format(new Date(bt.startTime), "h:mm a")} – ${format(new Date(bt.endTime), "h:mm a")}`}</span>
                        <button onClick={() => deleteBlock(bt.id)} className="text-muted hover:text-danger cursor-pointer transition-colors">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* EVENTS TAB */}
          {tab === "events" && (
            <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-6">
                <div><h2 className="text-lg font-bold mb-0.5">Meeting Types</h2><p className="text-muted text-sm">Add, edit, or remove meeting types</p></div>
                <button onClick={() => setShowNewEvent(true)} className="text-xs border border-white/15 px-3 py-1.5 rounded-lg hover:border-white/20 cursor-pointer transition-colors">+ Add new</button>
              </div>

              {/* New event form */}
              {showNewEvent && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="border border-white/15 rounded-xl p-5 mb-5 space-y-3">
                  <p className="text-sm font-semibold">New meeting type</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")); }} placeholder="Title (e.g. Quick Chat)" className="px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none focus:border-white/20 placeholder:text-muted/40" />
                    <select value={newDuration} onChange={(e) => setNewDuration(parseInt(e.target.value))} className="px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none cursor-pointer">
                      <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option><option value={90}>90 minutes</option>
                    </select>
                  </div>
                  <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description / custom message shown to visitors" rows={2} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none focus:border-white/20 placeholder:text-muted/40 resize-none" />
                  <div className="flex gap-2">
                    <button onClick={createEvent} disabled={!newTitle} className="px-4 py-2 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90 cursor-pointer disabled:opacity-30">Create</button>
                    <button onClick={() => { setShowNewEvent(false); setNewTitle(""); setNewDesc(""); }} className="px-4 py-2 rounded-lg border border-white/15 text-xs text-muted hover:text-foreground cursor-pointer">Cancel</button>
                  </div>
                </motion.div>
              )}

              <div className="space-y-3">
                {eventTypes.map((ev) => (
                  <div key={ev.id} className="border border-white/15 rounded-xl overflow-hidden">
                    {editingEvent?.id === ev.id ? (
                      <div className="p-5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div><label className="block text-[10px] text-muted uppercase tracking-wider mb-1">Title</label>
                            <input type="text" value={editingEvent.title} onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none" /></div>
                          <div><label className="block text-[10px] text-muted uppercase tracking-wider mb-1">Duration</label>
                            <select value={editingEvent.duration} onChange={(e) => setEditingEvent({ ...editingEvent, duration: parseInt(e.target.value) })} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none cursor-pointer">
                              <option value={15}>15 min</option><option value={30}>30 min</option><option value={45}>45 min</option><option value={60}>60 min</option><option value={90}>90 min</option>
                            </select></div>
                        </div>
                        <div><label className="block text-[10px] text-muted uppercase tracking-wider mb-1">Message / Description</label>
                          <textarea value={editingEvent.description} onChange={(e) => setEditingEvent({ ...editingEvent, description: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none resize-none" /></div>
                        <div><label className="block text-[10px] text-muted uppercase tracking-wider mb-1">URL Slug</label>
                          <input type="text" value={editingEvent.slug} onChange={(e) => setEditingEvent({ ...editingEvent, slug: e.target.value })} className="w-full px-3 py-2.5 rounded-lg bg-subtle border border-white/15 text-sm focus:outline-none" /></div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEvent(editingEvent)} className="px-4 py-2 rounded-lg bg-white text-black text-xs font-medium hover:bg-white/90 cursor-pointer">Save</button>
                          <button onClick={() => setEditingEvent(null)} className="px-4 py-2 rounded-lg border border-white/15 text-xs text-muted hover:text-foreground cursor-pointer">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5"><p className="font-medium text-sm">{ev.title}</p><span className="text-xs text-muted border border-white/15 px-1.5 py-0.5 rounded">{ev.duration}m</span></div>
                          <p className="text-xs text-muted truncate">{ev.description || "No description"}</p>
                          <p className="text-[10px] text-muted/50 mt-1">/{ev.slug}</p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => setEditingEvent({ ...ev })} className="text-xs border border-white/15 px-2.5 py-1 rounded-lg hover:border-white/20 cursor-pointer transition-colors">Edit</button>
                          <button onClick={() => deleteEvent(ev.id)} className="text-xs border border-white/15 px-2.5 py-1 rounded-lg hover:border-danger/30 hover:text-danger cursor-pointer transition-colors">Delete</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* BOOKINGS TAB */}
          {tab === "bookings" && (
            <motion.div key="bookings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="border border-white/15 rounded-xl p-4"><p className="text-[10px] text-muted uppercase tracking-wider">Upcoming</p><p className="text-2xl font-bold mt-1">{upcomingBookings.length}</p></div>
                <div className="border border-white/15 rounded-xl p-4"><p className="text-[10px] text-muted uppercase tracking-wider">Today</p><p className="text-2xl font-bold mt-1">{bookings.filter((b) => isToday(new Date(b.startTime))).length}</p></div>
                <div className="border border-white/15 rounded-xl p-4"><p className="text-[10px] text-muted uppercase tracking-wider">Total</p><p className="text-2xl font-bold mt-1">{bookings.length}</p></div>
              </div>

              {bookings.length === 0 ? (
                <div className="py-16 text-center text-muted"><p>No bookings yet</p><p className="text-xs mt-1">Share your public link to get started</p></div>
              ) : (
                <div className="space-y-2">
                  {bookings.map((b, i) => (
                    <motion.div key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className={`border border-white/15 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${isPast(new Date(b.startTime)) && !isToday(new Date(b.startTime)) ? "opacity-50" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{b.guestName}</p>
                        <p className="text-xs text-muted">{b.guestEmail}{b.notes ? ` · "${b.notes}"` : ""}</p>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        <p className="font-medium">{format(new Date(b.startTime), "EEE, MMM d")}</p>
                        <p className="text-muted">{format(new Date(b.startTime), "h:mm a")} – {format(new Date(b.endTime), "h:mm a")} · {b.eventType.title}</p>
                        {b.meetLink && <a href={b.meetLink} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 mt-0.5 inline-block">Meet ↗</a>}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
