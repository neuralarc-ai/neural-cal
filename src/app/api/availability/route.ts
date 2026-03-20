import { NextRequest, NextResponse } from "next/server";
import { getPublicAuth, getConfig, getFreeBusySlots, normalizeAvailability } from "@/lib/google";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const duration = parseInt(searchParams.get("duration") || "30");

  if (!date) {
    return NextResponse.json({ error: "Missing date" }, { status: 400 });
  }

  if (!process.env.CEO_GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ slots: [], timezone: "America/New_York" });
  }

  try {
    const auth = getPublicAuth();
    const config = await getConfig(auth);
    const { schedule, timezone } = normalizeAvailability(config.availability);

    const dateObj = new Date(date + "T00:00:00");
    const dayOfWeek = dateObj.getDay();
    const daySchedule = schedule[dayOfWeek];
    const allowedDays = schedule.map((d, i) => d.enabled ? i : -1).filter(i => i >= 0);

    if (!daySchedule.enabled) {
      return NextResponse.json({ slots: [], timezone, availableDays: allowedDays });
    }

    const timeMin = new Date(date + "T00:00:00").toISOString();
    const timeMax = new Date(date + "T23:59:59").toISOString();

    // Get busy slots from Google Calendar (includes existing bookings + blocked times automatically)
    let busySlots: { start: string; end: string }[] = [];
    try {
      busySlots = await getFreeBusySlots(auth, timeMin, timeMax);
    } catch (error) {
      console.error("Error fetching busy slots:", error);
    }

    const slots: { start: string; end: string }[] = [];

    for (const range of daySchedule.ranges) {
      const [startH, startM] = range.start.split(":").map(Number);
      const [endH, endM]     = range.end.split(":").map(Number);
      const rangeEndMinutes  = endH * 60 + endM;

      for (let min = startH * 60 + startM; min < rangeEndMinutes; min += duration) {
        const slotH = Math.floor(min / 60);
        const slotM = min % 60;
        const slotStart = new Date(
          `${date}T${String(slotH).padStart(2, "0")}:${String(slotM).padStart(2, "0")}:00`
        );
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

        // Skip if slot goes past range end
        if (slotEnd.getHours() * 60 + slotEnd.getMinutes() > rangeEndMinutes) continue;

        // Skip past slots
        if (slotStart <= new Date()) continue;

        // Check Google Calendar conflicts
        const conflict = busySlots.some(
          (busy) => slotStart < new Date(busy.end) && slotEnd > new Date(busy.start)
        );
        if (conflict) continue;

        slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
      }
    }

    return NextResponse.json({ slots, timezone, availableDays: allowedDays });
  } catch (error) {
    console.error("Error getting availability:", error);
    return NextResponse.json({ error: "Failed to get availability" }, { status: 500 });
  }
}
