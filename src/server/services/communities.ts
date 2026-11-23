import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  activityLogs,
  communities,
  communityMembers,
  pointsLedger,
  spaceMembers,
  spaces,
  streaks,
  submissions,
  users,
  type User,
} from "@/server/db/schema";
import { logActivity } from "@/server/activity";
import { fail, type CommunityAccess, type SpaceAccess } from "@/server/auth/access";
import { insertInvite, type CreatedInvite } from "@/server/services/invites";
import {
  community as communityRules,
  global,
  RESERVED_SPACE_SLUGS,
  SLUG_PATTERN,
  space as spaceRules,
  type CommunityRole,
  type SpaceRole,
} from "@/lib/permissions";
import { slugify } from "@/lib/utils";

/* ── Provisioning (Global House) ───────────────────────────────────── */

export type ProvisionInput = {
  name: string;
  slug: string;
  description?: string | null;
  ownerEmail: string;
  timezone?: string;
  /** Initial spaces, e.g. ["Web Development", "Data Science"]. Empty → one "General" space. */
  spaces: string[];
};

export async function provisionCommunity(actor: User, input: ProvisionInput) {
  if (!global.canProvision(actor.globalRole)) throw fail.forbidden();

  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug)) throw fail.badRequest("Slug must be lowercase letters, numbers and hyphens.");
  const ownerEmail = input.ownerEmail.trim().toLowerCase();

  const spaceNames = [...new Set(input.spaces.map((s) => s.trim()).filter(Boolean))];
  const spaceRows = (spaceNames.length ? spaceNames : ["General"]).map((name, position) => {
    let s = slugify(name) || `space-${position + 1}`;
    if (RESERVED_SPACE_SLUGS.has(s)) s = `${s}-space`;
    return { name, slug: s, position };
  });
  if (new Set(spaceRows.map((s) => s.slug)).size !== spaceRows.length) {
    throw fail.badRequest("Two spaces would share the same URL. Rename one of them.");
  }

  return db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: communities.id }).from(communities).where(eq(communities.slug, slug)).limit(1);
    if (taken) throw fail.conflict(`/c/${slug} is already taken.`);

    const [community] = await tx
      .insert(communities)
      .values({
        slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        timezone: input.timezone || "UTC",
        createdById: actor.id,
      })
      .returning();

    const createdSpaces = await tx
      .insert(spaces)
      .values(spaceRows.map((s) => ({ ...s, communityId: community.id })))
      .returning();

    // Existing account → make them Owner now. Otherwise (or as well) issue an Owner invite.
    const [owner] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${ownerEmail}`)
      .limit(1);
    if (owner) {
      await tx.insert(communityMembers).values({ communityId: community.id, userId: owner.id, role: "OWNER" });
    }

    await logActivity(
      {
        actorUserId: actor.id,
        actionType: "PROVISION_COMMUNITY",
        communityId: community.id,
        entityType: "community",
        entityId: community.id,
        metadata: { slug, ownerEmail, spaces: createdSpaces.map((s) => s.slug), ownerExisted: Boolean(owner) },
      },
      tx,
    );

    // The magic-link email is sent after commit would be ideal; Supabase's mailer is idempotent enough
    // that a rare rollback just leaves an unused sign-in email.
    const invite: CreatedInvite = await insertInvite(
      actor,
      {
        communityId: community.id,
        spaceId: null,
        communityRole: "OWNER",
        spaceRole: null,
        label: community.name,
        email: ownerEmail,
        expiresInDays: 14,
        sendEmail: true,
      },
      tx,
    );

    return { community, spaces: createdSpaces, ownerInvite: invite, ownerAlreadyMember: Boolean(owner) };
  });
}

export async function setCommunityStatus(actor: User, communityId: string, status: "ACTIVE" | "SUSPENDED") {
  if (!global.canSuspend(actor.globalRole)) throw fail.forbidden();
  const [row] = await db.update(communities).set({ status }).where(eq(communities.id, communityId)).returning();
  if (!row) throw fail.notFound("Community not found");
  await logActivity({
    actorUserId: actor.id,
    actionType: status === "SUSPENDED" ? "SUSPEND_COMMUNITY" : "REACTIVATE_COMMUNITY",
    communityId,
    entityType: "community",
    entityId: communityId,
  });
  return row;
}

export async function deleteCommunity(actor: User, communityId: string, confirmSlug: string) {
  if (!global.canDeleteCommunity(actor.globalRole)) throw fail.forbidden();
  const [row] = await db.select().from(communities).where(eq(communities.id, communityId)).limit(1);
  if (!row) throw fail.notFound("Community not found");
  if (row.slug !== confirmSlug) throw fail.badRequest("Type the community slug to confirm deletion.");
  // Log first: the FK on activity_logs.community_id is SET NULL, so keep the name in metadata.
  await logActivity({
    actorUserId: actor.id,
    actionType: "DELETE_COMMUNITY",
    communityId,
    entityType: "community",
    entityId: communityId,
    metadata: { slug: row.slug, name: row.name },
  });
  await db.delete(communities).where(eq(communities.id, communityId));
}

/* ── Global House: community health (FR-7.3) ───────────────────────── */

export async function listCommunityHealth() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const dayAgo = new Date(Date.now() - 86_400_000);

  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      status: communities.status,
      createdAt: communities.createdAt,
      members: sql<number>`(select count(*)::int from ${communityMembers} cm where cm.community_id = ${communities.id})`,
      spaces: sql<number>`(select count(*)::int from ${spaces} s where s.community_id = ${communities.id} and s.archived_at is null)`,
      wau: sql<number>`(select count(distinct pl.user_id)::int from ${pointsLedger} pl where pl.community_id = ${communities.id} and pl.created_at >= ${since})`,
      dau: sql<number>`(select count(distinct pl.user_id)::int from ${pointsLedger} pl where pl.community_id = ${communities.id} and pl.created_at >= ${dayAgo})`,
      shipped: sql<number>`(select count(*)::int from ${submissions} sb where sb.community_id = ${communities.id} and sb.status = 'APPROVED')`,
      pendingReviews: sql<number>`(select count(*)::int from ${submissions} sb where sb.community_id = ${communities.id} and sb.status = 'PENDING')`,
      avgStreak: sql<number>`(select coalesce(round(avg(st.current)::numeric, 1), 0)::float from ${streaks} st join ${spaces} s2 on s2.id = st.space_id where s2.community_id = ${communities.id})`,
      owner: sql<string | null>`(select coalesce(u.name, u.email) from ${communityMembers} cm join ${users} u on u.id = cm.user_id where cm.community_id = ${communities.id} and cm.role = 'OWNER' order by cm.joined_at limit 1)`,
    })
    .from(communities)
    .orderBy(desc(communities.createdAt));

  return rows;
}

export async function getGlobalTotals() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [[c], [u], [a], [p]] = await Promise.all([
    db.select({ n: count() }).from(communities),
    db.select({ n: count() }).from(users),
    db.select({ n: sql<number>`count(distinct ${pointsLedger.userId})::int` }).from(pointsLedger).where(gte(pointsLedger.createdAt, since)),
    db.select({ n: count() }).from(activityLogs).where(gte(activityLogs.createdAt, since)),
  ]);
  return { communities: c.n, users: u.n, weeklyActive: a.n, events7d: p.n };
}

/* ── Member-facing ─────────────────────────────────────────────────── */

/** Communities the user belongs to (plus their spaces), for the portal switcher and home redirect. */
export async function listMyCommunities(user: User) {
  const memberships = await db
    .select({ community: communities, role: communityMembers.role })
    .from(communityMembers)
    .innerJoin(communities, eq(communities.id, communityMembers.communityId))
    .where(eq(communityMembers.userId, user.id))
    .orderBy(asc(communities.name));

  if (!memberships.length) return [];
  const ids = memberships.map((m) => m.community.id);
  const mySpaces = await db
    .select({ space: spaces, role: spaceMembers.role })
    .from(spaceMembers)
    .innerJoin(spaces, eq(spaces.id, spaceMembers.spaceId))
    .where(and(eq(spaceMembers.userId, user.id), inArray(spaceMembers.communityId, ids), isNull(spaces.archivedAt)))
    .orderBy(asc(spaces.position));

  return memberships.map((m) => ({
    ...m,
    spaces: mySpaces.filter((s) => s.space.communityId === m.community.id),
  }));
}

/** The community hub: every live space, member counts, and the caller's role in each. */
export async function getCommunityHub(access: CommunityAccess) {
  const rows = await db
    .select({
      space: spaces,
      members: sql<number>`(select count(*)::int from ${spaceMembers} sm where sm.space_id = ${spaces.id})`,
      mentors: sql<number>`(select count(*)::int from ${spaceMembers} sm where sm.space_id = ${spaces.id} and sm.role in ('LEAD','MANAGER','MENTOR'))`,
      myRole: spaceMembers.role,
    })
    .from(spaces)
    .leftJoin(spaceMembers, and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, access.user.id)))
    .where(and(eq(spaces.communityId, access.community.id), isNull(spaces.archivedAt)))
    .orderBy(asc(spaces.position), asc(spaces.name));

  const inherited = access.role === "OWNER" || access.role === "ADMIN";
  return rows
    .map((r) => ({ ...r, effectiveRole: (r.myRole ?? (inherited ? "LEAD" : null)) as SpaceRole | null }))
    .filter((r) => r.effectiveRole || r.space.joinPolicy === "OPEN");
}

export async function getCommunityStats(communityId: string) {
  const [[m], [s]] = await Promise.all([
    db.select({ n: count() }).from(communityMembers).where(eq(communityMembers.communityId, communityId)),
    db
      .select({ n: count() })
      .from(submissions)
      .where(and(eq(submissions.communityId, communityId), eq(submissions.status, "APPROVED"))),
  ]);
  return { members: m.n, shipped: s.n };
}

export type CreateSpaceInput = {
  name: string;
  slug?: string;
  description?: string | null;
  joinPolicy?: "OPEN" | "INVITE";
};

export async function createSpace(access: CommunityAccess, input: CreateSpaceInput) {
  if (!communityRules.canCreateSpaces(access.role)) throw fail.forbidden();
  const slug = (input.slug?.trim().toLowerCase() || slugify(input.name)) as string;
  if (!SLUG_PATTERN.test(slug)) throw fail.badRequest("Slug must be lowercase letters, numbers and hyphens.");
  if (RESERVED_SPACE_SLUGS.has(slug)) throw fail.badRequest(`"${slug}" is reserved. Pick another slug.`);

  const [exists] = await db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.communityId, access.community.id), eq(spaces.slug, slug)))
    .limit(1);
  if (exists) throw fail.conflict(`A space at /c/${access.community.slug}/${slug} already exists.`);

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${spaces.position}), -1)::int` })
    .from(spaces)
    .where(eq(spaces.communityId, access.community.id));

  const [row] = await db
    .insert(spaces)
    .values({
      communityId: access.community.id,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || null,
      joinPolicy: input.joinPolicy ?? "OPEN",
      position: max + 1,
    })
    .returning();

  await logActivity({
    actorUserId: access.user.id,
    actionType: "CREATE_SPACE",
    communityId: access.community.id,
    spaceId: row.id,
    entityType: "space",
    entityId: row.id,
    metadata: { slug, joinPolicy: row.joinPolicy },
  });
  return row;
}

