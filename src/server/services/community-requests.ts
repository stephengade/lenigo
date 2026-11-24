import "server-only";
import { createHmac } from "node:crypto";
import { and, count, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { communityRequests, users, type User } from "@/server/db/schema";
import { env } from "@/server/env";
import { logActivity } from "@/server/activity";
import { fail } from "@/server/auth/access";
import { global } from "@/lib/permissions";
import { sendEmail } from "@/server/email/send";
import CommunityRequestEmail from "@/emails/community-request";
import { afterResponse } from "@/server/services/notifications";

export const COMMUNITY_SIZES = ["Under 50", "50–200", "200–1,000", "Over 1,000"] as const;
export type CommunityRequestStatus = "NEW" | "CONTACTED" | "PROVISIONED" | "DECLINED";

export type CommunityRequestInput = {
  name: string;
  email: string;
  communityName: string;
  size: string;
  location?: string | null;
  about: string;
  link?: string | null;
  /** Honeypot: a field people never see. Bots fill it in. */
  website?: string | null;
};

const PER_IP_PER_HOUR = 3;
const PER_EMAIL_PER_DAY = 2;
const ALL_PER_HOUR = 60;

/** Keyed hash of the sender's IP, so limits work without storing the address. */
const ipHash = (ip: string | null) => (ip ? createHmac("sha256", env.DATABASE_URL).update(`community-request:${ip}`).digest("hex") : null);

const clean = (v: string | null | undefined, max: number) => {
  const s = v?.replace(/\s+/g, " ").trim() ?? "";
  return s ? s.slice(0, max) : null;
};

/**
 * "Bring your community" form. Anyone can send it, so: a honeypot, per-IP, per-email and overall
 * hourly limits, length caps, https-only links. The Global House team gets an email; the sender
 * gets nothing (otherwise the form could be used to email strangers).
 */
export async function submitCommunityRequest(input: CommunityRequestInput, ip: string | null) {
  if (input.website?.trim()) return { ok: true as const }; // bot: pretend it worked

  const name = clean(input.name, 80);
  const email = clean(input.email, 254)?.toLowerCase() ?? null;
  const communityName = clean(input.communityName, 120);
  const location = clean(input.location, 120);
  const about = input.about?.trim().slice(0, 2000) ?? "";
  if (!name || name.length < 2) throw fail.badRequest("Tell us your name.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail.badRequest("Enter an email we can reply to.");
  if (!communityName || communityName.length < 2) throw fail.badRequest("What's your community called?");
  if (!(COMMUNITY_SIZES as readonly string[]).includes(input.size)) throw fail.badRequest("Pick a size.");
  if (about.length < 20) throw fail.badRequest("Tell us a little about your community and what you want to learn (a sentence or two).");
  let link: string | null = null;
  if (input.link?.trim()) {
    try {
      const u = new URL(input.link.trim());
      if (u.protocol !== "https:") throw new Error();
      link = u.toString().slice(0, 300);
    } catch {
      throw fail.badRequest("The link must start with https://");
    }
  }

  const hash = ipHash(ip);
  const hourAgo = new Date(Date.now() - 3_600_000);
  const dayAgo = new Date(Date.now() - 86_400_000);
  const [[byIp], [byEmail], [all]] = await Promise.all([
    hash
      ? db.select({ n: count() }).from(communityRequests).where(and(eq(communityRequests.ipHash, hash), gt(communityRequests.createdAt, hourAgo)))
      : Promise.resolve([{ n: 0 }]),
    db.select({ n: count() }).from(communityRequests).where(and(sql`lower(${communityRequests.email}) = ${email}`, gt(communityRequests.createdAt, dayAgo))),
    db.select({ n: count() }).from(communityRequests).where(gt(communityRequests.createdAt, hourAgo)),
  ]);
  if (byIp.n >= PER_IP_PER_HOUR || byEmail.n >= PER_EMAIL_PER_DAY || all.n >= ALL_PER_HOUR) {
    throw fail.tooMany("We've already got your request. We'll be in touch; try again later if you need to add something.");
  }

  const [row] = await db
    .insert(communityRequests)
    .values({ name, email, communityName, size: input.size, location, about, link, ipHash: hash })
    .returning();
  await logActivity({ actorUserId: null, actionType: "COMMUNITY_REQUESTED", entityType: "community_request", entityId: row.id, metadata: { communityName, size: input.size } });
  await afterResponse(() => emailTheTeam(row));
  return { ok: true as const };
}

/** Super Admins and Admins (active), plus SUPER_ADMIN_EMAILS. */
async function teamEmails() {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(and(inArray(users.globalRole, ["SUPER_ADMIN", "ADMIN"]), isNull(users.deactivatedAt)));
  return [...new Set([...rows.map((r) => r.email.toLowerCase()), ...env.SUPER_ADMIN_EMAILS])];
}

async function emailTheTeam(row: typeof communityRequests.$inferSelect) {
  const to = await teamEmails();
  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/admin/requests`;
  for (const address of to) {
    const res = await sendEmail({
      to: address,
      subject: `New community request: ${row.communityName}`,
      replyTo: { address: row.email, name: row.name },
      react: CommunityRequestEmail({ request: row, url }),
    });
    if (!res.ok) console.error(`[community-request] email to the team failed: ${res.error}`);
  }
}

/* ── Global House ──────────────────────────────────────────────────── */

export async function listCommunityRequests(actor: User, status?: string) {
  if (!global.canProvision(actor.globalRole)) throw fail.forbidden();
  const s = (["NEW", "CONTACTED", "PROVISIONED", "DECLINED"] as const).find((x) => x === status);
  const [rows, byStatus] = await Promise.all([
    db
      .select({ r: communityRequests, handledBy: users.name })
      .from(communityRequests)
      .leftJoin(users, eq(users.id, communityRequests.handledById))
      .where(s ? eq(communityRequests.status, s) : or(eq(communityRequests.status, "NEW"), eq(communityRequests.status, "CONTACTED")))
      .orderBy(desc(communityRequests.createdAt))
      .limit(100),
    db.select({ status: communityRequests.status, n: count() }).from(communityRequests).groupBy(communityRequests.status),
  ]);
  return { rows, status: s ?? null, counts: Object.fromEntries(byStatus.map((b) => [b.status, b.n])) as Partial<Record<CommunityRequestStatus, number>> };
}

export async function setCommunityRequestStatus(actor: User, id: string, status: CommunityRequestStatus) {
  if (!global.canProvision(actor.globalRole)) throw fail.forbidden();
  const [row] = await db
    .update(communityRequests)
    .set({ status, handledById: actor.id, handledAt: new Date() })
    .where(eq(communityRequests.id, id))
    .returning({ id: communityRequests.id, communityName: communityRequests.communityName });
  if (!row) throw fail.notFound("Request not found");
  await logActivity({ actorUserId: actor.id, actionType: "COMMUNITY_REQUEST_UPDATED", entityType: "community_request", entityId: id, metadata: { status, communityName: row.communityName } });
}
