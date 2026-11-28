import "server-only";
import { createHmac } from "node:crypto";
import { and, count, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { invites, signInRequests, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { hashToken } from "@/server/services/invites";

/**
 * Who may sign in. Lenigo is invite-only: a sign-in code is sent, and a new account is created,
 * only for
 *   - an existing account (anyone who has signed in before),
 *   - a Super Admin bootstrap address (SUPER_ADMIN_EMAILS),
 *   - an address with a pending email invite, or
 *   - anyone holding a valid invite link (the token comes with the request).
 * Checked before a code is sent (/auth/otp) AND when an account would be created
 * (syncUserFromAuth), so asking Supabase for a code directly, or signing in with GitHub,
 * still can't create an uninvited account.
 */
export async function canSignIn(rawEmail: string, inviteToken?: string | null): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return false;
  if (env.SUPER_ADMIN_EMAILS.includes(email)) return true;

  const now = new Date();
  const live = and(isNull(invites.revokedAt), gt(invites.expiresAt, now), or(isNull(invites.maxUses), lt(invites.uses, invites.maxUses)));
  const [[account], [byEmail], byToken] = await Promise.all([
    db.select({ n: count() }).from(users).where(sql`lower(${users.email}) = ${email}`),
    db.select({ n: count() }).from(invites).where(and(sql`lower(${invites.email}) = ${email}`, live)),
    inviteToken
      ? db
          .select({ email: invites.email })
          .from(invites)
          .where(and(eq(invites.tokenHash, hashToken(inviteToken)), live))
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (account.n > 0 || byEmail.n > 0) return true;
  // A link invite works for any address; an email invite only for its own address.
  const inv = byToken[0];
  return !!inv && (!inv.email || inv.email.toLowerCase() === email);
}

/** A brand-new sign-in that isn't allowed (no account, no invite). */
export class NotInvitedError extends Error {
  constructor() {
    super("No Lenigo account or invite for this email.");
    this.name = "NotInvitedError";
  }
}

/* ── Rate limits for sign-in code requests ───────────────────────── */

const WINDOW_MS = 15 * 60_000;
/** Codes per address per window (Supabase also limits resends). */
const PER_EMAIL = 5;
/** Requests per network address per window. */
const PER_IP = 20;
/** Unknown addresses per network address per hour: keeps "is this email registered?" guessing slow. */
const MISSES_PER_IP_HOUR = 8;

const key = (kind: string, value: string) => createHmac("sha256", env.DATABASE_URL).update(`sign-in:${kind}:${value}`).digest("hex");

async function recent(k: string, ms: number) {
  const [row] = await db
    .select({ n: count() })
    .from(signInRequests)
    .where(and(eq(signInRequests.key, k), gt(signInRequests.createdAt, new Date(Date.now() - ms))));
  return row.n;
}

/**
 * Throttles code requests. Returns a message when the caller must wait, otherwise records the
 * request and returns null. Only HMACs of the address and IP are stored, never the values.
 */
export async function throttleSignIn(email: string, ip: string | null): Promise<string | null> {
  const e = key("email", email.toLowerCase());
  const i = key("ip", ip ?? "unknown");
  const [byEmail, byIp] = await Promise.all([recent(e, WINDOW_MS), recent(i, WINDOW_MS)]);
  if (byEmail >= PER_EMAIL) return "Too many codes requested for this email. Wait 15 minutes, then try again.";
  if (byIp >= PER_IP) return "Too many sign-in attempts from this network. Wait 15 minutes, then try again.";
  await db.insert(signInRequests).values([{ key: e }, { key: i }]);
  // Old rows aren't needed after a day.
  await db.delete(signInRequests).where(lt(signInRequests.createdAt, new Date(Date.now() - 24 * 3600_000)));
  return null;
}

/** Too many unknown addresses from this network lately? Checked before looking the address up. */
export async function missLimited(ip: string | null): Promise<boolean> {
  return (await recent(key("miss", ip ?? "unknown"), 3600_000)) >= MISSES_PER_IP_HOUR;
}

/** Unknown addresses count separately, so guessing who is registered stays slow. */
export async function recordMiss(ip: string | null) {
  await db.insert(signInRequests).values({ key: key("miss", ip ?? "unknown") });
}
