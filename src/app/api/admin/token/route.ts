import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Returns the CEO's refresh token for initial Vercel setup.
// Visit this endpoint while logged in to get the token.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.refreshToken) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  return NextResponse.json({
    refreshToken: session.refreshToken,
    instructions:
      "Add this as CEO_GOOGLE_REFRESH_TOKEN in your Vercel environment variables, then redeploy.",
  });
}
