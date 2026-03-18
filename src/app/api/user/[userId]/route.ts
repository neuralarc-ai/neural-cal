import { NextRequest, NextResponse } from "next/server";
import { getPublicAuth, getConfig, getCEOProfile } from "@/lib/google";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  await params; // userId ignored — single CEO app

  if (!process.env.CEO_GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  try {
    const auth = getPublicAuth();
    const [profile, config] = await Promise.all([getCEOProfile(), getConfig(auth)]);

    return NextResponse.json({
      id: "primary",
      name: profile.name,
      image: profile.picture,
      bio: config.bio,
      eventTypes: config.eventTypes,
      availability: config.availability,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json({ error: "Failed to load user info" }, { status: 500 });
  }
}
