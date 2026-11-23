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
| Next.js 15 `middleware.ts` | **Next.js 16.4** + `src/proxy.ts` (`export function proxy`) | User asked for the current App Router conventions. Proxy runs on Node.js. |
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
src/proxy.ts                Next 16 Proxy: Supabase session refresh + signed-out redirect (lib/supabase/proxy.ts)
drizzle/0000_init.sql         generated schema migration
drizzle/0001_integrity_rules.sql   triggers: append-only tables, level changes only via promotion,
                                   no self-review, no self-marked attendance (NOT yet run on a real DB)
```

### Conventions

- **Reads:** Server Components call services directly (no HTTP hop).
- **Writes:** Client Components call `api.…` (Eden). The Elysia route resolves access from the URL slug, and the service re-checks the role. Services never take tenant IDs from the request body.
- **Errors:** services throw `AppError(status, message)`. The API returns `{ error }` JSON. `onError` is cast to `never` on purpose so error shapes don't pollute Eden success types. Pages map 404 → `notFound()` and 403/410 → `/denied?reason=`.
- **Audit:** every mutation calls `logActivity(…, tx)` inside the same transaction where possible.
- **Points:** `points_ledger` is append-only, and `dedupe_key` (unique per space+user) makes awards idempotent, e.g. `checkpoint:<id>`, `project:<submissionId>` or `standup:2026-11-23`. Award only through `awardPoints()` in `server/points/rules.ts`.
- **UI:** shadcn **base-nova** style, built on **Base UI**, not Radix. Use `render={<Link/>}` instead of `asChild`. For links styled as buttons, use `components/button-link.tsx`.
- **Design system (in progress, 2026-11-23):** user wants a sleek, clean, friendly look (soft panels, pill controls, starburst badges). Fonts: **Teachers** (`font-display`, headings and big numbers) + **Inter** (body/UI); Bricolage was rejected. Tokens in `globals.css`: `primary` = blue (actions), `ink` = near-black (selected/active, dark panels), `surface` (grey panel) < `card` (white), `sage` (brand bands), tints `lilac`/`sun`/`rose`/`mint` each with `-soft` and `-foreground`. Legacy `ember`/`moss`/`sky` are aliases until screens migrate. Prototype at **`/design`** (dev-only, 404 in production). **Work incrementally:** show a prototype and get approval before restyling real screens.

## Deployment (decided so far)

- No separate API server: Elysia runs inside the Next.js route handler, so it ships with the app as Node.js server functions. **VPS/Docker or Vercel** are safe. **Amplify** officially lists Next 12–15 for SSR, so Next 16 + `proxy.ts` there is unverified; test a preview deploy before committing to it.
- `NEXT_PUBLIC_*` vars are inlined **at build time**, so they must be set in the build environment. `env` (`server/env.ts`) and `db` (`server/db/index.ts`) are lazy Proxies, validated or connected on first use, so `next build` doesn't need `DATABASE_URL`.

## Security rules (user requirement: "be very careful … not weak")

- Supabase **secret key** (`sb_secret_…`, ex-service_role) only in a server-only `SUPABASE_SECRET_KEY` (never `NEXT_PUBLIC_`), used only from a `server-only` module, only behind Global House role checks, and every use is written to the activity log. Not added yet.
- Authorization is enforced on the server (Elysia routes + services + page guards). The proxy only refreshes sessions and redirects; never rely on it or on hidden UI for access control.
- Services never take tenant/role scope from the request body; tenant comes from the URL slug and is re-resolved per request.
- Dev-only routes (e.g. `/design`) must `notFound()` in production.

## Setup the next session must do first

1. `cp .env.example .env` and fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the dashboard's *Publishable key*, `sb_publishable_…`; a legacy anon key also works), `DATABASE_URL` (pooler :6543), `DIRECT_URL` (:5432) and `SUPER_ADMIN_EMAILS`.
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
- [ ] `UPDATE space_members SET level='ADVANCED'` without a promotion row fails; a reviewer inserting a review of their own submission fails.

## Known gaps / risks

- **Nothing tested against a live DB.** Expect small SQL issues, e.g. the `array_position(...::space_role[])` ordering and the correlated subqueries in `listCommunityHealth`.
- `provisionCommunity` sends the owner email **inside** the transaction. If the transaction rolls back, an unused sign-in email may still have gone out. Moving the send to after commit would be cleaner.
- Supabase's built-in SMTP is heavily rate-limited (a few emails per hour). Use custom SMTP before inviting a real cohort.
- No tests yet. A good first target is `lib/permissions.ts` (pure functions) plus integration tests for `redeemInvite`.
- `listCommunityHealth` uses per-row subqueries, which is fine for tens of communities. Use materialized stats if it grows.
- `users` has no FK to `auth.users`; rows are synced on sign-in (`syncUserFromAuth`). Deleting a user in Supabase Auth doesn't delete the app row.
- Profile setup (`/u/[username]`) isn't built yet; `username` is auto-generated on first sign-in.
- The dev server sometimes keeps serving a stale root layout after `layout.tsx` edits. Restart it and delete `.next`.

## Learning rules (user decisions, 2026-11-23)

These are product rules, not suggestions. The server and the DB enforce them; the UI only explains them.

1. **Levels are earned, not chosen.** `space_members.level` (BEGINNER → INTERMEDIATE → ADVANCED) changes only when a **Mentor or Lead** (user decision, 2026-11-23: Managers can NOT promote) promotes the learner one step, with a reason, recorded in append-only `level_promotions` (`level.canPromote()`; DB trigger refuses any other level change, and self-promotion). Learners only see content at their level or below (`level.canAccess()`).
2. **No skipping.** A module completes only when (a) every video is watched, with watch time credited **by the server** from heartbeats (each heartbeat can add at most the wall-clock time since the last one, times a playback-rate cap, so seeking or forging "100%" doesn't count), (b) every **checkpoint assessment** is passed (graded server-side; answer keys never sent to members), and (c) the module's **capstone project** is approved by a mentor. `MODULE_REQUIREMENTS` in `lib/permissions.ts` is the shared description.
3. **Every module has a capstone.** A module can't be published without `project_brief_md` and at least one checkpoint (enforce in the Phase 2 publish service).
4. **Mentors review and score.** `submission_reviews` (append-only) holds decision + score 0–100 + required feedback; `submissions.score` is the latest. Mentor+ only (`space.canScoreSubmissions`), never their own (DB trigger).
5. **Standup reviews earn points.** Live review sessions are `workshops.kind = 'STANDUP_REVIEW'`; attendance is marked by Mentor+ (`markedById`), never by the attendee (DB trigger), and awards `REVIEW_SESSION_ATTENDED`. (Assumption: "standup for review" = a live session; daily written standups also earn `STANDUP`.)
6. **Content is curated, not hosted.** We upload no video. **YouTube is the primary source**, but a lesson can also be a **Google Drive** file or any other **https** link; "learn more" material is an external **article** link (optional, never gates completion). `lib/video.ts` → `parseVideoSource()` classifies a pasted link and the server stores only a validated id for YouTube/Drive, rebuilding watch/embed URLs from it.
   - **YouTube:** embedded in-app (youtube-nocookie, `enablejsapi=1`), watch time credited from player events, capped by wall-clock time.
   - **Google Drive:** embedded in-app via Drive's `/preview` player. It has no player API, so credit is time-on-page heartbeats capped at the video length (weaker; prefer YouTube).
   - **Other links:** open in a new tab and can't be tracked; the module's checkpoints and capstone still have to be passed.
   - DB checks: VIDEO needs a provider and `duration_seconds > 0`; YouTube/Drive ids must match their formats; every URL must be https. Open: take `duration_seconds` from the curator, or from the YouTube Data API with a server-only `YOUTUBE_API_KEY` (can't be fudged).
7. **Show what earns points, never the weights.** Learners see `POINT_SOURCES` (`lib/points.ts`: labels only, listed in journey order, not by value). Weights live only in `server/points/rules.ts` (`server-only`). The API must not return per-event deltas to members, only totals/rank. Project points scale with the mentor's score. 8. **Leaderboard updates twice a day, at the same time for everyone:** 06:00 and 18:00 UTC (7 AM / 7 PM Lagos), via `lenigo_snapshot_leaderboards()` on pg_cron (`lib/leaderboard.ts` holds the schedule). Every learner-facing total and rank, including their own stat card, reads the latest `leaderboard_snapshots` row, never the live ledger.

## Next up: Phase 2 (curriculum and learning workspace)

Schema already exists: `tracks`, `levels`, `modules`, `resources`, `resource_progress`, `checkpoints`, `quiz_questions`, `quiz_attempts`, `submissions`, `submission_reviews`, `level_promotions`. Follow **Learning rules** above.

1. `services/curriculum.ts`: CRUD + reorder + publish, gated by `space.canEditCurriculum`.
2. `/c/[c]/[s]/curriculum`: builder UI (tracks → levels → modules → resources and quiz).
3. `/c/[c]/[s]/roadmap`: track/level selector, module cards (locked/active/done). Content above the learner's level is hidden; the next module unlocks only when the previous one meets all three `MODULE_REQUIREMENTS`. `space.bypassesLocks` (Mentor+) skips the locks.
4. `/c/[c]/[s]/modules/[id]`: YouTube IFrame API with server-credited heartbeats (no client-side "complete"), checkpoints between lessons (threshold per checkpoint, 10-minute cooldown after 2 fails), capstone submission. Hide answer keys unless `canSeeAnswerKeys`.
5. Award points through a single `awardPoints()` helper using `dedupe_key`. Seed a Web Dev Beginner track.
