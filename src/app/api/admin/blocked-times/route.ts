import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getPublicAuth,
  getAdminAuth,
  listBlockedTimes,
  createBlockedTimeEvent,
  deleteCalendarEvent,
} from "@/lib/google";

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_ADMIN_BYPASS === "true";

async function getAuth() {
  if (DEV_BYPASS) return getPublicAuth();
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) return null;
  return getAdminAuth(session.accessToken, session.refreshToken);
}

export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blockedTimes = await listBlockedTimes(auth);
  return NextResponse.json({ blockedTimes });
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { startTime, endTime, reason, allDay } = body;

  if (!startTime || !endTime) {
    return NextResponse.json({ error: "Missing start or end time" }, { status: 400 });
  }

  try {
    const blocked = await createBlockedTimeEvent(auth, {
      startTime,
      endTime,
      reason,
      allDay: allDay || false,
    });
    return NextResponse.json({ blocked });
  } catch (err) {
    console.error("Failed to create blocked time:", err);
    return NextResponse.json({ error: "Failed to create blocked time" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await deleteCalendarEvent(auth, id);
  return NextResponse.json({ success: true });
}
