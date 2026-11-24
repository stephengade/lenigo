import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncUserFromAuth } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-next";

/**
 * Legacy: sign-in now uses emailed codes (/auth/verify). Kept so links in older emails still work.
 * Email magic links land here with ?token_hash=…&type=email. Works across devices
 * (no PKCE verifier needed), so an invite opened on a phone still signs you in.
 * Requires the Supabase "Magic Link" email template to link here — see README.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/c");
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") ?? "email") as EmailOtpType;
  const back = (error: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}&next=${encodeURIComponent(next)}`);

  // Default Supabase templates send ?code=… instead; hand those to the PKCE callback.
  const code = searchParams.get("code");
  if (!tokenHash && code) {
    return NextResponse.redirect(`${origin}/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(next)}`);
  }
  if (!tokenHash) return back("link_invalid");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user) return back(error?.message ?? "link_expired");

  await syncUserFromAuth(data.user, { logLogin: true });
  return NextResponse.redirect(`${origin}${next}`);
}
