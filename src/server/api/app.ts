import "server-only";
import { Elysia, t } from "elysia";
import { AppError, fail, getCommunityAccess, getSpaceAccess, requireSpaceRole } from "@/server/auth/access";
import { authMacro } from "@/server/api/auth-macro";
import { spaceRoutes } from "@/server/api/space-routes";
import { updateProfile } from "@/server/services/profiles";
import { ACTION_TYPES } from "@/server/activity";
import {
  changeCommunityRole,
  changeSpaceRole,
  createSpace,
  deleteCommunity,
  handOverLead,
  joinOpenSpace,
  provisionCommunity,
  removeCommunityMember,
  removeSpaceMember,
  setCommunityStatus,
} from "@/server/services/communities";
import { createCommunityInvite, createSpaceInvite, redeemInvite, redeemMyInvite, resendInvite, revokeInvite } from "@/server/services/invites";
import { listActivity, setGlobalRole, setUserActive } from "@/server/services/admin";
import { setCommunityRequestStatus, submitCommunityRequest } from "@/server/services/community-requests";
import { community as communityRules, global, space as spaceRules } from "@/lib/permissions";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Errors become raw JSON Responses. The handler is typed `never` on purpose so error bodies
 * don't leak into Eden's success types; clients read them via apiError() in lib/api.ts.
 */
