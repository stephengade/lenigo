# Lenigo — Handoff

_Last updated: 2026-11-23 · Status: **Phase 1 built, not yet run against a real database**_

## TL;DR

Phase 1 of the PRD (multi-tenant core, auth, Global House, invites, RBAC, activity log) is implemented and compiles cleanly (`tsc`, `eslint` and `next build` all pass). The signed-in flows **have not been exercised end-to-end**, because no Supabase credentials were available. The next session should start by connecting Supabase, running migrations and walking through the Phase 1 acceptance test below.

## Decisions that differ from the PRD (made with the user)

| PRD said | We use | Why |
| --- | --- | --- |
| Prisma ORM | **Drizzle ORM** + `postgres` driver | User: "no prisma please, prisma throws errors a lot". Don't reintroduce it. |
| Next.js Server Actions / Route Handlers | **Elysia** mounted at `/api/*` inside Next.js, **Eden** typed client | User's choice. |
| Auth.js (NextAuth v5) + Resend | **Supabase Auth** (GitHub OAuth + email magic links) | User is on Supabase. Its mailer replaces Resend. |
| Self-hosted/Neon Postgres | **Supabase Postgres** | User's choice. |
| Single-level tenant `/c/<slug>` | **Community → Space** two-level tenancy | User: communities (GDG OAU, Claude Ambassadors) have sub-communities (Web Dev, Data Science…). |

### Tenancy model

```
Global House /admin                 globalRole: SUPER_ADMIN · ADMIN · VIEWER · USER
└── Community /c/gdg-oau            community_members.role: OWNER · ADMIN · MEMBER
    └── Space /c/gdg-oau/web-dev    space_members.role: LEAD · MANAGER · MENTOR · MEMBER
```

- The PRD's "Community Lead / Manager / Mentor / Member" roles now live at the **space** level.
- Community **Owner/Admin automatically act as LEAD in every space** (`spaceRoleFromCommunity`).
- **Super Admin** gets OWNER-equivalent override in any community, with a blue banner. Plain ADMIN/VIEWER do **not** get portal access.
- Spaces have `join_policy` set to `OPEN` (any community member can self-join as MEMBER) or `INVITE`.
- Space slugs in `RESERVED_SPACE_SLUGS` (`members`, `settings`, …) are blocked so they can't collide with community-level routes.

## Architecture map

```
src/
  lib/permissions.ts          ← THE RBAC matrix (pure, shared by server + UI). Start here.
  lib/api.ts                  ← Eden client `api` + `apiError()` helper
  server/
    env.ts                    zod-validated env (throws with a helpful list if missing)
    db/schema.ts              Drizzle schema for ALL 4 phases (24 tables, RLS enabled)
    db/seed.ts                standalone seed (no server-only imports)
    db/index.ts               postgres-js client, prepare:false (Supabase pooler)
    activity.ts               logActivity() + ACTION_TYPES list
    auth/session.ts           getSessionUser() (React cache), syncUserFromAuth()
    auth/access.ts            AppError, getCommunityAccess, getSpaceAccess, requireSpaceRole
    auth/guards.ts            page helpers: pageCommunity/pageSpace/pageSpaceRole/pageGlobalHouse
    services/communities.ts   provisioning, health, hub, spaces, members, role changes
    services/invites.ts       create/list/revoke/preview/redeem (token stored as SHA-256)
    services/admin.ts         activity stream (cursor), users, global roles, sparkline
    api/app.ts                Elysia routes; all mutations go through here
  app/
    api/[[...slugs]]/route.ts mounts Elysia
    auth/callback             OAuth ?code= → session → syncUser → redirect
    auth/confirm              magic link ?token_hash= → verifyOtp → syncUser
    admin/…                   Global House (overview, communities, new, [slug], activity, users)
    c/                        my communities
    c/[community]/            hub + /members
    c/[community]/[space]/    layout (sidebar, join gate), home, team, phase 2–4 placeholders
    invite/[token]/           preview + accept
drizzle/0000_init.sql         generated schema migration
drizzle/0001_immutable_ledgers.sql  trigger: UPDATE refused on points_ledger & activity_logs
```

### Conventions

