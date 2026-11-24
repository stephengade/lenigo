import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/server/db";
import {
  communities,
  communityMembers,
  inviteRedemptions,
  invites,
  spaceMembers,
  spaces,
  users,
  type User,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { logActivity } from "@/server/activity";
import { fail, type CommunityAccess, type SpaceAccess } from "@/server/auth/access";
import { community as communityRules, space as spaceRules, type CommunityRole, type SpaceRole } from "@/lib/permissions";
import { format } from "date-fns";
import { canSendEmail, sendEmail } from "@/server/email/send";
import InviteEmail from "@/emails/invite";

const COMMUNITY_RANK: Record<CommunityRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };
const SPACE_RANK: Record<SpaceRole, number> = { LEAD: 4, MANAGER: 3, MENTOR: 2, MEMBER: 1 };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(24).toString("base64url");
export const inviteUrl = (token: string) => `${env.NEXT_PUBLIC_APP_URL}/invite/${token}`;

type CreateInviteInput = {
  email?: string | null;
  /** null = unlimited (shareable link). Email invites are always single-use. */
  maxUses?: number | null;
  expiresInDays?: number;
  sendEmail?: boolean;
  /** Inside a transaction: don't email yet; return the mail for sendInviteAfterCommit. */
  deferEmail?: boolean;
};

export type CreatedInvite = { id: string; url: string; emailed: boolean; emailError?: string; pendingMail?: InviteMail };

/* ── Create ────────────────────────────────────────────────────────── */

export async function createCommunityInvite(
  access: CommunityAccess,
  role: CommunityRole,
  input: CreateInviteInput,
): Promise<CreatedInvite> {
  if (!communityRules.invitableRoles(access.role).includes(role)) {
    throw fail.forbidden(`You can't invite people as ${role.toLowerCase()} of this community.`);
  }
  return insertInvite(access.user, {
    communityId: access.community.id,
    spaceId: null,
    communityRole: role,
    spaceRole: null,
    label: access.community.name,
    ...input,
  });
}

export async function createSpaceInvite(
  access: SpaceAccess,
  role: SpaceRole,
  input: CreateInviteInput,
): Promise<CreatedInvite> {
  if (!spaceRules.invitableRoles(access.spaceRole).includes(role)) {
    throw fail.forbidden(`You can't invite people as ${role.toLowerCase()} of this space.`);
  }
  return insertInvite(access.user, {
    communityId: access.community.id,
    spaceId: access.space.id,
    communityRole: null,
    spaceRole: role,
    label: `${access.community.name} · ${access.space.name}`,
    ...input,
  });
}

/** Also used by provisioning, where the actor is a Global House admin rather than a member. */
export async function insertInvite(
  actor: User,
  v: {
    communityId: string;
    spaceId: string | null;
    communityRole: CommunityRole | null;
    spaceRole: SpaceRole | null;
    label: string;
  } & CreateInviteInput,
  tx: Pick<typeof db, "insert" | "update"> = db,
): Promise<CreatedInvite> {
  const token = newToken();
  const email = v.email?.trim().toLowerCase() || null;
  const days = Math.min(Math.max(v.expiresInDays ?? (email ? 14 : 7), 1), 90);

  const [row] = await tx
    .insert(invites)
    .values({
      tokenHash: hashToken(token),
      communityId: v.communityId,
      spaceId: v.spaceId,
      communityRole: v.communityRole,
      spaceRole: v.spaceRole,
      email,
      maxUses: email ? 1 : (v.maxUses ?? null),
      expiresAt: new Date(Date.now() + days * 86_400_000),
      createdById: actor.id,
    })
    .returning({ id: invites.id });

  await logActivity(
    {
      actorUserId: actor.id,
      actionType: "INVITE_CREATED",
      communityId: v.communityId,
      spaceId: v.spaceId,
      entityType: "invite",
      entityId: row.id,
      metadata: { role: v.spaceRole ?? v.communityRole, scope: v.spaceId ? "space" : "community", email, maxUses: v.maxUses ?? null },
    },
    tx as typeof db,
  );

  const url = inviteUrl(token);
  if (email && v.sendEmail !== false) {
    const mail: InviteMail = {
      inviteId: row.id,
      email,
      token,
      place: v.label,
      role: (v.spaceRole ?? v.communityRole)!,
      inviter: actor.name ?? actor.email,
      expiresAt: new Date(Date.now() + days * 86_400_000),
    };
    if (v.deferEmail) return { id: row.id, url, emailed: false, pendingMail: mail };
    const res = await sendInviteEmail(mail, tx);
    if (res.ok) await tx.update(invites).set({ lastSentAt: new Date() }).where(eq(invites.id, row.id));
    return { id: row.id, url, emailed: res.ok, emailError: res.error };
  }
  return { id: row.id, url, emailed: false };
}

