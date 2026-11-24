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
  OWNER: "Community Lead",
  MEMBER: "Member",
  LEAD: "Space Lead",
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
  /** Deactivate/reactivate a person platform-wide (they can't sign in; history is kept). */
  canDeactivateUsers: (r: GlobalRole) => r === "SUPER_ADMIN",
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
  /** Remove someone from the community (and all its spaces). Admins remove Members only. */
  canRemove(actor: CommunityRole | null, target: CommunityRole) {
    if (actor === "OWNER") return true;
    if (actor === "ADMIN") return COMMUNITY_RANK[target] < 2;
    return false;
  },
  /** Hand the Community Lead role to another member (the DB keeps at least one Lead). */
  canHandOver: (r: CommunityRole | null) => r === "OWNER",
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
  /** Mentors and above review AND score capstone projects (never their own: DB trigger). */
  canScoreSubmissions: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
  /** Attendance at standup reviews / workshops is marked by staff, never by the attendee. */
  canMarkAttendance: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
  /** Mentors and Leads move a learner up a level (one step, with a reason). Managers cannot. Members can never change their own. */
  canPromoteLevel: (r: SpaceRole | null) => r === "LEAD" || r === "MENTOR",
  /** A learner's FIRST track is their own pick; any further track needs a Mentor or Lead to approve it (DB-enforced). */
  canApproveExtraTrack: (r: SpaceRole | null) => r === "LEAD" || r === "MENTOR",
  /** Once a learner has started a branch ("pick one", e.g. React vs Vue), only a Mentor or Lead can switch it (DB-enforced). */
  canSwitchBranch: (r: SpaceRole | null) => r === "LEAD" || r === "MENTOR",
  /** Placement tests are reviewed by Mentors and above; the review only RECOMMENDS, a Mentor or Lead still promotes. */
  canReviewPlacement: (r: SpaceRole | null) => r === "LEAD" || r === "MANAGER" || r === "MENTOR",
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

/* ── Learning levels ──────────────────────────────────────── */

/**
 * Every track has three steps. The tier is the internal order; what a space CALLS each
 * step comes from levels.title ("Foundations", "Junior"...). LEVEL_LABEL is only the fallback.
 * A learner's tier is per track (track_enrollments), never per space.
 */
export type LevelTier = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export const LEVELS: LevelTier[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];
export const LEVEL_LABEL: Record<LevelTier, string> = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" };
const LEVEL_RANK: Record<LevelTier, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

export const level = {
  rank: (l: LevelTier) => LEVEL_RANK[l],
  /** Learners see their own tier in that track and below; staff (Mentor+) see every level. */
  canAccess(role: SpaceRole | null, memberLevel: LevelTier, contentLevel: LevelTier) {
    return space.bypassesLocks(role) || LEVEL_RANK[contentLevel] <= LEVEL_RANK[memberLevel];
  },
  /**
   * Content below the tier a learner reached through a placement test is "placed out":
   * they may open it, but it earns no points (otherwise placing out would hand experienced
   * learners points for work they didn't do here).
   */
  isPlacedOut(contentLevel: LevelTier, placedInto: LevelTier | null) {
    return placedInto !== null && LEVEL_RANK[contentLevel] < LEVEL_RANK[placedInto];
  },
  /** Promotions go up exactly one level at a time, and never to oneself (also enforced in SQL). */
  canPromote(actor: SpaceRole | null, actorId: string, targetId: string, from: LevelTier, to: LevelTier) {
    return space.canPromoteLevel(actor) && actorId !== targetId && LEVEL_RANK[to] === LEVEL_RANK[from] + 1;
  },
  next(l: LevelTier): LevelTier | null {
    return LEVELS[LEVELS.indexOf(l) + 1] ?? null;
  },
};

/**
 * What a learner must do to complete a module. Shown in the UI; enforced on the server.
 * There is no "mark as done" for videos: watch time is credited by the server.
 */
export const MODULE_REQUIREMENTS = [
  { key: "videos", label: "Watch every video", hint: "Handpicked lessons, mostly YouTube. Watch time is tracked; skipping ahead doesn't count." },
  { key: "checkpoints", label: "Pass each checkpoint", hint: "Short assessments between lessons." },
  { key: "project", label: "Ship the capstone project", hint: "A mentor reviews and scores it." },
] as const;

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
