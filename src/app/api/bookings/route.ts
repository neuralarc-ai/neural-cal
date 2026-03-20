import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPublicAuth, getAdminAuth, listBookings } from "@/lib/google";

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

  try {
    const bookings = await listBookings(auth);
    return NextResponse.json({ bookings });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}