/** Sends an invite created with `deferEmail`, once its transaction has committed. */
export async function sendInviteAfterCommit(invite: CreatedInvite): Promise<CreatedInvite> {
  if (!invite.pendingMail) return invite;
  const res = await sendInviteEmail(invite.pendingMail);
  if (res.ok) await db.update(invites).set({ lastSentAt: new Date() }).where(eq(invites.id, invite.id));
  return { id: invite.id, url: invite.url, emailed: res.ok, emailError: res.error };
}

type InviteMail = {
  inviteId: string;
  email: string;
  token: string;
  place: string;
  role: CommunityRole | SpaceRole;
  inviter: string;
  expiresAt: Date;
};

/** One-click invite emails need both our mailer and the Supabase secret key (to start the session). */
export const oneClickInvites = () => canSendEmail() && Boolean(env.SUPABASE_SECRET_KEY);

/** How long an invite email's one-click button works after it was sent. The invite itself lives longer. */
export const ONE_CLICK_TTL_MS = 72 * 3_600_000;

/**
 * One-click is only for people new to Lenigo: there's no account to take over yet. Anyone who has
 * signed in before (they have a users row) confirms with a sign-in code, so a forwarded or leaked
 * invite email can't open an account that already holds roles and history.
 */
export async function hasLenigoAccount(email: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return Boolean(row);
}

/** Whether this invite's email button (key `k`) may sign someone in right now (the accept route re-checks all of it). */
export async function oneClickAvailable(token: string, k: string) {
  if (!oneClickInvites()) return false;
  const [inv] = await db
    .select({ email: invites.email, keyHash: invites.signinKeyHash, lastSentAt: invites.lastSentAt })
    .from(invites)
    .where(eq(invites.tokenHash, hashToken(token)))
    .limit(1);
  if (!inv?.email || !inv.keyHash || !inv.lastSentAt || inv.keyHash !== hashToken(k)) return false;
  if (Date.now() - inv.lastSentAt.getTime() > ONE_CLICK_TTL_MS) return false;
  return !(await hasLenigoAccount(inv.email));
}

/**
 * Sends the invite email.
 * - With ZeptoMail set up: Lenigo's own branded email with one "Accept invite" button. For someone
 *   new to Lenigo (and one-click on), the button carries a sign-in key (hashed on the invite row,
 *   rotated on every send, good for 72 hours) that only this email ever contains: the inviter sees
 *   the plain link, which still needs a sign-in. Existing accounts always confirm with a code.
 * - Without it: Supabase's sign-in code email, whose button opens /invite/<token>, where the
 *   invitee enters that code.
 */