- **Reads:** Server Components call services directly (no HTTP hop).
- **Writes:** Client Components call `api.…` (Eden). The Elysia route resolves access from the URL slug, and the service re-checks the role. Services never take tenant IDs from the request body.
- **Errors:** services throw `AppError(status, message)`. The API returns `{ error }` JSON. `onError` is cast to `never` on purpose so error shapes don't pollute Eden success types. Pages map 404 → `notFound()` and 403/410 → `/denied?reason=`.
- **Audit:** every mutation calls `logActivity(…, tx)` inside the same transaction where possible.
- **Points:** `points_ledger` is append-only, and `dedupe_key` (unique per space+user) makes awards idempotent, e.g. `quiz:<moduleId>` or `standup:2026-11-23`.
- **UI:** shadcn **base-nova** style, built on **Base UI**, not Radix. Use `render={<Link/>}` instead of `asChild`. For links styled as buttons, use `components/button-link.tsx`. Theme tokens are in `globals.css` (`ember`, `moss` and `sky`, each with a `-soft` variant), and headings use `font-display` (Bricolage Grotesque).

## Setup the next session must do first

1. `cp .env.example .env` and fill in the Supabase URL, anon key, `DATABASE_URL` (pooler :6543), `DIRECT_URL` (:5432) and `SUPER_ADMIN_EMAILS`.
2. In the Supabase dashboard, follow README → Setup:
   - add the redirect URL `http://localhost:3000/**`;
   - enable the GitHub provider;
   - change the **Magic Link** and **Confirm signup** templates to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email` (`type=signup` for Confirm signup). Without this, magic links fall back to `?code=` (PKCE), which only works on the same browser.
3. `pnpm db:migrate`, then `pnpm dev`, sign in once with the super-admin email, then `pnpm db:seed`.

## Phase 1 acceptance test (not yet run)

- [ ] Super Admin signs in → `/admin` loads, LOGIN appears in `/admin/activity`.
- [ ] Provision `gdg-oau` with spaces Web Development + Data Science and an owner email → owner gets the email and the invite link is shown.
- [ ] Owner opens the invite → becomes OWNER → sees both spaces with a LEAD badge.
- [ ] Owner invites a Lead to `web-dev`; that Lead invites a Manager and a Mentor.
- [ ] Manager can't see LEAD/MANAGER in the invite role picker, and the API refuses them if forced (403).
- [ ] Mentor can't open `/team` or `/curriculum` (redirected to `/denied`); can open `/review`.
- [ ] Community MEMBER can self-join an OPEN space and can't see an INVITE space.
- [ ] Single-use email invite can't be redeemed twice or by a different email.
- [ ] Suspending a community blocks members (410 → /denied) but not Super Admin.
- [ ] `UPDATE points_ledger …` in SQL fails with "append-only".

## Known gaps / risks

- **Nothing tested against a live DB.** Expect small SQL issues, e.g. the `array_position(...::space_role[])` ordering and the correlated subqueries in `listCommunityHealth`.
- `provisionCommunity` sends the owner email **inside** the transaction. If the transaction rolls back, an unused sign-in email may still have gone out. Moving the send to after commit would be cleaner.
- Supabase's built-in SMTP is heavily rate-limited (a few emails per hour). Use custom SMTP before inviting a real cohort.
- No tests yet. A good first target is `lib/permissions.ts` (pure functions) plus integration tests for `redeemInvite`.
- `listCommunityHealth` uses per-row subqueries, which is fine for tens of communities. Use materialized stats if it grows.
- `users` has no FK to `auth.users`; rows are synced on sign-in (`syncUserFromAuth`). Deleting a user in Supabase Auth doesn't delete the app row.
- Profile setup (`/u/[username]`) isn't built yet; `username` is auto-generated on first sign-in.
- The dev server sometimes keeps serving a stale root layout after `layout.tsx` edits. Restart it and delete `.next`.

## Next up: Phase 2 (curriculum and learning workspace)

Schema already exists: `tracks`, `levels`, `modules`, `resources`, `resource_progress`, `quiz_questions`, `quiz_attempts` and `submissions`.

1. `services/curriculum.ts`: CRUD + reorder + publish, gated by `space.canEditCurriculum`.
2. `/c/[c]/[s]/curriculum`: builder UI (tracks → levels → modules → resources and quiz).
3. `/c/[c]/[s]/roadmap`: track/level selector, module cards (locked/active/done). Unlocking requires a passed quiz plus a submitted action item, and `space.bypassesLocks` skips the locks.
4. `/c/[c]/[s]/modules/[id]`: YouTube IFrame API (≥85% watched = complete), article toggles, action lab, quiz with the 80% threshold and a 10-minute cooldown after 2 fails. Hide answer keys unless `canSeeAnswerKeys`.
5. Award points through a single `awardPoints()` helper using `dedupe_key`. Seed a Web Dev Beginner track.
