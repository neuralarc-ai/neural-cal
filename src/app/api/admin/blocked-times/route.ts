import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockedTimes = await prisma.blockedTime.findMany({
    where: { userId: session.user.id },
    orderBy: { startTime: "asc" },
  });

  return NextResponse.json({ blockedTimes });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { startTime, endTime, reason, allDay } = body;

  if (!startTime || !endTime) {
    return NextResponse.json({ error: "Missing start or end time" }, { status: 400 });
  }

  const blocked = await prisma.blockedTime.create({
    data: {
      userId: session.user.id,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      reason: reason || null,
      allDay: allDay || false,
    },
  });

  return NextResponse.json({ blocked });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  await prisma.blockedTime.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
