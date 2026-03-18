import { NextResponse } from "next/server";
import { getPublicAuth, getConfig, getCEOProfile } from "@/lib/google";

export async function GET() {
  if (!process.env.CEO_GOOGLE_REFRESH_TOKEN) {
    return NextResponse.json(
      { error: "CEO_GOOGLE_REFRESH_TOKEN not configured" },
      { status: 503 }
    );
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
    console.error("Error fetching host:", error);
    return NextResponse.json({ error: "Failed to load host info" }, { status: 500 });
  }
}