function toErrorResponse(code: string | number, error: unknown): Response {
  if (error instanceof AppError) return json(error.status, { error: error.message });
  // A DB integrity trigger refused the write (0001/0002 migrations). Its message is written for people.
  const pg = dbError(error);
  if (pg?.code === "P0001") return json(409, { error: pg.message.charAt(0).toUpperCase() + pg.message.slice(1) + "." });
  if (pg?.code === "23505") return json(409, { error: "That already exists." });
  if (code === "VALIDATION") {
    const all = (error as { all?: Array<{ path?: string; schema?: { error?: string } }> }).all ?? [];
    const first = all[0];
    const field = first?.path ? String(first.path).replace(/^\//, "") : undefined;
    const message = first?.schema?.error;
    return json(422, { error: message || (field ? `Check the ${field} field.` : "Some fields are invalid."), field });
  }
  if (code === "NOT_FOUND") return json(404, { error: "Not found" });
  if (code === "PARSE") return json(400, { error: "Malformed request body." });
  console.error("[api]", error);
  return json(500, { error: "Something went wrong on our side." });
}

/** postgres-js errors arrive directly or wrapped by Drizzle (`cause`). */
function dbError(error: unknown): { code: string; message: string } | null {
  for (let e = error as { code?: unknown; message?: unknown; cause?: unknown } | undefined, i = 0; e && i < 3; e = e.cause as typeof e, i++) {
    if (typeof e.code === "string" && typeof e.message === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return { code: e.code, message: e.message };
  }
  return null;
}

const Slug = t.String({ pattern: "^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$", error: "Use lowercase letters, numbers and hyphens." });
const Email = t.String({ format: "email", error: "Enter a valid email address." });
const SpaceRoleT = t.Union([t.Literal("LEAD"), t.Literal("MANAGER"), t.Literal("MENTOR"), t.Literal("MEMBER")]);
const CommunityRoleT = t.Union([t.Literal("OWNER"), t.Literal("ADMIN"), t.Literal("MEMBER")]);
const GlobalRoleT = t.Union([t.Literal("SUPER_ADMIN"), t.Literal("ADMIN"), t.Literal("VIEWER"), t.Literal("USER")]);

const InviteBody = t.Object({
  email: t.Optional(t.Union([Email, t.Literal(""), t.Null()])),
  maxUses: t.Optional(t.Union([t.Integer({ minimum: 1, maximum: 1000 }), t.Null()])),
  expiresInDays: t.Optional(t.Integer({ minimum: 1, maximum: 90 })),
  sendEmail: t.Optional(t.Boolean()),
});

/**
 * The Lenigo HTTP API, served by Next.js at /api/* (see app/api/[[...slugs]]/route.ts).
 * Every route resolves the caller from the Supabase session cookie, then a service
 * re-checks tenant scope and role. Clients use the typed Eden client in lib/api.ts.
 */
export const app = new Elysia({ prefix: "/api" })
  .error({ AppError })
  // Errors are returned as raw Responses so they don't leak into Eden's success types.
  // Clients read them as `error.value.error` (see apiError in lib/api.ts).
  .onError(({ code, error }) => toErrorResponse(code, error) as never)
  .use(authMacro)

  .get("/health", () => ({ ok: true, at: new Date().toISOString() }))
  // Public: the landing page's "Bring your community" form. Rate-limited in the service.
  .post(
    "/community-requests",
    async ({ body, request }) => {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
      return await submitCommunityRequest(body, ip);
    },
    {
      body: t.Object({
        name: t.String({ maxLength: 80 }),
        email: t.String({ maxLength: 254 }),
        communityName: t.String({ maxLength: 120 }),
        size: t.String({ maxLength: 20 }),
        location: t.Optional(t.Union([t.String({ maxLength: 120 }), t.Null()])),
        about: t.String({ maxLength: 2000 }),
        link: t.Optional(t.Union([t.String({ maxLength: 300 }), t.Null()])),
        website: t.Optional(t.Union([t.String({ maxLength: 300 }), t.Null()])),
      }),
    },
  )
  .get("/me", ({ user }) => ({ id: user.id, email: user.email, name: user.name, globalRole: user.globalRole }), { auth: true })
  .patch(
    "/me",
    async ({ user, body }) => {
      const row = await updateProfile(user, body);
      return { username: row.username };
    },
    {
      auth: true,
      body: t.Object({
        name: t.Optional(t.String({ maxLength: 60 })),
        username: t.Optional(t.String({ maxLength: 30 })),
        bio: t.Optional(t.Union([t.String({ maxLength: 280 }), t.Null()])),
        emailNotifications: t.Optional(t.Boolean()),
      }),
    },
  )

  /* ── Learning, accountability, workshops (server/api/space-routes.ts) ── */
  .use(spaceRoutes)

  /* ── Global House ───────────────────────────────────────────── */
  .group("/admin", (g) =>
    g
      .post(
        "/communities",
        async ({ user, body }) => {
          const res = await provisionCommunity(user, body);
          return {
            slug: res.community.slug,
            spaces: res.spaces.map((s) => s.slug),
            ownerInviteUrl: res.ownerInvite.url,
            emailed: res.ownerInvite.emailed,
            emailError: res.ownerInvite.emailError,
            ownerAlreadyMember: res.ownerAlreadyMember,
          };
        },
        {
          auth: true,
          body: t.Object({
            name: t.String({ minLength: 2, maxLength: 80, error: "Name must be 2–80 characters." }),
            slug: Slug,
            description: t.Optional(t.String({ maxLength: 500 })),
            ownerEmail: Email,
            timezone: t.Optional(t.String({ maxLength: 64 })),
            spaces: t.Array(t.String({ maxLength: 60 }), { maxItems: 20 }),
          }),
        },
      )
      .patch(
        "/communities/:id/status",
        async ({ user, params, body }) => {
          const row = await setCommunityStatus(user, params.id, body.status);
          return { status: row.status };
        },
        {
          auth: true,
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ status: t.Union([t.Literal("ACTIVE"), t.Literal("SUSPENDED")]) }),
        },
      )
      .delete(
        "/communities/:id",
        async ({ user, params, body }) => {
          await deleteCommunity(user, params.id, body.confirmSlug);
          return { ok: true };
        },
        { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }), body: t.Object({ confirmSlug: t.String() }) },
      )
      .patch(
        "/users/:id/role",
        async ({ user, params, body }) => {
          await setGlobalRole(user, params.id, body.role);
          return { ok: true };
        },
        { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }), body: t.Object({ role: GlobalRoleT }) },
      )
      .patch(
        "/users/:id/active",
        async ({ user, params, body }) => {
          await setUserActive(user, params.id, body.active);
          return { ok: true };
        },
        { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }), body: t.Object({ active: t.Boolean() }) },
      )
      .patch(
        "/community-requests/:id",
        async ({ user, params, body }) => {
          await setCommunityRequestStatus(user, params.id, body.status);
          return { ok: true };
        },
        {
          auth: true,
          params: t.Object({ id: t.String({ format: "uuid" }) }),
          body: t.Object({ status: t.Union([t.Literal("NEW"), t.Literal("CONTACTED"), t.Literal("PROVISIONED"), t.Literal("DECLINED")]) }),
        },
      )
      .get(
        "/activity",
        async ({ user, query }) => {
          if (!global.canEnterHouse(user.globalRole)) throw fail.forbidden();
          return listActivity({ ...query, before: query.before ? Number(query.before) : undefined });
        },
        {
          auth: true,
          query: t.Object({
            community: t.Optional(t.String()),
            action: t.Optional(t.Union(ACTION_TYPES.map((a) => t.Literal(a)))),
            user: t.Optional(t.String({ maxLength: 120 })),
            before: t.Optional(t.Numeric()),
          }),
        },
      ),
  )

  /* ── Invites ────────────────────────────────────────────────── */
  // Handlers that can fail must be `async`: Elysia reads the source to pick its wrapper, and a
  // plain arrow returning a rejected promise skips onError (the client got an empty 500).
  .post("/invites/:token/redeem", async ({ user, params }) => await redeemInvite(user, params.token), {
    auth: true,
    params: t.Object({ token: t.String({ minLength: 16, maxLength: 64 }) }),
  })
  // Accept an invite sent to the signed-in user's own email, from /c (no link needed).
  .post("/me/invites/:id/accept", async ({ user, params }) => await redeemMyInvite(user, params.id), {
    auth: true,
    params: t.Object({ id: t.String({ format: "uuid", error: "Invalid invite." }) }),
  })

  /* ── Community scope: /api/c/:community/… ───────────────────── */
  .group("/c/:community", { params: t.Object({ community: Slug }) }, (g) =>
    g
      .post(
        "/spaces",
        async ({ user, params, body }) => {
          const access = await getCommunityAccess(user, params.community);
          const row = await createSpace(access, body);
          return { slug: row.slug };
        },
        {
          auth: true,
          body: t.Object({
            name: t.String({ minLength: 2, maxLength: 60, error: "Name must be 2–60 characters." }),
            slug: t.Optional(Slug),
            description: t.Optional(t.String({ maxLength: 300 })),
            joinPolicy: t.Optional(t.Union([t.Literal("OPEN"), t.Literal("INVITE")])),
          }),
        },
      )
      .post(
        "/invites",
        async ({ user, params, body }) => {
          const access = await getCommunityAccess(user, params.community);
          const { role, ...rest } = body;
          return createCommunityInvite(access, role, rest);
        },
        { auth: true, body: t.Composite([t.Object({ role: CommunityRoleT }), InviteBody]) },
      )
      .delete(
        "/invites/:inviteId",
        async ({ user, params }) => {
          const access = await getCommunityAccess(user, params.community);
          const roles: string[] = communityRules.invitableRoles(access.role);
          if (!roles.length) throw fail.forbidden();
          await revokeInvite(user, { communityId: access.community.id }, params.inviteId, (r) => roles.includes(r));
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, inviteId: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/invites/:inviteId/resend",
        async ({ user, params }) => {
          const access = await getCommunityAccess(user, params.community);
          const roles: string[] = communityRules.invitableRoles(access.role);
          return await resendInvite(user, { communityId: access.community.id }, params.inviteId, (r) => roles.includes(r));
        },
        { auth: true, params: t.Object({ community: Slug, inviteId: t.String({ format: "uuid" }) }) },
      )
      .delete(
        "/members/:userId",
        async ({ user, params }) => {
          const access = await getCommunityAccess(user, params.community);
          await removeCommunityMember(access, params.userId);
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, userId: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/members/:userId/hand-over",
        async ({ user, params }) => {
          const access = await getCommunityAccess(user, params.community);
          await handOverLead(access, params.userId);
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, userId: t.String({ format: "uuid" }) }) },
      )
      .patch(
        "/members/:userId",
        async ({ user, params, body }) => {
          const access = await getCommunityAccess(user, params.community);
          await changeCommunityRole(access, params.userId, body.role);
          return { ok: true };
        },
        {
          auth: true,
          params: t.Object({ community: Slug, userId: t.String({ format: "uuid" }) }),
          body: t.Object({ role: CommunityRoleT }),
        },
      )

      /* ── Space scope: /api/c/:community/:space/… ───────────── */
      .post(
        "/:space/join",
        async ({ user, params }) => {
          const access = await getSpaceAccess(user, params.community, params.space);
          await joinOpenSpace(access);
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, space: Slug }) },
      )
      .post(
        "/:space/invites",
        async ({ user, params, body }) => {
          const access = await requireSpaceRole(user, params.community, params.space);
          const { role, ...rest } = body;
          return createSpaceInvite(access, role, rest);
        },
        {
          auth: true,
          params: t.Object({ community: Slug, space: Slug }),
          body: t.Composite([t.Object({ role: SpaceRoleT }), InviteBody]),
        },
      )
      .delete(
        "/:space/invites/:inviteId",
        async ({ user, params }) => {
          const access = await requireSpaceRole(user, params.community, params.space, spaceRules.canViewTeam);
          const roles: string[] = spaceRules.invitableRoles(access.spaceRole);
          await revokeInvite(user, { communityId: access.community.id, spaceId: access.space.id }, params.inviteId, (r) => roles.includes(r));
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, space: Slug, inviteId: t.String({ format: "uuid" }) }) },
      )
      .post(
        "/:space/invites/:inviteId/resend",
        async ({ user, params }) => {
          const access = await requireSpaceRole(user, params.community, params.space);
          const roles: string[] = spaceRules.invitableRoles(access.spaceRole);
          return await resendInvite(
            user,
            { communityId: access.community.id, spaceId: access.space.id },
            params.inviteId,
            (r) => roles.includes(r),
          );
        },
        { auth: true, params: t.Object({ community: Slug, space: Slug, inviteId: t.String({ format: "uuid" }) }) },
      )
      .patch(
        "/:space/members/:userId",
        async ({ user, params, body }) => {
          const access = await requireSpaceRole(user, params.community, params.space, spaceRules.canViewTeam);
          await changeSpaceRole(access, params.userId, body.role);
          return { ok: true };
        },
        {
          auth: true,
          params: t.Object({ community: Slug, space: Slug, userId: t.String({ format: "uuid" }) }),
          body: t.Object({ role: SpaceRoleT }),
        },
      )
      .delete(
        "/:space/members/:userId",
        async ({ user, params }) => {
          const access = await requireSpaceRole(user, params.community, params.space);
          await removeSpaceMember(access, params.userId);
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, space: Slug, userId: t.String({ format: "uuid" }) }) },
      ),
  );

export type App = typeof app;
