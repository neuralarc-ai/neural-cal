import { NextRequest, NextResponse } from "next/server";
import { getPublicAuth, getConfig, normalizeAvailability } from "@/lib/google";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // format: 2026-03

  if (!month) {
    return NextResponse.json({ error: "Missing month" }, { status: 400 });
  }

  if (!process.env.CEO_GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ availableDates: [], allowedDays: [1, 2, 3, 4, 5], timezone: "America/New_York" });
  }

  try {
    const auth = getPublicAuth();
    const config = await getConfig(auth);
    const { schedule, timezone } = normalizeAvailability(config.availability);

    const allowedDays = schedule.map((d, i) => d.enabled ? i : -1).filter(i => i >= 0);
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();

    // Get today's date in the configured timezone (not server TZ)
    const nowInTZ = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const todayStr = nowInTZ; // format: YYYY-MM-DD

    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

    const availableDates: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (dateStr < todayStr) continue;

      // Get the day-of-week in the configured timezone
      const noonUTC = new Date(`${dateStr}T12:00:00Z`);
      const dayParts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).formatToParts(noonUTC);
      const weekdayStr = dayParts.find(p => p.type === "weekday")!.value;
      if (!allowedDays.includes(dayMap[weekdayStr])) continue;

      availableDates.push(dateStr);
    }

    return NextResponse.json({ availableDates, allowedDays, timezone });
  } catch (error) {
    console.error("Error getting available days:", error);
    return NextResponse.json({ error: "Failed to get available days" }, { status: 500 });
  }
}
