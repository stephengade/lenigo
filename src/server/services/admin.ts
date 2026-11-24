import "server-only";
import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { activityLogs, communities, communityMembers, spaces, users, type User } from "@/server/db/schema";
import { logActivity } from "@/server/activity";
import { fail } from "@/server/auth/access";
import { env } from "@/server/env";
import { global, type GlobalRole } from "@/lib/permissions";

export type ActivityFilters = {
  community?: string; // slug
  action?: string;
  user?: string; // email or GitHub handle fragment
  before?: number; // cursor: activity id
  limit?: number;
};

/** FR-7.2: filterable, cursor-paginated global activity stream. */
export async function listActivity(filters: ActivityFilters) {
  const limit = Math.min(filters.limit ?? 50, 200);
  const conds: SQL[] = [];
  if (filters.community) conds.push(eq(communities.slug, filters.community));
  if (filters.action) conds.push(eq(activityLogs.actionType, filters.action));
  if (filters.user) {
    const q = `%${filters.user.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(users.email, q), ilike(users.githubUsername, q), ilike(users.name, q))!);
  }
  if (filters.before) conds.push(lt(activityLogs.id, filters.before));

  const rows = await db
    .select({
      id: activityLogs.id,
      actionType: activityLogs.actionType,
      entityType: activityLogs.entityType,
      entityId: activityLogs.entityId,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      actor: { id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, githubUsername: users.githubUsername },
      community: { slug: communities.slug, name: communities.name },
      space: { slug: spaces.slug, name: spaces.name },
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.actorUserId))
    .leftJoin(communities, eq(communities.id, activityLogs.communityId))
    .leftJoin(spaces, eq(spaces.id, activityLogs.spaceId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activityLogs.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function listUsers(q?: string, limit = 100) {
  const search = q?.trim() ? `%${q.trim().replace(/[%_]/g, "")}%` : null;
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      githubUsername: users.githubUsername,
      globalRole: users.globalRole,
      createdAt: users.createdAt,
      lastSeenAt: users.lastSeenAt,
      deactivatedAt: users.deactivatedAt,
      communities: sql<string[]>`coalesce((select array_agg(c.slug order by c.slug) from ${communityMembers} cm join ${communities} c on c.id = cm.community_id where cm.user_id = ${users.id}), '{}')`,
    })
    .from(users)
    .where(search ? or(ilike(users.email, search), ilike(users.name, search), ilike(users.githubUsername, search)) : undefined)
    .orderBy(sql`array_position(array['SUPER_ADMIN','ADMIN','VIEWER','USER']::global_role[], ${users.globalRole})`, desc(users.createdAt))
    .limit(limit);
}

export async function setGlobalRole(actor: User, targetUserId: string, role: GlobalRole) {
  if (!global.canAssignGlobalRoles(actor.globalRole)) throw fail.forbidden();
  if (targetUserId === actor.id) throw fail.forbidden("You can't change your own global role.");

  const [target] = await db.select({ role: users.globalRole }).from(users).where(eq(users.id, targetUserId)).limit(1);
  if (!target) throw fail.notFound("User not found");

  if (target.role === "SUPER_ADMIN" && role !== "SUPER_ADMIN") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.globalRole, "SUPER_ADMIN"));
    if (n <= 1) throw fail.conflict("At least one Super Admin must remain.");
  }

  await db.update(users).set({ globalRole: role }).where(eq(users.id, targetUserId));
  await logActivity({
    actorUserId: actor.id,
    actionType: "GLOBAL_ROLE_CHANGED",
    entityType: "user",
    entityId: targetUserId,
    metadata: { from: target.role, to: role },
  });
}

/**
 * Deactivate (or restore) a person platform-wide. A deactivated account can't sign in or use
 * the API (see getSessionUser), but nothing is deleted: memberships, points and history stay,
 * and reactivating restores everything. Super Admins can't be deactivated: demote them first.
 */
export async function setUserActive(actor: User, targetUserId: string, active: boolean) {
  if (!global.canDeactivateUsers(actor.globalRole)) throw fail.forbidden();
  if (targetUserId === actor.id) throw fail.forbidden("You can't deactivate yourself.");
  const [target] = await db
    .select({ email: users.email, role: users.globalRole, deactivatedAt: users.deactivatedAt })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) throw fail.notFound("User not found");
  if (!active && (target.role === "SUPER_ADMIN" || env.SUPER_ADMIN_EMAILS.includes(target.email.toLowerCase()))) {
    throw fail.forbidden("Super Admins can't be deactivated. Change their global role first.");
  }
  if (active === !target.deactivatedAt) return;

  await db
    .update(users)
    .set(active ? { deactivatedAt: null, deactivatedById: null } : { deactivatedAt: new Date(), deactivatedById: actor.id })
    .where(eq(users.id, targetUserId));
  await logActivity({
    actorUserId: actor.id,
    actionType: active ? "USER_REACTIVATED" : "USER_DEACTIVATED",
    entityType: "user",
    entityId: targetUserId,
  });
}

/** Activity counts per day for the last 14 days, for the Global House sparkline. */
export async function activityByDay(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${activityLogs.createdAt}), 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(activityLogs)
    .where(sql`${activityLogs.createdAt} >= ${since.toISOString()}::timestamptz`)
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const map = new Map(rows.map((r) => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    return { day: d, n: map.get(d) ?? 0 };
  });
}
