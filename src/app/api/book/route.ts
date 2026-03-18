import { NextRequest, NextResponse } from "next/server";
import { getPublicAuth, getConfig, createBookingEvent } from "@/lib/google";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { eventTypeId, startTime, endTime, guestName, guestEmail, notes, timezone } = body;

  if (!eventTypeId || !startTime || !endTime || !guestName || !guestEmail) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!process.env.CEO_GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Booking service not configured" }, { status: 503 });
  }

  try {
    const auth = getPublicAuth();
    const config = await getConfig(auth);

    const eventType = config.eventTypes.find(
      (et) => et.id === eventTypeId || et.slug === eventTypeId
    );

    if (!eventType) {
      return NextResponse.json({ error: "Event type not found" }, { status: 404 });
    }

    const tz = timezone || config.availability.timezone;

    const result = await createBookingEvent(auth, {
      summary: `${eventType.title} with ${guestName}`,
      description: notes ? `Notes from ${guestName}: ${notes}` : `Meeting with ${guestName}`,
      startTime,
      endTime,
      attendeeEmail: guestEmail,
      timezone: tz,
      guestName,
      guestEmail,
      notes,
      eventTypeTitle: eventType.title,
      eventTypeDuration: eventType.duration,
      eventTypeColor: eventType.color,
    });

    return NextResponse.json({
      booking: {
        id: result.eventId,
        guestName,
        guestEmail,
        notes,
        startTime,
        endTime,
        meetLink: result.meetLink,
        status: "confirmed",
      },
      meetLink: result.meetLink,
      message: "Booking confirmed!",
    });
  } catch (error) {
    console.error("Error creating booking:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
