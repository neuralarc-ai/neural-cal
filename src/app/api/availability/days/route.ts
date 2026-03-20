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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const availableDates: string[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, mon - 1, d);
      if (date < today) continue;
      if (!allowedDays.includes(date.getDay())) continue;

      const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      availableDates.push(dateStr);
    }

    return NextResponse.json({ availableDates, allowedDays, timezone });
  } catch (error) {
    console.error("Error getting available days:", error);
    return NextResponse.json({ error: "Failed to get available days" }, { status: 500 });
  }
}