/** Community members can join OPEN spaces as MEMBER without an invite. */
export async function joinOpenSpace(access: SpaceAccess) {
  if (access.spaceMembershipRole) return;
  if (access.space.joinPolicy !== "OPEN") throw fail.forbidden("This space is invite-only.");
  await db
    .insert(spaceMembers)
    .values({ spaceId: access.space.id, userId: access.user.id, communityId: access.community.id, role: "MEMBER" })
    .onConflictDoNothing();
  await logActivity({
    actorUserId: access.user.id,
    actionType: "MEMBER_JOINED",
    communityId: access.community.id,
    spaceId: access.space.id,
    entityType: "space",
    entityId: access.space.id,
  });
}

/* ── Team management ───────────────────────────────────────────────── */

export async function listSpaceMembers(spaceId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      githubUsername: users.githubUsername,
      role: spaceMembers.role,
      joinedAt: spaceMembers.joinedAt,
    })
    .from(spaceMembers)
    .innerJoin(users, eq(users.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(sql`array_position(array['LEAD','MANAGER','MENTOR','MEMBER']::space_role[], ${spaceMembers.role})`, asc(users.name));
}

export async function changeSpaceRole(access: SpaceAccess, targetUserId: string, to: SpaceRole) {
  if (targetUserId === access.user.id) throw fail.forbidden("You can't change your own role.");
  const [target] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, access.space.id), eq(spaceMembers.userId, targetUserId)))
    .limit(1);
  if (!target) throw fail.notFound("Member not found");
  if (!spaceRules.canChangeRole(access.spaceRole, target.role, to)) throw fail.forbidden();

  await db
    .update(spaceMembers)
    .set({ role: to })
    .where(and(eq(spaceMembers.spaceId, access.space.id), eq(spaceMembers.userId, targetUserId)));
  await logActivity({
    actorUserId: access.user.id,
    actionType: "ROLE_CHANGED",
    communityId: access.community.id,
    spaceId: access.space.id,
    entityType: "user",
    entityId: targetUserId,
    metadata: { scope: "space", from: target.role, to },
  });
}