export async function sendInviteEmail(
  m: InviteMail,
  tx: Pick<typeof db, "update"> = db,
): Promise<{ ok: boolean; error?: string }> {
  if (!canSendEmail()) return sendSupabaseCode(m.email, m.token);

  let url = inviteUrl(m.token);
  const oneClick = oneClickInvites() && !(await hasLenigoAccount(m.email));
  if (oneClick) {
    const key = newToken();
    await tx.update(invites).set({ signinKeyHash: hashToken(key) }).where(eq(invites.id, m.inviteId));
    url += `?k=${key}`;
  }
  const res = await sendEmail({
    to: m.email,
    subject: `You're invited to ${m.place} on Lenigo`,
    react: InviteEmail({ place: m.place, role: m.role, inviter: m.inviter, url, expires: format(m.expiresAt, "d MMM yyyy"), oneClick }),
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** Fallback: Supabase's own mailer sends a sign-in code; the email's button opens the invite page. */
async function sendSupabaseCode(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: inviteUrl(token),
    },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ── List & revoke ─────────────────────────────────────────────────── */

export async function listActiveInvites(scope: { communityId: string; spaceId?: string | null }) {
  return db
    .select({
      id: invites.id,
      email: invites.email,
      communityRole: invites.communityRole,
      spaceRole: invites.spaceRole,
      uses: invites.uses,
      maxUses: invites.maxUses,
      expiresAt: invites.expiresAt,
      createdAt: invites.createdAt,
      createdBy: users.name,
      createdByEmail: users.email,
      lastSentAt: invites.lastSentAt,
      expired: sql<boolean>`${invites.expiresAt} <= now()`,
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdById))
    .where(
      and(
        eq(invites.communityId, scope.communityId),
        scope.spaceId ? eq(invites.spaceId, scope.spaceId) : isNull(invites.spaceId),
        isNull(invites.revokedAt),
        or(isNull(invites.maxUses), sql`${invites.uses} < ${invites.maxUses}`),
        // Live invites, plus email invites that expired in the last 30 days (so they can be resent).
        or(gt(invites.expiresAt, new Date()), and(isNotNull(invites.email), gt(invites.expiresAt, new Date(Date.now() - 30 * 86_400_000)))),
      ),
    )
    .orderBy(desc(invites.createdAt));
}

export async function revokeInvite(
  actor: User,
  scope: { communityId: string; spaceId?: string | null },
  inviteId: string,
  /** Only someone who could create an invite with this role may cancel it. */
  canInvite: (role: CommunityRole | SpaceRole) => boolean,
) {
  const [inv] = await db
    .select({ communityRole: invites.communityRole, spaceRole: invites.spaceRole })
    .from(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.communityId, scope.communityId)))
    .limit(1);
  if (inv && !canInvite((inv.spaceRole ?? inv.communityRole)!)) throw fail.forbidden("You can't cancel invites for this role.");
  const [row] = await db
    .update(invites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invites.id, inviteId),
        eq(invites.communityId, scope.communityId),
        scope.spaceId ? eq(invites.spaceId, scope.spaceId) : isNull(invites.spaceId),
        isNull(invites.revokedAt),
      ),
    )
    .returning({ id: invites.id });
  if (!row) throw fail.notFound("Invite not found");
  await logActivity({
    actorUserId: actor.id,
    actionType: "INVITE_REVOKED",
    communityId: scope.communityId,
    spaceId: scope.spaceId ?? null,
    entityType: "invite",
    entityId: inviteId,
  });
}

const RESEND_COOLDOWN_MS = 2 * 60_000;

/**
 * Resend an email invite: a fresh link (the old one stops working: tokens are stored hashed,
 * so the original can't be re-sent), a new 14-day expiry and a new sign-in code.
 * `canInvite` is the caller's rule for the invite's role, so only someone who could create
 * this invite can resend it. Rate-limited per invite.
 */
