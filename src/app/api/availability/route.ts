import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFreeBusySlots } from "@/lib/google";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const date = searchParams.get("date");
  const duration = parseInt(searchParams.get("duration") || "30");

  if (!userId || !date) {
    return NextResponse.json({ error: "Missing userId or date" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { availability: true, accounts: true, blockedTimes: true },
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
  const dateObj = new Date(date + "T00:00:00");
  const dayOfWeek = dateObj.getDay();

  if (!allowedDays.includes(dayOfWeek)) {
    return NextResponse.json({ slots: [], availableDays: allowedDays });
  }

  const timeMin = new Date(date + `T00:00:00`).toISOString();
  const timeMax = new Date(date + `T23:59:59`).toISOString();

  // Google Calendar busy slots
  const googleAccount = user.accounts.find((a) => a.provider === "google");
  let busySlots: { start: string; end: string }[] = [];
  if (googleAccount?.access_token) {
    try {
      busySlots = await getFreeBusySlots(googleAccount.access_token, timeMin, timeMax);
    } catch (error) {
      console.error("Error fetching busy slots:", error);
    }
  }

  // Admin-blocked times
  const blockedForDay = user.blockedTimes.filter((bt) => {
    const btStart = new Date(bt.startTime);
    const btEnd = new Date(bt.endTime);
    const dayStart = new Date(date + "T00:00:00");
    const dayEnd = new Date(date + "T23:59:59");
    return btStart <= dayEnd && btEnd >= dayStart;
  });

  // Existing bookings for this day
  const existingBookings = await prisma.booking.findMany({
    where: {
      userId,
      status: "confirmed",
      startTime: { gte: new Date(timeMin) },
      endTime: { lte: new Date(timeMax) },
    },
  });

  const slots: { start: string; end: string }[] = [];

  for (let hour = availability.startHour; hour < availability.endHour; hour++) {
    for (let minute = 0; minute < 60; minute += duration) {
      const slotStart = new Date(date + `T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

      if (slotEnd.getHours() > availability.endHour ||
          (slotEnd.getHours() === availability.endHour && slotEnd.getMinutes() > 0)) {
        continue;
      }

      // Skip past slots
      if (slotStart <= new Date()) continue;

      // Check Google Calendar conflicts
      const googleConflict = busySlots.some((busy) => {
        return slotStart < new Date(busy.end) && slotEnd > new Date(busy.start);
      });
      if (googleConflict) continue;

      // Check admin blocked times
      const blockedConflict = blockedForDay.some((bt) => {
        return slotStart < new Date(bt.endTime) && slotEnd > new Date(bt.startTime);
      });
      if (blockedConflict) continue;

      // Check existing bookings
      const bookingConflict = existingBookings.some((b) => {
        return slotStart < new Date(b.endTime) && slotEnd > new Date(b.startTime);
      });
      if (bookingConflict) continue;

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
}
