import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPublicAuth, getAdminAuth, getConfig, saveConfig } from "@/lib/google";

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

  const config = await getConfig(auth);

  return NextResponse.json({ availability: config.availability });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const config = await getConfig(auth);

  config.availability = {
    timezone: body.timezone ?? config.availability.timezone,
    schedule: body.schedule ?? config.availability.schedule,
  };

  await saveConfig(auth, config);

  return NextResponse.json({ availability: config.availability });
}
