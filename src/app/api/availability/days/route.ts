import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const month = searchParams.get("month"); // format: 2026-03

  if (!userId || !month) {
    return NextResponse.json({ error: "Missing userId or month" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { availability: true, blockedTimes: true },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const availability = user.availability || {
    startHour: 9,
    endHour: 17,
    days: "1,2,3,4,5",
    timezone: "America/New_York",
  };

  const allowedDays = availability.days.split(",").map(Number);

  // Get all days in the month
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const availableDates: string[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, mon - 1, d);
    if (date < today) continue;
    if (!allowedDays.includes(date.getDay())) continue;

    // Check if entire day is blocked
    const dateStr = `${year}-${String(mon).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dateStr + "T23:59:59");

    const fullyBlocked = user.blockedTimes.some((bt) => {
      return bt.allDay && new Date(bt.startTime) <= dayStart && new Date(bt.endTime) >= dayEnd;
    });

    if (!fullyBlocked) {
      availableDates.push(dateStr);
    }
  }

  return NextResponse.json({
    availableDates,
    allowedDays,
    timezone: availability.timezone,
  });
}
