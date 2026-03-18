import { NextRequest, NextResponse } from "next/server";
import { getPublicAuth, getConfig, getFreeBusySlots } from "@/lib/google";

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
    const availability = config.availability;

    const allowedDays = availability.days.split(",").map(Number);
    const dateObj = new Date(date + "T00:00:00");
    const dayOfWeek = dateObj.getDay();

    if (!allowedDays.includes(dayOfWeek)) {
      return NextResponse.json({ slots: [], timezone: availability.timezone, availableDays: allowedDays });
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

    for (let hour = availability.startHour; hour < availability.endHour; hour++) {
      for (let minute = 0; minute < 60; minute += duration) {
        const slotStart = new Date(
          `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
        );
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

        // Skip if slot goes past end hour
        if (
          slotEnd.getHours() > availability.endHour ||
          (slotEnd.getHours() === availability.endHour && slotEnd.getMinutes() > 0)
        ) {
          continue;
        }

        // Skip past slots
        if (slotStart <= new Date()) continue;

        // Check Google Calendar conflicts (covers bookings + blocked times)
        const conflict = busySlots.some(
          (busy) => slotStart < new Date(busy.end) && slotEnd > new Date(busy.start)
        );
        if (conflict) continue;

        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
        });
      }
    }

    return NextResponse.json({
      slots,
      timezone: availability.timezone,
      availableDays: allowedDays,
    });
  } catch (error) {
    console.error("Error getting availability:", error);
    return NextResponse.json({ error: "Failed to get availability" }, { status: 500 });
  }
}
