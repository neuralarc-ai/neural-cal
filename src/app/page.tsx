"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isSameDay,
  isAfter, startOfDay, isToday,
} from "date-fns";

interface EventType { id: string; slug: string; title: string; description: string; duration: number; }
interface Slot { start: string; end: string; }
interface HostData { id: string; name: string; image: string; bio: string; eventTypes: EventType[]; }
type Step = "type" | "date" | "form" | "confirmed";

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.2 },
};

/* ── Brand colors ─────────────────────────────────────────────── */
const BG       = "#F2F4F7";
const SURFACE  = "#FFFFFF";
const SURF_LOW = "#F9FAFB";
const PRIMARY      = "oklch(0.8677 0.0735 7.0855)";          /* pink */
const PRIMARY_A33  = "oklch(0.8677 0.0735 7.0855 / 0.33)";
const PRIMARY_A55  = "oklch(0.8677 0.0735 7.0855 / 0.55)";
const SECONDARY    = "oklch(0.8148 0.0819 225.7537)";         /* blue */
const SECONDARY_A09 = "oklch(0.8148 0.0819 225.7537 / 0.09)";
const SECONDARY_A10 = "oklch(0.8148 0.0819 225.7537 / 0.10)";
const SECONDARY_A20 = "oklch(0.8148 0.0819 225.7537 / 0.20)";
const SECONDARY_A53 = "oklch(0.8148 0.0819 225.7537 / 0.53)";
const TERTIARY = "#C4B5FD";
const ON_SURF  = "#1F2937";
const ON_VAR   = "#4B5563";
const OUTLINE  = "#E5E7EB";

/* ── Confirmation page colors ─────────────────────────────────── */
const C_PRIMARY   = "#F2A8A8";   /* pink */
const C_SECONDARY = "#7BBFD4";   /* blue */
const C_LAVENDER  = "#E0D7FF";
const C_TERTIARY  = "#7c3aed";