export async function removeSpaceMember(access: SpaceAccess, targetUserId: string) {
  const [target] = await db
    .select({ role: spaceMembers.role })
    .from(spaceMembers)
    .where(and(eq(spaceMembers.spaceId, access.space.id), eq(spaceMembers.userId, targetUserId)))
    .limit(1);
  if (!target) throw fail.notFound("Member not found");
  const self = targetUserId === access.user.id;
  if (!self && !spaceRules.canRemove(access.spaceRole, target.role)) throw fail.forbidden();

  await db.delete(spaceMembers).where(and(eq(spaceMembers.spaceId, access.space.id), eq(spaceMembers.userId, targetUserId)));
  await logActivity({
    actorUserId: access.user.id,
    actionType: "MEMBER_REMOVED",
    communityId: access.community.id,
    spaceId: access.space.id,
    entityType: "user",
    entityId: targetUserId,
    metadata: { scope: "space", role: target.role, left: self },
  });
}

export async function listCommunityMembers(communityId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      githubUsername: users.githubUsername,
      role: communityMembers.role,
      joinedAt: communityMembers.joinedAt,
      spaces: sql<number>`(select count(*)::int from ${spaceMembers} sm where sm.community_id = ${communityId} and sm.user_id = ${users.id})`,
    })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(eq(communityMembers.communityId, communityId))
    .orderBy(sql`array_position(array['OWNER','ADMIN','MEMBER']::community_role[], ${communityMembers.role})`, asc(users.name));
}

export async function changeCommunityRole(access: CommunityAccess, targetUserId: string, to: CommunityRole) {
  if (targetUserId === access.user.id) throw fail.forbidden("You can't change your own role.");
  const [target] = await db
    .select({ role: communityMembers.role })
    .from(communityMembers)
    .where(and(eq(communityMembers.communityId, access.community.id), eq(communityMembers.userId, targetUserId)))
    .limit(1);
  if (!target) throw fail.notFound("Member not found");
  if (!communityRules.canChangeRole(access.role, target.role, to)) throw fail.forbidden();

  await db
    .update(communityMembers)
    .set({ role: to })
    .where(and(eq(communityMembers.communityId, access.community.id), eq(communityMembers.userId, targetUserId)));
  await logActivity({
    actorUserId: access.user.id,
    actionType: "ROLE_CHANGED",
    communityId: access.community.id,
    entityType: "user",
    entityId: targetUserId,
    metadata: { scope: "community", from: target.role, to },
  });
}
