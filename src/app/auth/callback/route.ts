import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncUserFromAuth } from "@/server/auth/session";
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

  const row = await syncUserFromAuth(data.user, { logLogin: true });
  if (row.deactivatedAt) {
    await supabase.auth.signOut();
    return back("deactivated");
  }
  return NextResponse.redirect(`${origin}${next}`);
}