export async function resendInvite(
  actor: User,
  scope: { communityId: string; spaceId?: string | null },
  inviteId: string,
  canInvite: (role: CommunityRole | SpaceRole) => boolean,
): Promise<CreatedInvite> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + 14 * 86_400_000);
  const mail = await db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.id, inviteId),
          eq(invites.communityId, scope.communityId),
          scope.spaceId ? eq(invites.spaceId, scope.spaceId) : isNull(invites.spaceId),
        ),
      )
      .for("update")
      .limit(1);
    if (!inv) throw fail.notFound("Invite not found");
    if (!inv.email) throw fail.badRequest("Only email invites can be resent. Copy a shareable link instead.");
    if (inv.revokedAt) throw fail.gone("This invite was revoked. Send a new one.");
    if (inv.maxUses !== null && inv.uses >= inv.maxUses) throw fail.gone("This invite has already been accepted.");
    if (!canInvite((inv.spaceRole ?? inv.communityRole)!)) throw fail.forbidden("You can't invite people with this role.");
    if (inv.lastSentAt && Date.now() - inv.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      throw fail.tooMany("This invite was just sent. Wait a couple of minutes before resending.");
    }
    await tx
      .update(invites)
      // A fresh link drops the old one-click key too; sendInviteEmail stores the new one.
      .set({ tokenHash: hashToken(token), signinKeyHash: null, expiresAt, lastSentAt: new Date() })
      .where(eq(invites.id, inv.id));
    await logActivity(
      {
        actorUserId: actor.id,
        actionType: "INVITE_RESENT",
        communityId: scope.communityId,
        spaceId: scope.spaceId ?? null,
        entityType: "invite",
        entityId: inv.id,
        metadata: { email: inv.email },
      },
      tx,
    );
    const [names] = await tx
      .select({ community: communities.name, space: spaces.name })
      .from(communities)
      .leftJoin(spaces, inv.spaceId ? eq(spaces.id, inv.spaceId) : sql`false`)
      .where(eq(communities.id, scope.communityId))
      .limit(1);
    return {
      previousSentAt: inv.lastSentAt,
      inviteId: inv.id,
      email: inv.email,
      token,
      place: names?.space ? `${names.community} · ${names.space}` : (names?.community ?? "Lenigo"),
      role: (inv.spaceRole ?? inv.communityRole)!,
      inviter: actor.name ?? actor.email,
      expiresAt,
    } satisfies InviteMail & { previousSentAt: Date | null };
  });
  // Sent after commit, so a rolled-back resend never emails a link that doesn't work.
  const res = await sendInviteEmail(mail);
  // Didn't go out: undo the cooldown so it can be resent straight away.
  if (!res.ok) await db.update(invites).set({ lastSentAt: mail.previousSentAt }).where(eq(invites.id, inviteId));
  return { id: inviteId, url: inviteUrl(token), emailed: res.ok, emailError: res.error };
}

/* ── Preview & redeem ──────────────────────────────────────────────── */

export type InvitePreview =
  | {
      ok: true;
      communityName: string;
      communitySlug: string;
      spaceName: string | null;
      spaceSlug: string | null;
      role: CommunityRole | SpaceRole;
      scope: "community" | "space";
      email: string | null;
      expiresAt: Date;
    }
  | { ok: false; reason: string };

