import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getAdminAuth,
  listBlockedTimes,
  createBlockedTimeEvent,
  deleteCalendarEvent,
} from "@/lib/google";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = getAdminAuth(session.accessToken, session.refreshToken);
  const blockedTimes = await listBlockedTimes(auth);

  return NextResponse.json({ blockedTimes });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { startTime, endTime, reason, allDay } = body;

  if (!startTime || !endTime) {
    return NextResponse.json({ error: "Missing start or end time" }, { status: 400 });
  }

  const auth = getAdminAuth(session.accessToken, session.refreshToken);
  const blocked = await createBlockedTimeEvent(auth, {
    startTime,
    endTime,
    reason,
    allDay: allDay || false,
  });

  return NextResponse.json({ blocked });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const auth = getAdminAuth(session.accessToken, session.refreshToken);
  await deleteCalendarEvent(auth, id);

  return NextResponse.json({ success: true });
}
