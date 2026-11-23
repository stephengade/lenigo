import "server-only";
import { Elysia, t } from "elysia";
import { getSessionUser } from "@/server/auth/session";
import { AppError, fail, getCommunityAccess, getSpaceAccess, requireSpaceRole } from "@/server/auth/access";
import { ACTION_TYPES } from "@/server/activity";
import {
  changeCommunityRole,
  changeSpaceRole,
  createSpace,
  deleteCommunity,
  joinOpenSpace,
  provisionCommunity,
  removeSpaceMember,
  setCommunityStatus,
} from "@/server/services/communities";
import { createCommunityInvite, createSpaceInvite, redeemInvite, revokeInvite } from "@/server/services/invites";
import { listActivity, setGlobalRole } from "@/server/services/admin";
import { community as communityRules, global, space as spaceRules } from "@/lib/permissions";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/**
 * Errors become raw JSON Responses. The handler is typed `never` on purpose so error bodies
 * don't leak into Eden's success types; clients read them via apiError() in lib/api.ts.
 */
function toErrorResponse(code: string | number, error: unknown): Response {
  if (error instanceof AppError) return json(error.status, { error: error.message });
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
  .macro({
    auth: {
      async resolve() {
        const user = await getSessionUser();
        if (!user) throw fail.unauthorized();
        return { user };
      },
    },
  })

  .get("/health", () => ({ ok: true, at: new Date().toISOString() }))
  .get("/me", ({ user }) => ({ id: user.id, email: user.email, name: user.name, globalRole: user.globalRole }), { auth: true })

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
  .post("/invites/:token/redeem", ({ user, params }) => redeemInvite(user, params.token), {
    auth: true,
    params: t.Object({ token: t.String({ minLength: 16, maxLength: 64 }) }),
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
          if (!communityRules.invitableRoles(access.role).length) throw fail.forbidden();
          await revokeInvite(user, { communityId: access.community.id }, params.inviteId);
          return { ok: true };
        },
        { auth: true, params: t.Object({ community: Slug, inviteId: t.String({ format: "uuid" }) }) },
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
          await revokeInvite(user, { communityId: access.community.id, spaceId: access.space.id }, params.inviteId);
          return { ok: true };
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