export async function previewInvite(token: string): Promise<InvitePreview> {
  const [row] = await db
    .select({ invite: invites, community: communities, space: spaces })
    .from(invites)
    .innerJoin(communities, eq(communities.id, invites.communityId))
    .leftJoin(spaces, eq(spaces.id, invites.spaceId))
    .where(eq(invites.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return { ok: false, reason: "This invite link isn't valid. Ask for a new one." };
  const problem = inviteProblem(row.invite, row.community.status);
  if (problem) return { ok: false, reason: problem };

  return {
    ok: true,
    communityName: row.community.name,
    communitySlug: row.community.slug,
    spaceName: row.space?.name ?? null,
    spaceSlug: row.space?.slug ?? null,
    role: (row.invite.spaceRole ?? row.invite.communityRole)!,
    scope: row.invite.spaceId ? "space" : "community",
    email: row.invite.email,
    expiresAt: row.invite.expiresAt,
  };
}

function inviteProblem(invite: typeof invites.$inferSelect, status: "ACTIVE" | "SUSPENDED") {
  if (invite.revokedAt) return "This invite was revoked.";
  if (invite.expiresAt < new Date()) return "This invite has expired. Ask for a new one.";
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return "This invite has already been used.";
  if (status === "SUSPENDED") return "This community is currently suspended.";
  return null;
}

/** Redeem atomically: the invite row is locked so a single-use link can't be claimed twice. */
export async function redeemInvite(user: User, token: string): Promise<{ redirectTo: string }> {
  return redeemWhere(user, eq(invites.tokenHash, hashToken(token)), "This invite link isn't valid.");
}

/**
 * Accept an email invite from /c without its link: only one sent to the address the user
 * signed in with (sign-in proves they own it), so this grants nothing the link wouldn't.
 */
export async function redeemMyInvite(user: User, inviteId: string): Promise<{ redirectTo: string }> {
  return redeemWhere(
    user,
    and(eq(invites.id, inviteId), eq(invites.email, user.email.toLowerCase()))!,
    "That invite isn't for this account.",
  );
}

/** Email invites waiting for this user: sent to their address, still usable, not yet accepted. */
export async function listMyPendingInvites(user: User) {
  const rows = await db
    .select({
      id: invites.id,
      communityName: communities.name,
      spaceName: spaces.name,
      communityRole: invites.communityRole,
      spaceRole: invites.spaceRole,
      expiresAt: invites.expiresAt,
      invitedBy: users.name,
    })
    .from(invites)
    .innerJoin(communities, eq(communities.id, invites.communityId))
    .leftJoin(spaces, eq(spaces.id, invites.spaceId))
    .leftJoin(users, eq(users.id, invites.createdById))
    .where(
      and(
        eq(invites.email, user.email.toLowerCase()),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        or(isNull(invites.maxUses), sql`${invites.uses} < ${invites.maxUses}`),
        eq(communities.status, "ACTIVE"),
        sql`not exists (select 1 from ${inviteRedemptions} r where r.invite_id = ${invites.id} and r.user_id = ${user.id})`,
      ),
    )
    .orderBy(desc(invites.createdAt))
    .limit(20);
  return rows.map(({ communityRole, spaceRole, ...r }) => ({ ...r, role: (spaceRole ?? communityRole)! }));
}

async function redeemWhere(user: User, where: SQL, notFound: string): Promise<{ redirectTo: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ invite: invites, community: communities, space: spaces })
      .from(invites)
      .innerJoin(communities, eq(communities.id, invites.communityId))
      .leftJoin(spaces, eq(spaces.id, invites.spaceId))
      .where(where)
      .for("update", { of: invites })
      .limit(1);

    if (!row) throw fail.notFound(notFound);
    const { invite, community, space } = row;
    const destination = space ? `/c/${community.slug}/${space.slug}` : `/c/${community.slug}`;

    // Already redeemed by this user: treat as success (double clicks, refreshes).
    const [already] = await tx
      .select()
      .from(inviteRedemptions)
      .where(and(eq(inviteRedemptions.inviteId, invite.id), eq(inviteRedemptions.userId, user.id)))
      .limit(1);
    if (already) return { redirectTo: destination };

    const problem = inviteProblem(invite, community.status);
    if (problem) throw fail.gone(problem);
    if (invite.email && invite.email !== user.email.toLowerCase()) {
      throw fail.forbidden(`This invite was sent to ${maskEmail(invite.email)}. Sign in with that address to accept it.`);
    }

    // Community membership: join as the invited role, or MEMBER for space invites. Never downgrade.
    const wantCommunityRole: CommunityRole = invite.communityRole ?? "MEMBER";
    const [currentC] = await tx
      .select({ role: communityMembers.role })
      .from(communityMembers)
      .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.id)))
      .limit(1);
    if (!currentC) {
      await tx.insert(communityMembers).values({ communityId: community.id, userId: user.id, role: wantCommunityRole });
    } else if (COMMUNITY_RANK[wantCommunityRole] > COMMUNITY_RANK[currentC.role]) {
      await tx
        .update(communityMembers)
        .set({ role: wantCommunityRole })
        .where(and(eq(communityMembers.communityId, community.id), eq(communityMembers.userId, user.id)));
    }

    if (space && invite.spaceRole) {
      const [currentS] = await tx
        .select({ role: spaceMembers.role })
        .from(spaceMembers)
        .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, user.id)))
        .limit(1);
      if (!currentS) {
        await tx
          .insert(spaceMembers)
          .values({ spaceId: space.id, userId: user.id, communityId: community.id, role: invite.spaceRole });
      } else if (SPACE_RANK[invite.spaceRole] > SPACE_RANK[currentS.role]) {
        await tx
          .update(spaceMembers)
          .set({ role: invite.spaceRole })
          .where(and(eq(spaceMembers.spaceId, space.id), eq(spaceMembers.userId, user.id)));
      }
    }

    await tx.insert(inviteRedemptions).values({ inviteId: invite.id, userId: user.id });
    // Accepting by any route also burns the email's one-click key, so it can't sign anyone in later.
    await tx.update(invites).set({ uses: sql`${invites.uses} + 1`, signinKeyHash: null }).where(eq(invites.id, invite.id));
    await logActivity(
      {
        actorUserId: user.id,
        actionType: "INVITE_REDEEMED",
        communityId: community.id,
        spaceId: space?.id ?? null,
        entityType: "invite",
        entityId: invite.id,
        metadata: { role: invite.spaceRole ?? invite.communityRole, scope: space ? "space" : "community" },
      },
      tx,
    );

    return { redirectTo: destination };
  });
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}
