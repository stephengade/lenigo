import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
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
};

export type CreatedInvite = { id: string; url: string; emailed: boolean; emailError?: string };

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
  tx: Pick<typeof db, "insert"> = db,
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
    const res = await sendInviteEmail(email, token);
    return { id: row.id, url, emailed: res.ok, emailError: res.error };
  }
  return { id: row.id, url, emailed: false };
}

/**
 * Sends a Supabase magic link that signs the person in and lands them on /invite/<token>.
 * Uses Supabase's own mailer, so it creates the auth user if needed. Requires the
 * "Magic Link" email template to use the token_hash link (see README → Supabase setup).
 */
export async function sendInviteEmail(email: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?next=${encodeURIComponent(`/invite/${token}`)}`,
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
    })
    .from(invites)
    .leftJoin(users, eq(users.id, invites.createdById))
    .where(
      and(
        eq(invites.communityId, scope.communityId),
        scope.spaceId ? eq(invites.spaceId, scope.spaceId) : isNull(invites.spaceId),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        or(isNull(invites.maxUses), sql`${invites.uses} < ${invites.maxUses}`),
      ),
    )
    .orderBy(desc(invites.createdAt));
}

export async function revokeInvite(actor: User, scope: { communityId: string; spaceId?: string | null }, inviteId: string) {
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
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ invite: invites, community: communities, space: spaces })
      .from(invites)
      .innerJoin(communities, eq(communities.id, invites.communityId))
      .leftJoin(spaces, eq(spaces.id, invites.spaceId))
      .where(eq(invites.tokenHash, hashToken(token)))
      .for("update", { of: invites })
      .limit(1);

    if (!row) throw fail.notFound("This invite link isn't valid.");
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
    await tx.update(invites).set({ uses: sql`${invites.uses} + 1` }).where(eq(invites.id, invite.id));
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
