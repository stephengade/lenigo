import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/server/db";
import { communities, invites, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionUser, syncUserFromAuth } from "@/server/auth/session";
import { NotInvitedError } from "@/server/auth/eligibility";
import { hashToken, ONE_CLICK_TTL_MS, redeemInvite } from "@/server/services/invites";

/**
 * One-click accept from an invite email: POST /invite/<token>/accept with the email's key `k`.
 *
 * Holding the key proves the person can read that inbox, as a magic link does. So we start a
 * session for the invited address and accept the invite in one step. The guards:
 *  - a POST from our own page only, so a mail scanner that prefetches the link can't use it up;
 *  - email invites only. The key is stored hashed, checked and burned in one statement (two
 *    presses can't both pass), and rotated whenever the invite is resent;
 *  - the inviter never sees the key (their copy of the link has none), so they can't sign in as you;
 *  - only for people new to Lenigo, and only within 72 hours of the email being sent. Existing
 *    accounts, Super Admins and deactivated accounts sign in with a code as usual.
 * Any failure goes back to the invite page, which offers the code sign-in instead.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = request.nextUrl.origin;
  const page = (error?: string) =>
    NextResponse.redirect(`${origin}/invite/${encodeURIComponent(token)}${error ? `?error=${error}` : ""}`, 303);

  // Only our own page may post here. Browsers mark that with Sec-Fetch-Site: same-origin; Origin is a
  // fallback for older ones (a strict referrer policy can turn Origin into "null", so it isn't enough alone).
  const site = request.headers.get("sec-fetch-site");
  const sameOrigin = site ? site === "same-origin" : request.headers.get("origin") === origin;
  if (!sameOrigin) return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  if (!env.SUPABASE_SECRET_KEY) return page("one_click_off");
  if (await getSessionUser()) return page(); // already signed in: the page's own Accept button applies

  const form = await request.formData().catch(() => null);
  const key = String(form?.get("k") ?? "");
  if (key.length < 16 || key.length > 128) return page("link_used");

  // Check and burn the key in one statement.
  const [inv] = await db
    .update(invites)
    .set({ signinKeyHash: null })
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        eq(invites.signinKeyHash, hashToken(key)),
        isNotNull(invites.email),
        gt(invites.lastSentAt, new Date(Date.now() - ONE_CLICK_TTL_MS)), // the button works for 72 hours
      ),
    )
    .returning({ email: invites.email, expiresAt: invites.expiresAt, revokedAt: invites.revokedAt, uses: invites.uses, maxUses: invites.maxUses, communityId: invites.communityId });
  if (!inv?.email) return page("link_used");
  if (inv.revokedAt || inv.expiresAt < new Date() || (inv.maxUses !== null && inv.uses >= inv.maxUses)) return page();
  const [c] = await db.select({ status: communities.status }).from(communities).where(eq(communities.id, inv.communityId)).limit(1);
  if (c?.status !== "ACTIVE") return page();

  const email = inv.email.toLowerCase();
  const [existing] = await db
    .select({ role: users.globalRole, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing?.deactivatedAt) return page("deactivated");
  // Existing accounts (anyone who has signed in before) and Super Admins always confirm with a code.
  if (existing || env.SUPER_ADMIN_EMAILS.includes(email)) return page("use_code");

  // Mint a one-time Supabase token for this address and redeem it here, which sets our session cookies.
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) {
    // New to Lenigo: create the (already confirmed) account, then try again.
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already/i.test(created.error.message)) {
      console.error("[invite] couldn't create the invited account", created.error.message);
      return page("sign_in_failed");
    }
    link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const hashed = link.data?.properties?.hashed_token;
  if (link.error || !hashed) {
    console.error("[invite] generateLink failed", link.error?.message);
    return page("sign_in_failed");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: hashed, type: "magiclink" });
  if (error || !data.user) {
    console.error("[invite] verifyOtp failed", error?.message);
    return page("sign_in_failed");
  }
  // This invite is for this address, so the new account is allowed (canSignIn sees the pending invite).
  let row;
  try {
    row = await syncUserFromAuth(data.user, { logLogin: true, invite: token });
  } catch (e) {
    if (!(e instanceof NotInvitedError)) throw e;
    await supabase.auth.signOut();
    return page("sign_in_failed");
  }
  if (row.deactivatedAt) {
    await supabase.auth.signOut();
    return page("deactivated");
  }

  try {
    const { redirectTo } = await redeemInvite(row, token);
    return NextResponse.redirect(`${origin}${redirectTo}`, 303);
  } catch {
    return page(); // signed in now; the page shows why the invite couldn't be accepted
  }
}
