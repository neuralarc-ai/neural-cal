import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const availability = await prisma.availability.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    availability: availability || {
      startHour: 9,
      endHour: 17,
      days: "1,2,3,4,5",
      timezone: "America/New_York",
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { startHour, endHour, days, timezone } = body;

  const availability = await prisma.availability.upsert({
    where: { userId: session.user.id },
    update: { startHour, endHour, days, timezone },
    create: {
      userId: session.user.id,
      startHour: startHour ?? 9,
      endHour: endHour ?? 17,
      days: days ?? "1,2,3,4,5",
      timezone: timezone ?? "America/New_York",
    },
  });

  return NextResponse.json({ availability });
}
