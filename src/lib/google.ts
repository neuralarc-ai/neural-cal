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

export interface TimeRange {
  start: string; // "HH:MM"
  end: string;   // "HH:MM"
}

export interface DaySchedule {
  enabled: boolean;
  ranges: TimeRange[];
}

export interface AvailabilityConfig {
  timezone: string;
  schedule: DaySchedule[]; // index 0=Sunday … 6=Saturday
  // Legacy fields kept for backward-compat reads
  startHour?: number;
  endHour?: number;
  days?: string;
}

/** Normalise either the new or legacy format into the canonical shape. */
export function normalizeAvailability(avail: AvailabilityConfig): { schedule: DaySchedule[]; timezone: string } {
  if (avail.schedule) return { schedule: avail.schedule, timezone: avail.timezone };
  const enabledDays = (avail.days ?? "1,2,3,4,5").split(",").map(Number);
  const start = `${String(avail.startHour ?? 9).padStart(2, "0")}:00`;
  const end   = `${String(avail.endHour   ?? 17).padStart(2, "0")}:00`;
  return {
    timezone: avail.timezone ?? "America/New_York",
    schedule: Array.from({ length: 7 }, (_, i) => ({
      enabled: enabledDays.includes(i),
      ranges: [{ start, end }],
    })),
  };
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
    timezone: "America/New_York",
    schedule: Array.from({ length: 7 }, (_, i) => ({
      enabled: [1, 2, 3, 4, 5].includes(i),
      ranges: [{ start: "09:00", end: "17:00" }],
    })),
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
    orderBy: "startTime",
    singleEvents: true,
    timeMin: new Date().toISOString(),
    showDeleted: false,
  });

  return (res.data.items || [])
    .filter((event) => {
      const props = event.extendedProperties?.private || {};
      // Skip internal Chronos config/blocked events
      if (props.chronosConfig === "true") return false;
      if (props.chronosBlocked === "true") return false;
      // Skip all-day events with no time (holidays, OOO markers)
      if (!event.start?.dateTime) return false;
      return true;
    })
    .map((event) => {
      const props = event.extendedProperties?.private || {};
      const isChronos = props.chronosBooking === "true";

      // For non-Chronos events, pick attendee info from the event's attendees list
      const externalAttendee = (event.attendees || []).find(
        (a) => !a.self && !a.organizer
      );
      const guestName  = props.guestName  || externalAttendee?.displayName  || externalAttendee?.email?.split("@")[0] || "External";
      const guestEmail = props.guestEmail || externalAttendee?.email         || "";

      const startTime = event.start?.dateTime!;
      const endTime   = event.end?.dateTime!;
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      const durationMin = Math.round(durationMs / 60000);

      return {
        id: event.id,
        title: event.summary || "Untitled",
        guestName,
        guestEmail,
        notes: props.notes || event.description || null,
        startTime,
        endTime,
        meetLink:
          event.hangoutLink ||
          (event.conferenceData?.entryPoints?.[0]?.uri ?? null),
        status: event.status === "cancelled" ? "cancelled" : "confirmed",
        isChronos,
        eventType: {
          title: isChronos ? (props.eventTypeTitle || "Meeting") : (event.summary || "Calendar Event"),
          duration: isChronos ? parseInt(props.eventTypeDuration || "30") : durationMin,
          color: props.eventTypeColor || (isChronos ? "#6366f1" : "#64748b"),
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

export async function listCalendarEventsForDay(
  auth: ReturnType<typeof getPublicAuth>,
  timeMin: string,
  timeMax: string
) {
  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    showDeleted: false,
  });

  return (res.data.items || [])
    .filter((e) => e.summary !== "__CHRONOS_CONFIG__")
    .map((e) => {
      const props = e.extendedProperties?.private || {};
      return {
        id: e.id || "",
        title: e.summary || "Busy",
        startTime: e.start?.dateTime || (e.start?.date ? e.start.date + "T00:00:00" : ""),
        endTime: e.end?.dateTime || (e.end?.date ? e.end.date + "T23:59:59" : ""),
        isAllDay: !e.start?.dateTime,
        isChronosBooking: props.chronosBooking === "true",
        isChronosBlocked: props.chronosBlocked === "true",
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