/* ── Small SVG icons ──────────────────────────────────────────── */
function IconClock({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  );
}
function IconVideo({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}
function IconGlobe({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}
function IconPerson({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}
function IconCalendar({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function IconArrow({ color = ON_SURF }: { color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function IconBack({ color = ON_VAR }: { color?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

/* ── Hover-safe button styles ─────────────────────────────────── */
function useHover() {
  const [hovered, setHovered] = useState(false);
  return {
    hovered,
    bind: { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) },
  };
}

/* ═══════════════════════════════════════════════════════════════ */
export default function PublicBookingPage() {
  const [host, setHost]                   = useState<HostData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventType | null>(null);
  const [currentMonth, setCurrentMonth]   = useState(new Date());
  const [selectedDate, setSelectedDate]   = useState<Date | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [slots, setSlots]                 = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot]   = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots]   = useState(false);
  const [loadingDays, setLoadingDays]     = useState(false);
  const [step, setStep]                   = useState<Step>("type");
  const [booking, setBooking]             = useState(false);
  const [guestName, setGuestName]         = useState("");
  const [guestEmail, setGuestEmail]       = useState("");
  const [notes, setNotes]                 = useState("");
  const [meetLink, setMeetLink]           = useState("");
  const [timezone]                        = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

  useEffect(() => {
    fetch("/api/host")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setHost(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const fetchDays = useCallback((month: Date) => {
    if (!host) return;
    setLoadingDays(true);
    fetch(`/api/availability/days?userId=${host.id}&month=${format(month, "yyyy-MM")}`)
      .then((r) => r.json())
      .then((d) => { setAvailableDates(d.availableDates || []); setLoadingDays(false); })
      .catch(() => setLoadingDays(false));
  }, [host]);

  useEffect(() => { if (host && step === "date") fetchDays(currentMonth); }, [host, currentMonth, step, fetchDays]);

  useEffect(() => {
    if (selectedDate && selectedEvent && host) {
      setLoadingSlots(true);
      fetch(`/api/availability?userId=${host.id}&date=${format(selectedDate, "yyyy-MM-dd")}&duration=${selectedEvent.duration}&timezone=${timezone}`)
        .then((r) => r.json())
        .then((d) => { setSlots(d.slots || []); setLoadingSlots(false); })
        .catch(() => setLoadingSlots(false));
    }
  }, [selectedDate, selectedEvent, host, timezone]);

  const handleBook = async () => {
    if (!selectedSlot || !selectedEvent || !guestName || !guestEmail) return;
    setBooking(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventTypeId: selectedEvent.id, startTime: selectedSlot.start, endTime: selectedSlot.end, guestName, guestEmail, notes, timezone }),
      });
      const data = await res.json();
      if (data.meetLink) setMeetLink(data.meetLink);
      setStep("confirmed");
    } catch { /**/ } finally { setBooking(false); }
  };

  const goBack = () => {
    if (step === "form") { setStep("date"); setSelectedSlot(null); }
    else if (step === "date") { setStep("type"); setSelectedEvent(null); setSelectedDate(null); setSlots([]); }
  };

  const reset = () => {
    setStep("type"); setSelectedEvent(null); setSelectedDate(null);
    setSelectedSlot(null); setGuestName(""); setGuestEmail(""); setNotes(""); setMeetLink(""); setSlots([]);
  };

  /* ── Loading state ── */
  if (loading) return (
    <div style={{ background: BG, minHeight: "100vh" }} className="flex items-center justify-center">
      <div className="w-6 h-6 rounded-full animate-spin"
        style={{ border: `2px solid ${OUTLINE}`, borderTopColor: SECONDARY }} />
    </div>
  );

  /* ── Error state ── */
  if (error || !host) return (
    <div style={{ background: BG, minHeight: "100vh", color: ON_SURF }} className="flex items-center justify-center p-6 text-center">
      <div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black mb-4 mx-auto"
          style={{ background: PRIMARY, color: ON_SURF }}>C</div>
        <p className="font-bold text-lg mb-1">Chronos</p>
        <p className="text-sm mb-4" style={{ color: ON_VAR }}>No host configured.</p>
        <a href="/admin" className="text-sm underline underline-offset-4" style={{ color: SECONDARY }}>Set up admin →</a>
      </div>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════
     CONFIRMED PAGE — full-page success view
  ══════════════════════════════════════════════════════════════ */
  if (step === "confirmed") {
    return (
      <div style={{ background: "#F9FAFB", minHeight: "100vh", color: "#1f2937", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {/* Header */}
        <header style={{ position: "fixed", top: 0, width: "100%", zIndex: 50, background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", borderBottom: "1px solid #f1f5f9" }}>
          <div className="flex items-center px-8 py-4 max-w-7xl mx-auto">
            <span className="text-xl font-bold tracking-tight" style={{ color: C_PRIMARY }}>Chronos</span>
          </div>
        </header>

        <main className="pt-32 pb-20 px-6 max-w-2xl mx-auto">
          {/* Success hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center mb-12">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 280, damping: 18 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ background: `${C_SECONDARY}33` }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={C_SECONDARY} strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/>
              </svg>
            </motion.div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">You&apos;re scheduled!</h1>
            <p className="text-base max-w-md leading-relaxed" style={{ color: "#4b5563" }}>
              A calendar invitation has been sent to{" "}
              <span className="font-semibold" style={{ color: "#1f2937" }}>{guestEmail}</span>{" "}
              with all the meeting details.
            </p>
          </motion.div>

          {/* Details card */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-8 mb-10"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)", border: "1px solid #f1f5f9" }}>
            <div className="space-y-8">
              {/* Who */}
              <div className="flex items-start gap-5">
                <div className="p-2.5 rounded-xl" style={{ background: `${C_PRIMARY}0D` }}>
                  <IconPerson color={C_PRIMARY} />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-widest font-bold mb-1" style={{ color: "rgba(75,85,99,0.7)" }}>Who</span>
                  <h3 className="text-lg font-semibold">{host.name}</h3>
                  <p className="text-sm mt-0.5" style={{ color: "#4b5563" }}>{selectedEvent?.title}</p>
                </div>
              </div>

              {/* When */}
              <div className="flex items-start gap-5">
                <div className="p-2.5 rounded-xl" style={{ background: `${C_LAVENDER}4D` }}>
                  <IconCalendar color={C_TERTIARY} />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-widest font-bold mb-1" style={{ color: "rgba(75,85,99,0.7)" }}>When</span>
                  <h3 className="text-lg font-semibold">{selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}</h3>
                  <p className="text-sm mt-0.5" style={{ color: "#4b5563" }}>
                    {selectedSlot && `${format(new Date(selectedSlot.start), "h:mm a")} — ${format(new Date(selectedSlot.end), "h:mm a")}`}
                    {" "}({timezone.replace(/_/g, " ")})
                  </p>
                </div>
              </div>

              {/* Where */}
              <div className="flex items-start gap-5">
                <div className="p-2.5 rounded-xl" style={{ background: `${C_SECONDARY}1A` }}>
                  <IconVideo color={C_SECONDARY} />
                </div>
                <div>
                  <span className="block text-[0.68rem] uppercase tracking-widest font-bold mb-1" style={{ color: "rgba(75,85,99,0.7)" }}>Where</span>
                  <h3 className="text-lg font-semibold">Google Meet</h3>
                  {meetLink
                    ? <a href={meetLink} target="_blank" rel="noopener noreferrer"
                        className="text-sm font-medium mt-0.5 inline-block hover:opacity-80 transition-opacity"
                        style={{ color: C_PRIMARY }}>{meetLink.replace("https://", "")}</a>
                    : <p className="text-sm mt-0.5" style={{ color: "#4b5563" }}>Details provided after booking</p>
                  }
                </div>
              </div>
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {meetLink && (
              <a href={meetLink} target="_blank" rel="noopener noreferrer"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold tracking-tight flex items-center justify-center gap-2 transition-all"
                style={{ background: C_PRIMARY, color: "#fff", boxShadow: `0 4px 14px ${C_PRIMARY}33` }}>
                <IconVideo color="#fff" size={18} />
                Join Meeting
              </a>
            )}
            <button onClick={reset}
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-semibold tracking-tight transition-all"
              style={{ background: `${C_LAVENDER}66`, color: C_TERTIARY }}>
              Book Another Meeting
            </button>
          </motion.div>

          {/* Supplemental info */}
          <div className="mt-20 pt-10" style={{ borderTop: "1px solid #f1f5f9" }}>
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="text-center md:text-left">
                <h4 className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#4b5563" }}>Need to make changes?</h4>
                <p className="text-xs leading-relaxed max-w-sm" style={{ color: "rgba(75,85,99,0.8)" }}>
                  You can cancel or reschedule this event up to 24 hours before the start time.
                </p>
              </div>
            </div>
          </div>
        </main>

        {/* Decorative blobs */}
        <div className="fixed -bottom-40 -left-40 w-96 h-96 rounded-full -z-10"
          style={{ background: `${C_PRIMARY}0D`, filter: "blur(100px)" }} />
        <div className="fixed top-20 -right-20 w-80 h-80 rounded-full -z-10"
          style={{ background: `${C_LAVENDER}1A`, filter: "blur(80px)" }} />

      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     MAIN BOOKING LAYOUT — two-column card
  ══════════════════════════════════════════════════════════════ */
  return (
    <div style={{ background: BG, minHeight: "100vh", color: ON_SURF, fontFamily: "system-ui, -apple-system, sans-serif" }}
      className="flex flex-col items-center justify-center p-4 md:p-8">

      {/* ── Brand above card ── */}
      <p className="text-2xl font-bold tracking-tight mb-6" style={{ color: ON_SURF }}>NeuralArc's Chronos</p>

      {/* ── Main card ── */}
      <div className="max-w-5xl w-full rounded-2xl flex flex-col md:flex-row overflow-hidden"
        style={{ background: SURFACE, border: `1px solid rgba(229,231,235,0.6)`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

        {/* ────────────── LEFT PANEL ────────────── */}
        <section className="w-full md:w-5/12 p-8 md:p-10 flex flex-col gap-8"
          style={{ background: SURF_LOW, borderRight: `1px solid ${OUTLINE}` }}>

          {/* Host avatar + name + title */}
          <div className="space-y-4">
            {host.image
              ? <img src={host.image} alt={host.name} className="w-16 h-16 rounded-full object-cover"
                  style={{ boxShadow: `0 0 0 4px ${TERTIARY}33` }} />
              : <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
                  style={{ background: `${TERTIARY}33`, color: ON_SURF }}>{host.name[0]}</div>
            }
            <div>
              <p className="text-sm font-medium" style={{ color: ON_VAR }}>{host.name}</p>
              <h1 className="text-3xl font-black tracking-tight leading-tight mt-1" style={{ color: ON_SURF }}>
                {selectedEvent ? selectedEvent.title : "Book a Meeting"}
              </h1>
            </div>
          </div>

          {/* Meta info chips */}
          <div className="space-y-3.5">
            {selectedEvent && (
              <div className="flex items-center gap-3">
                <IconClock color={SECONDARY} />
                <span className="text-sm font-semibold" style={{ color: ON_VAR }}>{selectedEvent.duration} min</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <IconVideo color={SECONDARY} />
              <span className="text-sm font-semibold" style={{ color: ON_VAR }}>Web conferencing details upon confirmation</span>
            </div>
            <div className="flex items-center gap-3">
              <IconGlobe color={SECONDARY} />
              <span className="text-sm font-semibold" style={{ color: ON_VAR }}>{timezone.replace(/_/g, " ")}</span>
            </div>
          </div>

          {/* Selected date/time summary (form step) */}
          <AnimatePresence>
            {selectedDate && selectedSlot && (
              <motion.div key="summary" {...fadeUp}
                className="px-4 py-3 rounded-xl"
                style={{ borderLeft: `4px solid ${TERTIARY}`, background: `${TERTIARY}18` }}>
                <p className="text-sm font-semibold" style={{ color: ON_SURF }}>
                  {format(selectedDate, "EEEE, MMMM d, yyyy")}
                </p>
                <p className="text-sm mt-0.5" style={{ color: ON_VAR }}>
                  {format(new Date(selectedSlot.start), "h:mm a")} – {format(new Date(selectedSlot.end), "h:mm a")}
                </p>
              </motion.div>
            )}
          </AnimatePresence>


        </section>

        {/* ────────────── RIGHT PANEL ────────────── */}
        <section className="w-full md:w-7/12 p-8 md:p-10" style={{ background: SURFACE }}>

          {/* Back button row */}
          {step !== "type" && (
            <div className="h-6 mb-7">
              <AnimatePresence>
                <motion.button key="back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={goBack}
                  className="flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer"
                  style={{ color: ON_VAR }}>
                  <IconBack color={ON_VAR} />
                  Back
                </motion.button>
              </AnimatePresence>
            </div>
          )}

          <AnimatePresence mode="wait">

            {/* ── STEP: type ── */}
            {step === "type" && (
              <motion.div key="type" {...fadeUp}>
                <h2 className="text-lg font-bold tracking-tight mb-8" style={{ color: ON_SURF }}>Select a Meeting Type</h2>
                <div className="space-y-3">
                  {host.eventTypes.map((ev, i) => (
                    <TypeCard key={ev.id} ev={ev} delay={i * 0.07}
                      onClick={() => { setSelectedEvent(ev); setStep("date"); }} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── STEP: date + time (combined) ── */}
            {step === "date" && (
              <motion.div key="date" {...fadeUp} className="flex flex-col md:flex-row gap-8">
                {/* Calendar */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold tracking-tight mb-8" style={{ color: ON_SURF }}>Select a Date</h2>
                  <Cal
                    month={currentMonth} onMonth={(m) => { setCurrentMonth(m); }}
                    selected={selectedDate}
                    onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); }}
                    available={availableDates} loading={loadingDays}
                  />
                </div>

                {/* Time slots */}
                <div className="w-full md:w-44 flex flex-col shrink-0">
                  <h2 className="text-lg font-bold tracking-tight mb-8" style={{ color: ON_SURF }}>Select a Time</h2>

                  {!selectedDate ? (
                    <p className="text-sm" style={{ color: ON_VAR }}>← Pick a date first</p>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-4"
                        style={{ color: "rgba(75,85,99,0.6)" }}>
                        {format(selectedDate, "EEE, MMM d")}
                      </p>

                      <div className="space-y-2 overflow-y-auto flex-1 pr-2" style={{ maxHeight: 380 }}>
                        {loadingSlots
                          ? Array.from({ length: 6 }).map((_, i) => (
                              <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: OUTLINE }} />
                            ))
                          : slots.length === 0
                          ? <p className="text-sm" style={{ color: ON_VAR }}>No slots available for this day.</p>
                          : slots.map((s) => (
                              <SlotButton key={s.start} s={s}
                                selected={!!(selectedSlot && selectedSlot.start === s.start)}
                                onClick={() => setSelectedSlot(s)} />
                            ))
                        }
                      </div>

                      {selectedSlot && (
                        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${OUTLINE}` }}>
                          <button
                            onClick={() => setStep("form")}
                            className="w-full py-3.5 rounded-xl font-black uppercase tracking-wider text-[11px] flex items-center justify-center gap-2 transition-all cursor-pointer"
                            style={{ background: PRIMARY, color: ON_SURF }}>
                            Confirm Time
                            <IconArrow />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── STEP: form ── */}
            {step === "form" && (
              <motion.div key="form" {...fadeUp}>
                <h2 className="text-lg font-bold tracking-tight mb-2" style={{ color: ON_SURF }}>Your Details</h2>
                <p className="text-sm mb-8" style={{ color: ON_VAR }}>We&apos;ll send a calendar invite to your email</p>

                <div className="space-y-5 max-w-sm">
                  <FormField label="Name" type="text" value={guestName}
                    onChange={setGuestName} placeholder="Your full name" />
                  <FormField label="Email" type="email" value={guestEmail}
                    onChange={setGuestEmail} placeholder="you@example.com" />

                  <div>
                    <label className="block text-[10px] font-bold tracking-widest uppercase mb-2"
                      style={{ color: "rgba(75,85,99,0.7)" }}>
                      Notes <span className="normal-case tracking-normal font-normal text-[9px]">(optional)</span>
                    </label>
                    <NotesField value={notes} onChange={setNotes} />
                  </div>

                  <button onClick={handleBook} disabled={!guestName || !guestEmail || booking}
                    className="w-full py-3.5 rounded-xl font-black uppercase tracking-wider text-[11px] flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: PRIMARY, color: ON_SURF }}>
                    {booking ? (
                      <>
                        <div className="w-4 h-4 rounded-full animate-spin"
                          style={{ border: "2px solid rgba(31,41,55,0.2)", borderTopColor: ON_SURF }} />
                        Booking…
                      </>
                    ) : (
                      <>Confirm Booking <IconArrow /></>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </section>
      </div>

      {/* Powered by */}
      <div className="fixed bottom-0 left-0 right-0 text-center text-sm py-3" style={{ color: "rgba(75,85,99,0.55)", background: BG }}>
        Powered by <strong style={{ color: "rgba(75,85,99,0.8)" }}>NeuralArc Inc</strong>
      </div>
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────── */

function TypeCard({ ev, delay, onClick }: { ev: EventType; delay: number; onClick: () => void }) {
  const { hovered, bind } = useHover();
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      onClick={onClick} {...bind}
      className="w-full text-left p-5 rounded-xl transition-all cursor-pointer flex items-center justify-between gap-4"
      style={{
        border: `1px solid ${hovered ? SECONDARY : OUTLINE}`,
        background: hovered ? SECONDARY_A10 : SURFACE,
      }}>
      <div className="min-w-0">
        <p className="font-bold text-[15px]" style={{ color: ON_SURF }}>{ev.title}</p>
        <p className="text-sm mt-0.5 truncate" style={{ color: ON_VAR }}>{ev.description}</p>
      </div>
      <div className="shrink-0 px-3 py-1.5 rounded-lg text-sm font-black"
        style={{ background: PRIMARY_A55, color: ON_SURF }}>
        {ev.duration}m
      </div>
    </motion.button>
  );
}

function SlotButton({ s, selected, onClick }: { s: Slot; selected: boolean; onClick: () => void }) {
  const { hovered, bind } = useHover();
  return (
    <button onClick={onClick} {...bind}
      className="w-full py-3.5 text-sm font-bold rounded-xl transition-all cursor-pointer text-center"
      style={{
        border: selected ? `2px solid ${PRIMARY}` : `1px solid ${hovered ? SECONDARY : OUTLINE}`,
        background: selected ? `${SURF_LOW}` : hovered ? SECONDARY_A09 : SURFACE,
        color: ON_SURF,
      }}>
      {format(new Date(s.start), "h:mm a")}
      {selected && (
        <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded font-black uppercase"
          style={{ background: "#EFB3AF", color: ON_SURF }}>
          ✓
        </span>
      )}
    </button>
  );
}

function FormField({ label, type, value, onChange, placeholder }: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="block text-[10px] font-bold tracking-widest uppercase mb-2"
        style={{ color: "rgba(75,85,99,0.7)" }}>{label}</label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        className="w-full px-4 py-3 rounded-xl text-sm transition-all outline-none"
        style={{
          border: `1px solid ${focused ? SECONDARY : OUTLINE}`,
          boxShadow: focused ? `0 0 0 3px ${SECONDARY_A20}` : "none",
          color: ON_SURF,
          background: SURFACE,
          colorScheme: "light",
        }}
      />
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value} onChange={(e) => onChange(e.target.value)}
      placeholder="Anything helpful to know beforehand?"
      rows={3}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className="w-full px-4 py-3 rounded-xl text-sm resize-none transition-all outline-none"
      style={{
        border: `1px solid ${focused ? SECONDARY : OUTLINE}`,
        boxShadow: focused ? `0 0 0 3px ${SECONDARY_A20}` : "none",
        color: ON_SURF,
        background: SURFACE,
        colorScheme: "light",
      }}
    />
  );
}

/* ── Calendar ─────────────────────────────────────────────────── */
function Cal({ month, onMonth, selected, onSelect, available, loading }: {
  month: Date; onMonth: (d: Date) => void; selected: Date | null;
  onSelect: (d: Date) => void; available: string[]; loading: boolean;
}) {
  const ms = startOfMonth(month), me = endOfMonth(ms);
  const cs = startOfWeek(ms), ce = endOfWeek(me);
  const today = startOfDay(new Date());
  const days: Date[] = [];
  let d = cs;
  while (d <= ce) { days.push(d); d = addDays(d, 1); }

  return (
    <div className="select-none w-full">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-6">
        <span className="font-bold text-sm uppercase tracking-widest" style={{ color: ON_SURF }}>
          {format(month, "MMMM yyyy")}
        </span>
        <div className="flex gap-1">
          <NavBtn onClick={() => onMonth(subMonths(month, 1))} disabled={isSameMonth(month, today)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ON_VAR} strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </NavBtn>
          <NavBtn onClick={() => onMonth(addMonths(month, 1))}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ON_VAR} strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </NavBtn>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-y-2 text-center mb-2">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((w) => (
          <div key={w} className="text-[9px] font-bold tracking-widest uppercase"
            style={{ color: "rgba(75,85,99,0.55)" }}>{w}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const inM   = isSameMonth(day, month);
          const avail = available.includes(format(day, "yyyy-MM-dd"));
          const sel   = !!(selected && isSameDay(day, selected));
          const past  = !isAfter(day, today) && !isSameDay(day, today);
          const todayDay = isToday(day) && inM;
          const dis   = past || !inM || (!avail && !loading);

          if (!inM) return <div key={day.toISOString()} className="aspect-square" />;

          return (
            <DayCell key={day.toISOString()} day={day} sel={sel} dis={dis}
              avail={avail} todayDay={todayDay}
              onClick={() => !dis && avail && onSelect(day)} />
          );
        })}
      </div>

      {loading && (
        <p className="text-[11px] text-center mt-4 animate-pulse" style={{ color: "rgba(75,85,99,0.5)" }}>
          Checking availability…
        </p>
      )}
    </div>
  );
}

function DayCell({ day, sel, dis, avail, todayDay, onClick }: {
  day: Date; sel: boolean; dis: boolean; avail: boolean; todayDay: boolean; onClick: () => void;
}) {
  const { hovered, bind } = useHover();
  const bg = sel ? PRIMARY : hovered && !dis && avail ? SECONDARY_A20 : "transparent";
  const color = sel ? ON_SURF : dis ? "rgba(31,41,55,0.2)" : ON_SURF;
  const ring = sel
    ? `0 0 0 2px ${PRIMARY_A55}`
    : todayDay
    ? `0 0 0 1px ${SECONDARY_A53} inset`
    : "none";

  return (
    <button onClick={onClick} disabled={dis} {...bind}
      className="aspect-square flex items-center justify-center text-sm rounded-xl transition-all"
      style={{
        background: bg,
        color,
        fontWeight: sel ? "700" : "500",
        boxShadow: ring,
        cursor: dis ? "not-allowed" : "pointer",
        fontSize: "13px",
      }}>
      {format(day, "d")}
    </button>
  );
}

function NavBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  const { hovered, bind } = useHover();
  return (
    <button onClick={onClick} disabled={disabled} {...bind}
      className="p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ background: hovered ? SURF_LOW : "transparent" }}>
      {children}
    </button>
  );
}
