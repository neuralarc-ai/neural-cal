import { google } from "googleapis";

export function getGoogleCalendarClient(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

export async function getFreeBusySlots(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  calendarId = "primary"
) {
  const calendar = getGoogleCalendarClient(accessToken);
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId }],
    },
  });

  const busy = response.data.calendars?.[calendarId]?.busy || [];
  return busy.map((slot) => ({
    start: slot.start!,
    end: slot.end!,
  }));
}

export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    startTime: string;
    endTime: string;
    attendeeEmail: string;
    timezone: string;
  }
) {
  const calendar = getGoogleCalendarClient(accessToken);

  const response = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: {
        dateTime: event.startTime,
        timeZone: event.timezone,
      },
      end: {
        dateTime: event.endTime,
        timeZone: event.timezone,
      },
      attendees: [{ email: event.attendeeEmail }],
      conferenceData: {
        createRequest: {
          requestId: `chronos-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  return {
    eventId: response.data.id,
    meetLink: response.data.hangoutLink || response.data.conferenceData?.entryPoints?.[0]?.uri,
    htmlLink: response.data.htmlLink,
  };
}
