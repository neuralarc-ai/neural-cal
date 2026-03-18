import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminAuth, getConfig, saveConfig } from "@/lib/google";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = getAdminAuth(session.accessToken, session.refreshToken);
  const config = await getConfig(auth);

  return NextResponse.json({ availability: config.availability });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { startHour, endHour, days, timezone } = body;

  const auth = getAdminAuth(session.accessToken, session.refreshToken);
  const config = await getConfig(auth);

  config.availability = {
    startHour: startHour ?? config.availability.startHour,
    endHour: endHour ?? config.availability.endHour,
    days: days ?? config.availability.days,
    timezone: timezone ?? config.availability.timezone,
  };

  await saveConfig(auth, config);

  return NextResponse.json({ availability: config.availability });
}
