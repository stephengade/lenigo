import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { isEmail } from "@/lib/validate";
import { canSignIn, missLimited, recordMiss, throttleSignIn } from "@/server/auth/eligibility";

const Body = z.object({
  email: z.string().trim().toLowerCase().max(254),
  next: z.string().max(2048).optional(),
  /** Invite token from /invite/<token>: a link invite lets a new address sign up. */
  invite: z.string().min(16).max(128).optional(),
});

/**
 * Sends a sign-in code, but only to an address that may sign in (an account, a pending invite,
 * or a valid invite link): see server/auth/eligibility.ts. The sign-in page calls this instead of
 * asking Supabase directly. Rate-limited per address and per network.
 */
export async function POST(request: NextRequest) {
  // Same-origin only: another site must not be able to trigger codes to people's inboxes.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isEmail(parsed.data.email)) {
    return NextResponse.json({ error: "Enter a full email address, like ada@gmail.com." }, { status: 400 });
  }
  const { email, invite } = parsed.data;
  const next = safeNext(parsed.data.next, "/c");
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  // Over the unknown-address limit: the same answer for everyone, so it can't confirm who's registered.
  if (await missLimited(ip)) {
    return NextResponse.json({ error: "Too many unknown emails from this network. Wait an hour, then try again." }, { status: 429 });
  }
  const wait = await throttleSignIn(email, ip);
  if (wait) return NextResponse.json({ error: wait }, { status: 429 });

  if (!(await canSignIn(email, invite))) {
    await recordMiss(ip);
    return NextResponse.json(
      { error: "We don't have an account for this email. Check it for typos, or open the invite link your community sent you." },
      { status: 404 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // Only used by the email's "open the sign-in page" link; the code itself works anywhere.
      emailRedirectTo: invite ? `${request.nextUrl.origin}${next}` : `${request.nextUrl.origin}/login?next=${encodeURIComponent(next)}`,
      shouldCreateUser: true,
    },
  });
  if (error) {
    const limited = /rate|seconds/i.test(error.message);
    if (!limited) console.error("[auth/otp] couldn't send a code", error.message);
    return NextResponse.json(
      { error: limited ? "Too many codes requested. Wait a minute, then try again." : "We couldn't send a code just now. Try again in a minute." },
      { status: limited ? 429 : 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
