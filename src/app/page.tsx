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
type Step = "type" | "date" | "time" | "form" | "confirmed";

export default function PublicBookingPage() {
  const [host, setHost] = useState<HostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventType | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingDays, setLoadingDays] = useState(false);
  const [step, setStep] = useState<Step>("type");
  const [booking, setBooking] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [meetLink, setMeetLink] = useState("");
  const [timezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventTypeId: selectedEvent.id, startTime: selectedSlot.start, endTime: selectedSlot.end, guestName, guestEmail, notes, timezone }),
      });
      const data = await res.json();
      if (data.meetLink) setMeetLink(data.meetLink);
      setStep("confirmed");
    } catch { /* */ } finally { setBooking(false); }
  };

  const goBack = () => {
    if (step === "form") setStep("time");
    else if (step === "time") { setStep("date"); setSelectedSlot(null); }
    else if (step === "date") { setStep("type"); setSelectedEvent(null); setSelectedDate(null); }
  };

  const reset = () => { setStep("type"); setSelectedEvent(null); setSelectedDate(null); setSelectedSlot(null); setGuestName(""); setGuestEmail(""); setNotes(""); setMeetLink(""); };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" /></div>;
  if (error || !host) return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div><p className="text-2xl font-bold mb-2">Chronos</p><p className="text-muted text-sm">No host configured.</p><a href="/admin" className="text-sm mt-4 inline-block underline underline-offset-4">Set up admin →</a></div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-4">
          <span className="text-sm font-semibold tracking-wide uppercase">Chronos</span>
          <span className="text-xs text-muted">{timezone.replace(/_/g, " ")}</span>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Sidebar */}
          <div className="lg:w-72 shrink-0">
            <div className="lg:sticky lg:top-24 space-y-5">
              <div className="flex flex-col items-center text-center gap-3">
                {host.image && <img src={host.image} alt="" className="w-20 h-20 rounded-full grayscale" />}
                <div>
                  <p className="font-semibold text-lg">{host.name}</p>
                  <p className="text-sm text-muted mt-0.5">{host.bio}</p>
                </div>
              </div>
              {selectedEvent && (
                <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="border border-white/15 rounded-xl p-4 space-y-2">
                  <p className="font-medium text-sm">{selectedEvent.title}</p>
                  <p className="text-xs text-muted">{selectedEvent.duration} min · Google Meet</p>
                  <p className="text-xs text-muted leading-relaxed">{selectedEvent.description}</p>
                  {selectedDate && <p className="text-xs pt-1 border-t border-border mt-2">{format(selectedDate, "EEEE, MMM d, yyyy")}</p>}
                  {selectedSlot && <p className="text-xs">{format(new Date(selectedSlot.start), "h:mm a")} – {format(new Date(selectedSlot.end), "h:mm a")}</p>}
                </motion.div>
              )}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            {step !== "type" && step !== "confirmed" && (
              <button onClick={goBack} className="text-xs text-muted hover:text-foreground mb-5 flex items-center gap-1 cursor-pointer transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>Back
              </button>
            )}

            <AnimatePresence mode="wait">
              {step === "type" && (
                <motion.div key="type" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h1 className="text-xl sm:text-2xl font-bold mb-1">Book a meeting</h1>
                  <p className="text-muted text-sm mb-8">Choose a duration</p>
                  <div className="space-y-3">
                    {host.eventTypes.map((ev, i) => (
                      <motion.button key={ev.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                        onClick={() => { setSelectedEvent(ev); setStep("date"); }}
                        className="w-full text-left p-4 sm:p-5 rounded-xl border border-white/15 hover:border-white/30 bg-white/[0.03] hover:bg-white/[0.06] transition-all group cursor-pointer flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium">{ev.title}</p>
                          <p className="text-sm text-muted mt-0.5 truncate">{ev.description}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-lg font-bold">{ev.duration}</span>
                          <span className="text-xs text-muted ml-1">min</span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === "date" && (
                <motion.div key="date" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-bold mb-1">Pick a date</h2>
                  <p className="text-muted text-sm mb-6">Dates with availability are shown</p>
                  <Cal month={currentMonth} onMonth={setCurrentMonth} selected={selectedDate}
                    onSelect={(d) => { setSelectedDate(d); setSelectedSlot(null); setStep("time"); }}
                    available={availableDates} loading={loadingDays} />
                </motion.div>
              )}

              {step === "time" && (
                <motion.div key="time" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-bold mb-1">Pick a time</h2>
                  <p className="text-muted text-sm mb-6">{selectedDate && format(selectedDate, "EEEE, MMMM d")}</p>
                  {loadingSlots ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 bg-subtle rounded-lg animate-pulse" />)}</div>
                  ) : slots.length === 0 ? (
                    <div className="py-16 text-center text-muted"><p className="mb-2">No slots available</p><button onClick={() => setStep("date")} className="text-sm underline underline-offset-4 cursor-pointer text-foreground">Try another date</button></div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {slots.map((s) => (
                        <motion.button key={s.start} whileTap={{ scale: 0.97 }}
                          onClick={() => { setSelectedSlot(s); setStep("form"); }}
                          className="py-2.5 rounded-lg border border-white/15 hover:border-white/40 hover:bg-white/[0.05] text-sm font-medium transition-all cursor-pointer">
                          {format(new Date(s.start), "h:mm a")}
                        </motion.button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {step === "form" && (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <h2 className="text-xl font-bold mb-1">Your details</h2>
                  <p className="text-muted text-sm mb-6">Almost there</p>
                  <div className="space-y-4 max-w-md">
                    <div><label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">Name</label>
                      <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Your name" className="w-full px-4 py-3 rounded-lg bg-subtle border border-border focus:border-white/30 focus:outline-none text-sm placeholder:text-muted/40 transition-colors" /></div>
                    <div><label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">Email</label>
                      <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-3 rounded-lg bg-subtle border border-border focus:border-white/30 focus:outline-none text-sm placeholder:text-muted/40 transition-colors" /></div>
                    <div><label className="block text-xs text-muted mb-1.5 uppercase tracking-wider">Notes <span className="text-muted/50">(optional)</span></label>
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything to share beforehand?" rows={3} className="w-full px-4 py-3 rounded-lg bg-subtle border border-border focus:border-white/30 focus:outline-none text-sm placeholder:text-muted/40 resize-none transition-colors" /></div>
                    <button onClick={handleBook} disabled={!guestName || !guestEmail || booking}
                      className="w-full py-3 rounded-lg bg-white text-black font-medium text-sm hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2">
                      {booking ? <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />Booking...</> : "Confirm booking"}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === "confirmed" && (
                <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="py-12 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 250, damping: 15 }} className="w-16 h-16 rounded-full border-2 border-white flex items-center justify-center mx-auto mb-6">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                  </motion.div>
                  <h2 className="text-2xl font-bold mb-2">Confirmed</h2>
                  <p className="text-muted text-sm mb-8">Calendar invite sent to {guestEmail}</p>
                  <div className="border border-white/15 rounded-xl p-5 max-w-sm mx-auto text-left text-sm space-y-2.5">
                    <div className="flex justify-between"><span className="text-muted">Meeting</span><span className="font-medium">{selectedEvent?.title}</span></div>
                    <div className="flex justify-between"><span className="text-muted">Date</span><span className="font-medium">{selectedDate && format(selectedDate, "MMM d, yyyy")}</span></div>
                    <div className="flex justify-between"><span className="text-muted">Time</span><span className="font-medium">{selectedSlot && `${format(new Date(selectedSlot.start), "h:mm a")} – ${format(new Date(selectedSlot.end), "h:mm a")}`}</span></div>
                    {meetLink && <div className="pt-2 border-t border-border"><a href={meetLink} target="_blank" rel="noopener noreferrer" className="block w-full py-2.5 rounded-lg bg-white text-black text-center font-medium text-sm cursor-pointer hover:bg-white/90">Join Google Meet</a></div>}
                  </div>
                  <button onClick={reset} className="text-sm text-muted mt-6 underline underline-offset-4 cursor-pointer hover:text-foreground">Book another</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}

function Cal({ month, onMonth, selected, onSelect, available, loading }: {
  month: Date; onMonth: (d: Date) => void; selected: Date | null; onSelect: (d: Date) => void; available: string[]; loading: boolean;
}) {
  const ms = startOfMonth(month), me = endOfMonth(ms);
  const cs = startOfWeek(ms), ce = endOfWeek(me);
  const today = startOfDay(new Date());
  const days: Date[] = []; let d = cs; while (d <= ce) { days.push(d); d = addDays(d, 1); }

  return (
    <div className="max-w-sm select-none">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => onMonth(subMonths(month, 1))} disabled={isSameMonth(month, today)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-subtle transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <span className="text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
        <button onClick={() => onMonth(addMonths(month, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-subtle transition-colors cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(w => <div key={w} className="text-[10px] text-muted text-center py-1.5 font-medium uppercase">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day) => {
          const inM = isSameMonth(day, month);
          const avail = available.includes(format(day, "yyyy-MM-dd"));
          const sel = selected && isSameDay(day, selected);
          const past = !isAfter(day, today) && !isSameDay(day, today);
          const dis = past || !inM || (!avail && !loading);
          return (
            <button key={day.toISOString()} onClick={() => !dis && avail && onSelect(day)} disabled={dis}
              className={`aspect-square flex items-center justify-center rounded-lg text-sm transition-all relative
                ${!inM ? "invisible" : ""} ${dis ? "text-white/10 cursor-not-allowed" : "cursor-pointer"}
                ${avail && !sel ? "text-white hover:bg-subtle font-medium" : ""}
                ${sel ? "bg-white text-black font-bold" : ""}
              `}>
              {format(day, "d")}
              {isToday(day) && inM && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-white/50" />}
            </button>
          );
        })}
      </div>
      {loading && <p className="text-xs text-muted text-center mt-3 animate-pulse">Loading...</p>}
    </div>
  );
}
