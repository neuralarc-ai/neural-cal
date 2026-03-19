import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPublicAuth, getAdminAuth, listCalendarEventsForDay } from "@/lib/google";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_ADMIN_BYPASS === "true";

async function getAuth() {
  if (DEV_BYPASS) return getPublicAuth();
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  return getAdminAuth(session.accessToken, session.refreshToken);
}

export async function GET(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "Missing date" }, { status: 400 });

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  try {
    const events = await listCalendarEventsForDay(auth, timeMin, timeMax);
    return NextResponse.json({ events });
  } catch (err) {
    console.error("Failed to fetch calendar events:", err);
    return NextResponse.json({ error: "Failed to fetch calendar events" }, { status: 500 });
  }
}
