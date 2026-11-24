import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  communities,
  communityMembers,
  spaceMembers,
  spaces,
  type Community,
  type Space,
  type User,
} from "@/server/db/schema";
import {
  global,
  spaceRoleFromCommunity,
  type CommunityRole,
  type SpaceRole,
} from "@/lib/permissions";

/** Thrown by services; the API maps `status` to the HTTP response, pages map it to notFound()/redirects. */
export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const fail = {
  badRequest: (m = "Bad request") => new AppError(400, m),
  unauthorized: (m = "Sign in to continue") => new AppError(401, m),
  forbidden: (m = "You don't have permission to do that") => new AppError(403, m),
  notFound: (m = "Not found") => new AppError(404, m),
  conflict: (m: string) => new AppError(409, m),
  gone: (m: string) => new AppError(410, m),
  tooMany: (m: string) => new AppError(429, m),
};

export type CommunityAccess = {
  user: User;
  community: Community;
  /** The user's actual membership role, if any. */
  membershipRole: CommunityRole | null;
  /** What the user may do here: membership role, or OWNER for a Super Admin override. */
  role: CommunityRole | null;
  isOverride: boolean;
};

export type SpaceAccess = CommunityAccess & {
  space: Space;
  spaceMembershipRole: SpaceRole | null;
  /** Effective role: the higher of the space membership and the role inherited from the community. */
  spaceRole: SpaceRole | null;
};

/** A space the caller has joined (or leads through the community): spaceRole is set. */
export type MemberAccess = SpaceAccess & { spaceRole: SpaceRole };

const SPACE_RANK: Record<SpaceRole, number> = { LEAD: 4, MANAGER: 3, MENTOR: 2, MEMBER: 1 };
const higher = (a: SpaceRole | null, b: SpaceRole | null) => (!a ? b : !b ? a : SPACE_RANK[a] >= SPACE_RANK[b] ? a : b);

/**
 * Resolve a community by slug and the caller's rights in it.
 * 404 if it doesn't exist or the caller has no relationship to it (existence isn't leaked).
 */
export async function getCommunityAccess(user: User, communitySlug: string): Promise<CommunityAccess> {
  const [row] = await db
    .select({ community: communities, membershipRole: communityMembers.role })
    .from(communities)
    .leftJoin(
      communityMembers,
      and(eq(communityMembers.communityId, communities.id), eq(communityMembers.userId, user.id)),
    )
    .where(eq(communities.slug, communitySlug))
    .limit(1);

  if (!row) throw fail.notFound("Community not found");

  const isOverride = !row.membershipRole && global.overridesCommunities(user.globalRole);
  const role: CommunityRole | null = row.membershipRole ?? (isOverride ? "OWNER" : null);
  if (!role) throw fail.notFound("Community not found");

  if (row.community.status === "SUSPENDED" && !global.overridesCommunities(user.globalRole)) {
    throw new AppError(410, `${row.community.name} is currently suspended.`);
  }

  return { user, community: row.community, membershipRole: row.membershipRole, role, isOverride };
}

/**
 * Resolve a space inside a community. Community members without a space role can still
 * "see" an OPEN space (to join it); everything else in the space needs a spaceRole.
 */
export async function getSpaceAccess(user: User, communitySlug: string, spaceSlug: string): Promise<SpaceAccess> {
  const c = await getCommunityAccess(user, communitySlug);

  const [row] = await db
    .select({ space: spaces, spaceMembershipRole: spaceMembers.role })
    .from(spaces)
    .leftJoin(spaceMembers, and(eq(spaceMembers.spaceId, spaces.id), eq(spaceMembers.userId, user.id)))
    .where(and(eq(spaces.communityId, c.community.id), eq(spaces.slug, spaceSlug), isNull(spaces.archivedAt)))
    .limit(1);

  if (!row) throw fail.notFound("Space not found");

  const spaceRole = higher(row.spaceMembershipRole, spaceRoleFromCommunity(c.role));
  if (!spaceRole && row.space.joinPolicy !== "OPEN") throw fail.notFound("Space not found");

  return { ...c, space: row.space, spaceMembershipRole: row.spaceMembershipRole, spaceRole };
}

/** Same as getSpaceAccess, but requires an actual space role (not just visibility). */
export async function requireSpaceRole(
  user: User,
  communitySlug: string,
  spaceSlug: string,
  check: (r: SpaceRole | null) => boolean = (r) => r !== null,
) {
  const access = await getSpaceAccess(user, communitySlug, spaceSlug);
  if (!access.spaceRole) throw fail.forbidden("Join this space first");
  if (!check(access.spaceRole)) throw fail.forbidden();
  return access as MemberAccess;
}
