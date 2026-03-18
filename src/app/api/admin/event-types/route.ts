import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: session.user.id },
    orderBy: { duration: "asc" },
  });

  return NextResponse.json({ eventTypes });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, duration, slug } = body;

  if (!title || !duration || !slug) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const eventType = await prisma.eventType.create({
    data: {
      title,
      description: description || "",
      duration,
      slug,
      color: "#ffffff",
      userId: session.user.id,
    },
  });

  return NextResponse.json({ eventType });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, title, description, duration, slug } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const eventType = await prisma.eventType.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(duration !== undefined && { duration }),
      ...(slug !== undefined && { slug }),
    },
  });

  return NextResponse.json({ eventType });
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

  await prisma.eventType.deleteMany({
    where: { id, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
