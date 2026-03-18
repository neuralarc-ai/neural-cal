import { google } from "googleapis";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EventType {
  id: string;
  slug: string;
  title: string;
  description: string;
  duration: number;
  color: string;
}

export interface AvailabilityConfig {
  startHour: number;
  endHour: number;
  days: string;
  timezone: string;
}

export interface ChronosConfig {
  eventTypes: EventType[];
  availability: AvailabilityConfig;
  bio: string;
}

export const DEFAULT_CONFIG: ChronosConfig = {
  eventTypes: [
    {
      id: "quick-chat",
      slug: "quick-chat",
      title: "Quick Chat",
      description: "A brief 15-minute conversation to discuss quick questions or ideas.",
      duration: 15,
      color: "#10b981",
    },
    {
      id: "standard-meeting",
      slug: "standard-meeting",
      title: "Standard Meeting",
      description: "A 30-minute meeting for discussions, planning, or collaboration.",
      duration: 30,
      color: "#6366f1",
    },
    {
      id: "deep-dive",
      slug: "deep-dive",
      title: "Deep Dive",
      description: "A full 60-minute session for in-depth discussions or workshops.",
      duration: 60,
      color: "#f59e0b",
    },
  ],
  availability: {
    startHour: 9,
    endHour: 17,
    days: "1,2,3,4,5",
    timezone: "America/New_York",
  },
  bio: "Schedule a meeting with me",
};

// ─── Auth Helpers ─────────────────────────────────────────────────────────────

/** For public routes — uses CEO_GOOGLE_REFRESH_TOKEN env var */
export function getPublicAuth() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.CEO_GOOGLE_REFRESH_TOKEN });
  return auth;
}

/** For admin routes — uses the CEO's session tokens */
export function getAdminAuth(accessToken: string, refreshToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return auth;
}

// ─── CEO Profile ──────────────────────────────────────────────────────────────

export async function getCEOProfile() {
  try {
    const auth = getPublicAuth();
    const oauth2 = google.oauth2({ version: "v2", auth });
    const { data } = await oauth2.userinfo.get();
    return {
      name: data.name || "CEO",
      email: data.email || "",
      picture: data.picture || "",
    };
  } catch {
    return { name: "CEO", email: "", picture: "" };
  }
}

// ─── Config (stored as a hidden calendar event) ───────────────────────────────

export async function getConfig(auth: ReturnType<typeof getPublicAuth>): Promise<ChronosConfig> {
  try {
    const calendar = google.calendar({ version: "v3", auth });
    const res = await calendar.events.list({
      calendarId: "primary",
      privateExtendedProperty: ["chronosConfig=true"],
      maxResults: 1,
      showDeleted: false,
    });
    const event = res.data.items?.[0];
    if (!event?.description) return DEFAULT_CONFIG;
    return JSON.parse(event.description) as ChronosConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(
  auth: ReturnType<typeof getPublicAuth>,
  config: ChronosConfig
): Promise<void> {
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId: "primary",
    privateExtendedProperty: ["chronosConfig=true"],
    maxResults: 1,
  });
  const existing = res.data.items?.[0];

  const eventBody = {
    summary: "__CHRONOS_CONFIG__",
    description: JSON.stringify(config),
    start: { date: "2099-01-01" },
    end: { date: "2099-01-02" },
    extendedProperties: { private: { chronosConfig: "true" } },
    visibility: "private" as const,
    transparency: "transparent" as const,
  };

  if (existing?.id) {
    await calendar.events.update({
      calendarId: "primary",
      eventId: existing.id,
      requestBody: eventBody,
    });
  } else {
    await calendar.events.insert({
      calendarId: "primary",
      requestBody: eventBody,
    });
  }
}

// ─── Free/Busy ────────────────────────────────────────────────────────────────

