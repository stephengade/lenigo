import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { sendWorkshopReminders } from "@/server/services/notifications";

/**
 * Emails "starts soon" reminders for sessions in the next 24 hours to people who RSVP'd.
 * Call it every hour or so from a scheduler with `Authorization: Bearer <CRON_SECRET>`.
 * Each person gets one reminder per session however often it runs. Off (404) until CRON_SECRET is set.
 */
export async function GET(request: NextRequest) {
  if (!env.CRON_SECRET) return new NextResponse(null, { status: 404 });
  const given = request.headers.get("authorization") ?? "";
  const digest = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(digest(given), digest(`Bearer ${env.CRON_SECRET}`))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reminded = await sendWorkshopReminders();
  return NextResponse.json({ reminded });
}

export const dynamic = "force-dynamic";
