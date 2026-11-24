import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncUserFromAuth } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-next";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  // Supabase codes are 6 digits by default (configurable up to 10).
  code: z.string().trim().regex(/^\d{6,10}$/),
  next: z.string().max(2048).optional(),
});

/**
 * Checks the emailed sign-in code on the server, sets the session cookies, and syncs the
 * user row (super-admin promotion + LOGIN log), like /auth/confirm does for links.
 * Supabase rate-limits and expires codes; wrong codes are refused there.
 */
export async function POST(request: NextRequest) {
  // Same-origin only: a cross-site form must not be able to drive a sign-in.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the code from your email." }, { status: 400 });
  }
  const { email, code } = parsed.data;
  const next = safeNext(parsed.data.next, "/c");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    // Same message for wrong and expired codes; don't help anyone guess.
    return NextResponse.json({ error: "That code is wrong or has expired. Check it, or send a new one." }, { status: 401 });
  }

  await syncUserFromAuth(data.user, { logLogin: true });
  return NextResponse.json({ next });
}