export async function getFreeBusySlots(
  auth: ReturnType<typeof getPublicAuth>,
  timeMin: string,
  timeMax: string,
  calendarId = "primary"
) {
  const calendar = google.calendar({ version: "v3", auth });
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });
  const busy = response.data.calendars?.[calendarId]?.busy || [];
  return busy.map((slot) => ({ start: slot.start!, end: slot.end! }));
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export async function createBookingEvent(
  auth: ReturnType<typeof getPublicAuth>,
  event: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmail: string;
    timezone: string;
    guestName: string;
    guestEmail: string;
    notes?: string;
    eventTypeTitle: string;
    eventTypeDuration: number;
    eventTypeColor: string;
  }
) {
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime, timeZone: event.timezone },
      end: { dateTime: event.endTime, timeZone: event.timezone },
      attendees: [{ email: event.attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: `chronos-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      extendedProperties: {
        private: {
          chronosBooking: "true",
          guestName: event.guestName,
          guestEmail: event.guestEmail,
          notes: event.notes || "",
          eventTypeTitle: event.eventTypeTitle,
          eventTypeDuration: String(event.eventTypeDuration),
          eventTypeColor: event.eventTypeColor,
        },
      },
    },
  });

  return {
    eventId: response.data.id,
    meetLink:
      response.data.hangoutLink ||
      response.data.conferenceData?.entryPoints?.[0]?.uri,
    htmlLink: response.data.htmlLink,
  };
}

export async function listBookings(auth: ReturnType<typeof getPublicAuth>) {
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId: "primary",
    privateExtendedProperty: ["chronosBooking=true"],
    orderBy: "startTime",
    singleEvents: true,
    // Include bookings from past year
    timeMin: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    showDeleted: false,
  });

  return (res.data.items || []).map((event) => {
    const props = event.extendedProperties?.private || {};
    return {
      id: event.id,
      title: event.summary,
      guestName: props.guestName,
      guestEmail: props.guestEmail,
      notes: props.notes || null,
      startTime: event.start?.dateTime || event.start?.date,
      endTime: event.end?.dateTime || event.end?.date,
      meetLink:
        event.hangoutLink ||
        (event.conferenceData?.entryPoints?.[0]?.uri ?? null),
      status: event.status === "cancelled" ? "cancelled" : "confirmed",
      eventType: {
        title: props.eventTypeTitle || "Meeting",
        duration: parseInt(props.eventTypeDuration || "30"),
        color: props.eventTypeColor || "#6366f1",
      },
    };
  });
}

// ─── Blocked Times ────────────────────────────────────────────────────────────

export async function createBlockedTimeEvent(
  auth: ReturnType<typeof getPublicAuth>,
  blocked: {
    startTime: string;
    endTime: string;
    reason?: string;
    allDay: boolean;
  }
) {
  const calendar = google.calendar({ version: "v3", auth });

  const startDate = blocked.startTime.split("T")[0];
  const endDate = blocked.endTime.split("T")[0];

  const requestBody: any = {
    summary: blocked.reason || "Blocked",
    start: blocked.allDay ? { date: startDate } : { dateTime: blocked.startTime },
    end: blocked.allDay ? { date: endDate } : { dateTime: blocked.endTime },
    extendedProperties: {
      private: {
        chronosBlocked: "true",
        reason: blocked.reason || "",
        allDay: blocked.allDay ? "true" : "false",
      },
    },
    transparency: "opaque",
  };

  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody,
  });

  return {
    id: response.data.id,
    startTime: blocked.startTime,
    endTime: blocked.endTime,
    reason: blocked.reason || null,
    allDay: blocked.allDay,
  };
}

export async function listBlockedTimes(auth: ReturnType<typeof getPublicAuth>) {
  const calendar = google.calendar({ version: "v3", auth });

  const res = await calendar.events.list({
    calendarId: "primary",
    privateExtendedProperty: ["chronosBlocked=true"],
    orderBy: "startTime",
    singleEvents: true,
    showDeleted: false,
  });

  return (res.data.items || []).map((event) => {
    const props = event.extendedProperties?.private || {};
    const isAllDay = props.allDay === "true";
    return {
      id: event.id,
      startTime: isAllDay
        ? (event.start?.date || "") + "T00:00:00"
        : event.start?.dateTime || "",
      endTime: isAllDay
        ? (event.end?.date || "") + "T23:59:59"
        : event.end?.dateTime || "",
      reason: props.reason || null,
      allDay: isAllDay,
    };
  });
}

export async function deleteCalendarEvent(
  auth: ReturnType<typeof getPublicAuth>,
  eventId: string
) {
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId });
}
