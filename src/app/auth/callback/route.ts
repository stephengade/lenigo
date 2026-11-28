import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncUserFromAuth } from "@/server/auth/session";
import { NotInvitedError } from "@/server/auth/eligibility";
import { safeNext } from "@/lib/safe-next";

/** OAuth (GitHub) and PKCE magic links land here with ?code=… */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"), "/c");
  const code = searchParams.get("code");
  const providerError = searchParams.get("error_description");
  const back = (error: string) =>
    NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}&next=${encodeURIComponent(next)}`);

  if (providerError) return back(providerError);
  if (!code) return back("missing_code");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) return back(error?.message ?? "sign_in_failed");

  // Arriving from an invite page (/invite/<token>…): that invite lets a new account in.
  const invite = next.match(/^\/invite\/([A-Za-z0-9_-]{16,128})(?:[/?#]|$)/)?.[1] ?? null;
  let row;
  try {
    row = await syncUserFromAuth(data.user, { logLogin: true, invite });
  } catch (e) {
    if (!(e instanceof NotInvitedError)) throw e;
    await supabase.auth.signOut();
    return back("not_invited");
  }
  if (row.deactivatedAt) {
    await supabase.auth.signOut();
    return back("deactivated");
  }
  return NextResponse.redirect(`${origin}${next}`);
}
