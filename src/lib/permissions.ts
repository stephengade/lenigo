/**
 * Pure RBAC rules, shared by the server (enforcement) and the UI (what to show).
 * The server is the only enforcer; the UI just hides what would be refused.
 */

export type GlobalRole = "SUPER_ADMIN" | "ADMIN" | "VIEWER" | "USER";
export type CommunityRole = "OWNER" | "ADMIN" | "MEMBER";
export type SpaceRole = "LEAD" | "MANAGER" | "MENTOR" | "MEMBER";

export const GLOBAL_ROLES: GlobalRole[] = ["SUPER_ADMIN", "ADMIN", "VIEWER", "USER"];
export const COMMUNITY_ROLES: CommunityRole[] = ["OWNER", "ADMIN", "MEMBER"];
export const SPACE_ROLES: SpaceRole[] = ["LEAD", "MANAGER", "MENTOR", "MEMBER"];

export const ROLE_LABEL: Record<GlobalRole | CommunityRole | SpaceRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  VIEWER: "Viewer",
  USER: "User",
  OWNER: "Owner",
  MEMBER: "Member",
  LEAD: "Lead",
  MANAGER: "Manager",
  MENTOR: "Mentor",
};

/* ── Global House ─────────────────────────────────────────── */

export const global = {
  canEnterHouse: (r: GlobalRole) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "VIEWER",
  canProvision: (r: GlobalRole) => r === "SUPER_ADMIN" || r === "ADMIN",
  canSuspend: (r: GlobalRole) => r === "SUPER_ADMIN" || r === "ADMIN",
  canDeleteCommunity: (r: GlobalRole) => r === "SUPER_ADMIN",
  canAssignGlobalRoles: (r: GlobalRole) => r === "SUPER_ADMIN",
  /** Super Admins can open and act inside any community as if they were its Owner. */
  overridesCommunities: (r: GlobalRole) => r === "SUPER_ADMIN",
};

/* ── Community (e.g. GDG OAU) ─────────────────────────────── */

const COMMUNITY_RANK: Record<CommunityRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

export const community = {
  canManageSettings: (r: CommunityRole | null) => r === "OWNER",
  canCreateSpaces: (r: CommunityRole | null) => r === "OWNER" || r === "ADMIN",
  canViewMembers: (r: CommunityRole | null) => r === "OWNER" || r === "ADMIN",
  /** Owners invite Owners/Admins/Members; Admins invite Members only. */
  invitableRoles(r: CommunityRole | null): CommunityRole[] {
    if (r === "OWNER") return ["OWNER", "ADMIN", "MEMBER"];
    if (r === "ADMIN") return ["MEMBER"];
    return [];
  },
  /** Can `actor` change `target` from its current role to `to`? Nobody edits a peer or senior. */
  canChangeRole(actor: CommunityRole | null, target: CommunityRole, to: CommunityRole) {
    if (actor === "OWNER") return true;
    if (actor === "ADMIN") return COMMUNITY_RANK[target] < 2 && COMMUNITY_RANK[to] < 2;
    return false;
  },
};

/** Community Owners and Admins act as Lead in every space of their community. */
export function spaceRoleFromCommunity(r: CommunityRole | null): SpaceRole | null {
  return r === "OWNER" || r === "ADMIN" ? "LEAD" : null;
}

/* ── Space (e.g. GDG OAU › Web Development) ───────────────── */

const SPACE_RANK: Record<SpaceRole, number> = { LEAD: 4, MANAGER: 3, MENTOR: 2, MEMBER: 1 };

export const space = {
  canManageSettings: (r: SpaceRole | null) => r === "LEAD",
  canViewTeam: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER",
  canEditCurriculum: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER",
  canReview: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
  canSeeAnswerKeys: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
  bypassesLocks: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
  canScheduleWorkshops: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
  canModerate: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER",
  /** PRD FR-1.3 + §4.2: only Leads assign Lead/Manager; Managers invite Mentors and Members. */
  invitableRoles(r: SpaceRole | null): SpaceRole[] {
    if (r === "LEAD") return ["LEAD", "MANAGER", "MENTOR", "MEMBER"];
    if (r === "MANAGER") return ["MENTOR", "MEMBER"];
    return [];
  },
  canChangeRole(actor: SpaceRole | null, target: SpaceRole, to: SpaceRole) {
    if (actor === "LEAD") return true;
    if (actor === "MANAGER") return SPACE_RANK[target] < 3 && SPACE_RANK[to] < 3;
    return false;
  },
  canRemove(actor: SpaceRole | null, target: SpaceRole) {
    if (actor === "LEAD") return true;
    if (actor === "MANAGER") return SPACE_RANK[target] < 3;
    return false;
  },
};

/** Reserved space slugs: they would collide with community-level routes under /c/[community]/… */
export const RESERVED_SPACE_SLUGS = new Set([
  "settings",
  "members",
  "spaces",
  "team",
  "admin",
  "invite",
  "new",
  "api",
  "join",
]);

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
