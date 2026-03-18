import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const existingTypes = await prisma.eventType.findMany({
    where: { userId },
  });

  if (existingTypes.length === 0) {
    await prisma.eventType.createMany({
      data: [
        {
          slug: "quick-chat",
          title: "Quick Chat",
          description: "A brief 15-minute conversation to discuss quick questions or ideas.",
          duration: 15,
          color: "#10b981",
          userId,
        },
        {
          slug: "standard-meeting",
          title: "Standard Meeting",
          description: "A 30-minute meeting for discussions, planning, or collaboration.",
          duration: 30,
          color: "#6366f1",
          userId,
        },
        {
          slug: "deep-dive",
          title: "Deep Dive",
          description: "A full 60-minute session for in-depth discussions or workshops.",
          duration: 60,
          color: "#f59e0b",
          userId,
        },
      ],
    });
  }

  const existingAvailability = await prisma.availability.findUnique({
    where: { userId },
  });

  if (!existingAvailability) {
    await prisma.availability.create({
      data: { userId },
    });
  }

  return NextResponse.json({ success: true });
}
