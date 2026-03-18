import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminAuth, getConfig, saveConfig, EventType } from "@/lib/google";

function getAuth(session: { accessToken: string; refreshToken: string }) {
  return getAdminAuth(session.accessToken, session.refreshToken);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = getAuth(session);
  const config = await getConfig(auth);
  return NextResponse.json({ eventTypes: config.eventTypes });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, duration, slug } = body;

  if (!title || !duration || !slug) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const auth = getAuth(session);
  const config = await getConfig(auth);

  const newType: EventType = {
    id: slug,
    slug,
    title,
    description: description || "",
    duration,
    color: "#6366f1",
  };

  config.eventTypes.push(newType);
  await saveConfig(auth, config);

  return NextResponse.json({ eventType: newType });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, title, description, duration, slug } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const auth = getAuth(session);
  const config = await getConfig(auth);

  const idx = config.eventTypes.findIndex((et) => et.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Event type not found" }, { status: 404 });
  }

  const updated = {
    ...config.eventTypes[idx],
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(duration !== undefined && { duration }),
    ...(slug !== undefined && { slug, id: slug }),
  };

  config.eventTypes[idx] = updated;
  await saveConfig(auth, config);

  return NextResponse.json({ eventType: updated });
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

  const auth = getAuth(session);
  const config = await getConfig(auth);

  config.eventTypes = config.eventTypes.filter((et) => et.id !== id);
  await saveConfig(auth, config);

  return NextResponse.json({ success: true });
}
