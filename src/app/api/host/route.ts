import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Returns the host (first user / admin) info for the public booking page
export async function GET() {
  const user = await prisma.user.findFirst({
    include: {
      eventTypes: { orderBy: { duration: "asc" } },
      availability: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "No host configured" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    image: user.image,
    bio: user.bio,
    eventTypes: user.eventTypes,
    availability: user.availability,
  });
}
