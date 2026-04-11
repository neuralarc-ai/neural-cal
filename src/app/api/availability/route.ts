import { NextRequest, NextResponse } from "next/server";
import { getPublicAuth, getConfig, getFreeBusySlots, normalizeAvailability } from "@/lib/google";

/**
 * Convert a date string + time (in a specific timezone) to a UTC Date object.
 * 
 * E.g. toUTC("2026-03-30", 21, 30, "Asia/Calcutta") returns the UTC Date
 * that corresponds to 9:30 PM IST on March 30, 2026.
 */
function toUTC(dateStr: string, hours: number, minutes: number, tz: string): Date {
  // Parse the target date components
  const [y, m, d] = dateStr.split("-").map(Number);
  
  // Create a target wall-clock time as if it were UTC (just for arithmetic)
  const targetWall = Date.UTC(y, m - 1, d, hours, minutes, 0);
  
  // Make a first guess: assume the UTC instant is the same as the wall-clock
  const guess = new Date(targetWall);
  
  // Check what wall-clock time this guess actually represents in the target TZ
  const wallOfGuess = getWallClockMs(guess, tz);
  
  // The difference tells us the offset: wallOfGuess - guess = offset
  // So the correct UTC = targetWall - offset = targetWall - (wallOfGuess - guess)
  // = targetWall - wallOfGuess + guess = guess - (wallOfGuess - targetWall)
  const corrected = new Date(guess.getTime() - (wallOfGuess - targetWall));
  
  // Do a second pass to handle DST edge cases
  const wallOfCorrected = getWallClockMs(corrected, tz);
  if (wallOfCorrected !== targetWall) {
    // Apply one more correction
    return new Date(corrected.getTime() - (wallOfCorrected - targetWall));
  }
  
  return corrected;
}

/**
 * Given a UTC Date, return the wall-clock time in the given timezone
 * as milliseconds since epoch (treating the wall-clock components as UTC).
 */
function getWallClockMs(utcDate: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? "0");
  
  let hour = get("hour");
  if (hour === 24) hour = 0;
  
  return Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const duration = parseInt(searchParams.get("duration") || "30");
  const guestTimezone = searchParams.get("timezone"); // Guest's timezone for display

  if (!date) {
    return NextResponse.json({ error: "Missing date" }, { status: 400 });
  }

  if (!process.env.CEO_GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ slots: [], timezone: "America/New_York" });
  }

  try {
    const auth = getPublicAuth();
    const config = await getConfig(auth);
    const { schedule, timezone: hostTimezone } = normalizeAvailability(config.availability);
    
    // Use guest's timezone for display if provided, otherwise fall back to host's
    const displayTimezone = guestTimezone || hostTimezone;

    // Compute day-of-week in the HOST's configured timezone (not server TZ)
    const noonUTC = new Date(`${date}T12:00:00Z`);
    const dayParts = new Intl.DateTimeFormat("en-US", {
      timeZone: hostTimezone,
      weekday: "short",
    }).formatToParts(noonUTC);
    const weekdayStr = dayParts.find(p => p.type === "weekday")!.value;
    const dayMap: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dayOfWeek = dayMap[weekdayStr];

    const daySchedule = schedule[dayOfWeek];
    const allowedDays = schedule
      .map((d, i) => (d.enabled ? i : -1))
      .filter(i => i >= 0);

    if (!daySchedule?.enabled) {
      return NextResponse.json({ slots: [], timezone: displayTimezone, hostTimezone, availableDays: allowedDays });
    }

    // Build timezone-aware day boundaries for FreeBusy query (using HOST's timezone)
    const dayStartUTC = toUTC(date, 0, 0, hostTimezone);
    const dayEndUTC = toUTC(date, 23, 59, hostTimezone);

    let busySlots: { start: string; end: string }[] = [];
    try {
      busySlots = await getFreeBusySlots(
        auth,
        dayStartUTC.toISOString(),
        dayEndUTC.toISOString()
      );
    } catch (error) {
      console.error("Error fetching busy slots:", error);
    }

    const timeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: displayTimezone, // Format display times in GUEST's timezone
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const hostTimeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: hostTimezone, // Format display times in HOST's timezone
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const slots: {
      start: string; end: string;
      displayStart: string; displayEnd: string;
      hostDisplayStart: string; hostDisplayEnd: string;
      guestDate: string; isNight: boolean;
    }[] = [];
    const now = new Date();

    for (const range of daySchedule.ranges) {
      const [startH, startM] = range.start.split(":").map(Number);
      const [endH, endM] = range.end.split(":").map(Number);
      const rangeEndMinutes = endH * 60 + endM;

      for (
        let min = startH * 60 + startM;
        min + duration <= rangeEndMinutes;
        min += duration
      ) {
        const slotH = Math.floor(min / 60);
        const slotM = min % 60;

        // Calculate slot times using HOST's timezone (availability is defined in host's TZ)
        const slotStart = toUTC(date, slotH, slotM, hostTimezone);
        const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

        // Skip past slots
        if (slotStart <= now) continue;

        // Check Google Calendar conflicts
        const conflict = busySlots.some(
          busy =>
            slotStart < new Date(busy.end) && slotEnd > new Date(busy.start)
        );
        if (conflict) continue;

        // Compute guest-perspective date and social-hour flag
        const guestDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: displayTimezone,
        }).format(slotStart);

        const guestHour = parseInt(
          new Intl.DateTimeFormat("en-US", { timeZone: displayTimezone, hour: "numeric", hour12: false })
            .formatToParts(slotStart)
            .find(p => p.type === "hour")?.value ?? "12"
        ) % 24;

        slots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          displayStart: timeFmt.format(slotStart),
          displayEnd: timeFmt.format(slotEnd),
          hostDisplayStart: hostTimeFmt.format(slotStart),
          hostDisplayEnd: hostTimeFmt.format(slotEnd),
          guestDate,
          isNight: guestHour >= 21 || guestHour < 6,
        });
      }
    }

    return NextResponse.json({ slots, timezone: displayTimezone, hostTimezone, availableDays: allowedDays });
  } catch (error) {
    console.error("Error getting availability:", error);
    return NextResponse.json(
      { error: "Failed to get availability" },
      { status: 500 }
    );
  }
}
