import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCalendarEvent } from "@/lib/google";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { eventTypeId, startTime, endTime, guestName, guestEmail, notes, timezone } = body;

  if (!eventTypeId || !startTime || !endTime || !guestName || !guestEmail) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const eventType = await prisma.eventType.findUnique({
    where: { id: eventTypeId },
    include: {
      user: {
        include: { accounts: true, availability: true },
      },
    },
  });

  if (!eventType) {
    return NextResponse.json({ error: "Event type not found" }, { status: 404 });
  }

  const googleAccount = eventType.user.accounts.find((a) => a.provider === "google");
  let meetLink: string | undefined;

  if (googleAccount?.access_token) {
    try {
      const result = await createCalendarEvent(googleAccount.access_token, {
        summary: `${eventType.title} with ${guestName}`,
        description: notes ? `Notes: ${notes}` : undefined,
        startTime,
        endTime,
        attendeeEmail: guestEmail,
        timezone: timezone || eventType.user.availability?.timezone || "America/New_York",
      });
      meetLink = result.meetLink || undefined;
    } catch (error) {
      console.error("Error creating calendar event:", error);
    }
  }

  const booking = await prisma.booking.create({
    data: {
      title: `${eventType.title} with ${guestName}`,
      guestName,
      guestEmail,
      notes,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      meetLink,
      eventTypeId,
      userId: eventType.userId,
    },
  });

  return NextResponse.json({
    booking,
    meetLink,
    message: "Booking confirmed!",
  });
}
