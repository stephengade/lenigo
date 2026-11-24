# Lenigo — Handoff

_Last updated: 2026-11-24 · Status: **Phases 1–4 built; services tested on a real Postgres engine; signed-in pages not yet seen in a browser**_

## TL;DR

All four phases are implemented: the multi-tenant core (Phase 1), curriculum + learning workspace (2), standups/feed/review/leaderboards (3) and workshops + public profiles (4). `tsc`, `eslint` and `next build` pass. Every Phase 2–4 service, plus the Global House queries, ran against a real Postgres engine (PGlite) with all four migrations: **166 scenario checks passed** (see "How Phases 2–4 were tested"). What has **not** happened yet: signing in through Supabase and clicking through the pages in a browser. The next session should connect Supabase, run `pnpm db:migrate`, and walk through the acceptance tests below.

## Decisions that differ from the PRD (made with the user)

| PRD said | We use | Why |
| --- | --- | --- |
| Prisma ORM | **Drizzle ORM** + `postgres` driver | User: "no prisma please, prisma throws errors a lot". Don't reintroduce it. |
| Next.js Server Actions / Route Handlers | **Elysia** mounted at `/api/*` inside Next.js, **Eden** typed client | User's choice. |
| Auth.js (NextAuth v5) + Resend | **Supabase Auth** (emailed one-time codes; GitHub OAuth optional, off until `AUTH_GITHUB_ENABLED=true`) | User is on Supabase. Its mailer replaces Resend. |
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
- **Display names (2026-11-24):** OWNER shows as **Community Lead** (the president), LEAD as **Space Lead**. Enum values are unchanged.
- **People management:**
  - **Community Leads** hand the role to another member (they step down to Admin), and remove people from the community. Removing someone takes them out of every space and cancels their pending invites there; their history is kept. Admins can remove Members only.
  - **The database keeps at least one Community Lead** (migration 0005, `lenigo_keep_one_owner`).
  - **Resending an email invite** issues a new link (tokens are stored hashed), a new 14-day expiry and a new sign-in code. The old link stops working. Limited to once every 2 minutes per invite. Only someone who could create an invite for that role can resend or cancel it.
  - **Super Admins deactivate or reactivate accounts** from `/admin/users`. `getSessionUser` treats a deactivated account as signed out, and the sign-in routes refuse it with a message. Nothing is deleted. Super Admins can't be deactivated.
  - **From Global House**, each community page has "Manage people & invites", which opens `/c/<slug>/members` through the Super Admin override.
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
    services/curriculum.ts    builder: tracks/levels/options/modules/lessons/checkpoints/placement bank
    services/learning.ts      loadTrackProgress() (THE lock rules), onboarding, enrolment, options,
                              promotions, module workspace, watch-time heartbeats, checkpoints, capstones
    services/placement.ts     placement test: start, quiz (server-graded), task, review
    services/review.ts        review queue + scoring, learners overview (mentors)
    services/social.ts        standups + streaks, feed/reactions/comments, leaderboard reads (snapshots only)
    services/workshops.ts     sessions, RSVP + presenting queue, staff-marked attendance
    services/profiles.ts      public profile (/u/[username]) + profile edit
    api/app.ts                Elysia routes (Global House, invites, community, /me)
    api/space-routes.ts       every /api/c/:community/:space/… learning route (Phases 2–4)
  app/
    api/[[...slugs]]/route.ts mounts Elysia
    auth/callback             OAuth ?code= → session → syncUser → redirect
    auth/verify               POST email + code → verifyOtp (server) → syncUser; same-origin only
    auth/confirm              legacy magic link ?token_hash= → verifyOtp → syncUser
    admin/…                   Global House (overview, communities, new, [slug], activity, users)
    c/                        my communities
    c/[community]/            hub + /members
    c/[community]/[space]/    layout (sidebar, join gate), home (streak, points, standup, next module), team,
                              onboarding, roadmap, modules/[id], placement/[id], feed, leaderboard, workshops,
                              review, learners (Mentor+), curriculum (+ [trackId], modules/[id]) (Lead/Manager)
    u/[username]/             public profile (no sign-in; nothing private)
    invite/[token]/           preview + accept
src/proxy.ts                Next 16 Proxy: Supabase session refresh + signed-out redirect (lib/supabase/proxy.ts)
drizzle/0000_init.sql         generated schema migration
drizzle/0001_integrity_rules.sql   triggers: append-only tables, level changes only via promotion,
                                   enrolment/branch/placement rules, no self-review, no self-marked attendance
drizzle/0002_staff_roles.sql       community Owner/Admin count as Lead in the triggers; reviews and attendance
                                   must come from Mentor+ of that space; attendance can't be unmarked
drizzle/0003_phase_2_4.sql         feed_items.meta, one PENDING submission per learner+module
```

### Conventions

- **Reads:** Server Components call services directly (no HTTP hop).
- **Writes:** Client Components call `api.…` (Eden). The Elysia route resolves access from the URL slug, and the service re-checks the role. Services never take tenant IDs from the request body.
- **Errors:** services throw `AppError(status, message)`. The API returns `{ error }` JSON. `onError` is cast to `never` on purpose so error shapes don't pollute Eden success types. Pages map 404 → `notFound()` and 403/410 → `/denied?reason=`.
- **Audit:** every mutation calls `logActivity(…, tx)` inside the same transaction where possible.
- **Points:** `points_ledger` is append-only, and `dedupe_key` (unique per space+user) makes awards idempotent, e.g. `checkpoint:<id>`, `project:<submissionId>` or `standup:2026-11-23`. Award only through `awardPoints()` in `server/points/rules.ts`.
- **UI:** shadcn **base-nova** style, built on **Base UI**, not Radix. Use `render={<Link/>}` instead of `asChild`. For links styled as buttons, use `components/button-link.tsx`.
- **Design system (in progress, 2026-11-23):** user wants a sleek, clean, friendly look (soft panels, pill controls, starburst badges). Fonts: **Rubik** (`font-display`, headings and big numbers; **Rubik Black, uppercase** for marketing headings, picked 2026-11-24) + **Inter** (body/UI); Bricolage and Teachers were rejected. Tokens in `globals.css`: `primary` = blue (actions), `ink` = near-black (selected/active, dark panels), `surface` (grey panel) < `card` (white), `sage` (brand bands), tints `lilac`/`sun`/`rose`/`mint` each with `-soft` and `-foreground`. Prototype at **`/design`** (dev-only, 404 in production). **Work incrementally:** show a prototype and get approval before restyling real screens.
- **Rolled out (2026-11-24):** `/` is the new landing page (`components/landing/landing.tsx`; the only server input is signed-in or not). `components/ui` primitives restyled (pill buttons incl. `variant="ink"`, rounded-xl fields, shadow cards with display-font titles, tinted `Badge` variants mint/sun/lilac/rose/ink/muted). Shell: floating pill `TopBar`, sidebar in a grey `Panel` with ink-pill active links, floating dark Global House sidebar. `PageHeader` titles are Rubik Black uppercase; `StatTile` takes `icon` + `tone`; new `Panel` (grey/sage/lilac/sun block that holds white cards). Every page moved off `ember`/`moss`/`sky` (only the logo's spark still uses `ember`). Removed point values that leaked onto the login, space home and review pages. Signed-in pages are typechecked but not yet seen in a browser (needs a real Supabase + DB).

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
   - put `{{ .Token }}` (the sign-in code) in **both** the **Magic Link** and **Confirm signup** templates (README step 5), and set the OTP expiry to 10 minutes;
   - GitHub is optional: enable the provider later, then set `AUTH_GITHUB_ENABLED=true`.
3. `pnpm db:migrate`, then `pnpm dev`, sign in once with the super-admin email, then `pnpm db:seed`.

## Phase 1 acceptance test (not yet run)

- [x] Super Admin signs in → `/admin` loads, LOGIN appears in `/admin/activity` (2026-11-24).
- [ ] Provision `gdg-oau` with spaces Web Development + Data Science and an owner email → owner gets the email and the invite link is shown.
- [ ] Owner opens the invite → becomes OWNER → sees both spaces with a LEAD badge.
- [ ] Owner invites a Lead to `web-dev`; that Lead invites a Manager and a Mentor.
- [ ] Manager can't see LEAD/MANAGER in the invite role picker, and the API refuses them if forced (403).
- [ ] Mentor can't open `/team` or `/curriculum` (redirected to `/denied`); can open `/review`.
- [ ] Community MEMBER can self-join an OPEN space and can't see an INVITE space.
- [ ] Single-use email invite can't be redeemed twice or by a different email.
- [ ] Suspending a community blocks members (410 → /denied) but not Super Admin.
- [ ] `UPDATE points_ledger …` in SQL fails with "append-only".
- [ ] Community Lead hands over to a member → they become Lead and the old Lead becomes Admin; demoting or removing the last Lead fails.
- [ ] Remove someone from the community → gone from every space, their pending invites cancelled; inviting them back restores their history.
- [ ] Resend an email invite → the old link says invalid, the new one works; a second resend within 2 minutes is refused.
- [ ] Deactivate a user → they're signed out and the sign-in code is refused with a message; reactivating restores access.
- [ ] `UPDATE space_members SET level='ADVANCED'` without a promotion row fails; a reviewer inserting a review of their own submission fails.

## Known gaps / risks

- **Running on Supabase since 2026-11-24.** All migrations applied; email-code sign-in works. The `array_position(...::space_role[])` ordering in Phase 1 wasn't covered by the scenarios.
- **Transaction pooler + query pipelining = hang.** Supabase's transaction pooler (6543) froze any query that postgres-js pipelined onto a busy connection (a page running more queries at once than `max` hung until the statement timeout). `src/server/db/index.ts` sets `max_pipeline: 1`, plus queue/query timeouts. Keep it.
- **Append-only means no DELETE either** (migration 0004). Direct deletes on `points_ledger`, `activity_logs`, `level_promotions`, `submission_reviews`, `quiz_attempts` and `leaderboard_snapshots` are refused; cascades from deleting a community still work.
- `provisionCommunity` sends the owner email **inside** the transaction. If the transaction rolls back, an unused sign-in email may still have gone out. Moving the send to after commit would be cleaner.
- Supabase's built-in SMTP is heavily rate-limited (a few emails per hour). Use custom SMTP before inviting a real cohort.
- No test suite in the repo yet. The Phase 2–4 scenario script (see below) is the best starting point, plus unit tests for `lib/permissions.ts` and `redeemInvite`.
- `listCommunityHealth` uses per-row subqueries, which is fine for tens of communities. Use materialized stats if it grows.
- `users` has no FK to `auth.users`; rows are synced on sign-in (`syncUserFromAuth`). Deleting a user in Supabase Auth doesn't delete the app row.
- `username` is auto-generated on first sign-in; learners change it from their public profile (`/u/[username]` → Edit profile).
- The dev server sometimes keeps serving a stale root layout after `layout.tsx` edits. Restart it and delete `.next`.

## Learning rules (user decisions, 2026-11-23)

These are product rules, not suggestions. The server and the DB enforce them; the UI only explains them.

1. **Levels are earned, not chosen, and they are per track.** A space has **tracks** (data, not code: each space names its own, e.g. Web Development → Frontend, Backend, Fullstack, QA). Every track has three steps (`level_tier` BEGINNER → INTERMEDIATE → ADVANCED is only the order; `levels.title` is what the space calls each step, e.g. "HTML, CSS & JS"). A learner's level lives in `track_enrollments.tier`. It changes only when a **Mentor or Lead** (Managers can NOT promote) promotes the learner one step, with a reason, recorded in append-only `level_promotions` (`level.canPromote()`). DB triggers refuse every other tier change, self-promotion, a non-Mentor/Lead promoter, skipping a level, and promoting from a stale level. Learners see content at their tier or below in that track (`level.canAccess()`).
   - **One track at a time.** The first enrolment in a space is the learner's own pick (from onboarding). Any further track needs `approved_by_id` = a Mentor or Lead of the space (DB trigger; `space.canApproveExtraTrack`).
   - **Prerequisites.** `tracks.prerequisite_track_id/tier`, e.g. Fullstack needs Frontend ≥ INTERMEDIATE (DB trigger).
   - **"Pick one" inside a level.** `track_branches` (e.g. Frontend Intermediate → React + Next.js | Vue + Nuxt). Modules with `branch_id` null are the shared core; branch modules only for learners who chose it (`enrollment_branches`). The learner can switch until they have progress or a submission in the branch; after that only a Mentor or Lead can (DB trigger; `space.canSwitchBranch`). A composite FK keeps a branch inside its own level.
   - **Onboarding (`space_intakes`, `INTAKE_QUESTIONS` in `lib/placement.ts`).** Four generic questions on joining a space: starting track, experience, links, hours per week. Picks the track, never the level; mentors read it.
   - **Optional placement test (`placement_attempts`, `placement_questions`, `PLACEMENT` in `lib/placement.ts`).** Timed quiz drawn at random from the track's bank (graded on the server) → practical task (`tracks.placement_task_md`) → review by Mentor/Manager/Lead (feedback required). The review only **recommends**; a Mentor or Lead then records the promotion with `placement_attempt_id`. DB rules: only learners enrolled at BEGINNER; at most INTERMEDIATE (Advanced needs a mentor conversation); one attempt per track every 30 days; the served question set can't be rewritten; nobody reviews their own; a reviewed attempt is frozen.
   - **Placed-out modules earn no points.** Content below the tier reached through placement is "Placed out" (`level.isPlacedOut()`): openable, but `awardPoints()` must skip it (Phase 2).
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

## Phases 2–4: what was built (2026-11-24)

Follows **Learning rules** above. Highlights and where each rule lives:

- **Curriculum builder** (`/curriculum`, Leads and Managers). A new track gets three levels the space renames. Options ("pick one", e.g. React vs Vue) per level; modules are core or option-only. Lessons are pasted links (`parseVideoSource`): YouTube/Drive store only a validated id. Video length comes from the curator, or from the YouTube Data API when the optional server-only `YOUTUBE_API_KEY` is set. **Publishing a module needs a brief and at least one checkpoint, each with questions.** Anything with learner progress can be unpublished but not deleted.
- **Locks** live in one function, `loadTrackProgress()`: it draws the roadmap AND authorises every progress write (`openModule()`), so the UI and the server can't disagree. Order: each level's core, then the chosen option; a level with options blocks until one is picked; levels above the learner's tier are hidden; placed-out levels never gate and earn nothing.
- **Watch time:** the client only reports; `recordHeartbeat()` credits `min(position advance, wall-clock since last heartbeat × 2)`, nothing after a gap over 75 s, complete at 90%. Pressing play sends a zero-credit baseline, so "pause, wait, seek, play" earns nothing. Drive = time on the visible page. External links aren't tracked and don't gate.
- **Checkpoints:** graded on the server; a miss says which questions were wrong but never the answers; explanations only after a pass; two misses in a row → 10-minute cooldown. Keys never leave the server for learners (mentor previews see them).
- **Capstones:** submit once videos + checkpoints are done; one pending at a time (partial unique index). Review = approve with a 0–100 score or request changes; feedback required; project points = base × score / 100; the feed post links the work, never the score.
- **Onboarding** picks the first track (never the level). **Second tracks** are added by a Mentor or Lead from `/learners`. **Promotions** (Mentor/Lead, one step, reason required) from `/learners` or, after a RECOMMENDED placement, from `/review`.
- **Placement:** crypto-random draw of up to 15 questions, 20-minute timer enforced on the server (+30 s grace), below 70% ends the attempt (status EXPIRED keeps the score), then the build task, then a Mentor+ recommends; a Mentor/Lead promotes.
- **Standups and streaks:** one per learner per space per *community-local* day (`lib/dates.ts`). The streak continues from yesterday, else restarts. Bonus + feed post at 3, 7, 14, 30, 60, 100 days.
- **Leaderboard** and every learner-facing total read `leaderboard_snapshots` only. Until pg_cron runs `lenigo_snapshot_leaderboards()` the board says "first board at …" (README → Setup step 6).
- **Workshops:** Mentor+ schedule. The call link is shown only to people who RSVP'd (and staff). Standup reviews have a presenting queue (learners attach one of their own projects). Attendance is marked by staff after the start, earns points once, and can't be unmarked (DB).
- **Public profile** `/u/[username]`: name, bio, GitHub, levels per track, approved projects. No email, points, scores or community names; `noindex`. Edit from the profile page (username rules + reserved names).
- **DB errors:** trigger refusals (`P0001`) come back as HTTP 409 with the trigger's message (`api/app.ts → dbError`).

### Phase 1 bugs found and fixed while testing

- **Correlated subqueries:** in a single-table select Drizzle renders `${table.id}` as a bare `"id"`, which inside a subquery binds to the *inner* table. The Global House health table (spaces, weekly/daily active, shipped, pending, streak, owner) always showed 0. Fixed with explicit `"communities"."id"`. **Don't interpolate outer columns in correlated subqueries; write the qualified name.**
- **The health query crashed:** the owner subquery used `cm.joined_at`, but the column is `created_at` (the `joinedAt` field uses the `createdAt()` helper).
- **Raw `Date` params:** dates inside raw `sql` templates are now passed as `toISOString()::timestamptz` (activity chart, health counts).

### How Phases 2–4 were tested

A scenario script drove the real services as a Lead, a community Owner (no space membership), a Manager, a Mentor and two learners. It ran against PGlite (Postgres 17 in WASM) with `0000`–`0003` applied, over a single postgres-js connection, so any query that escapes its transaction would hang. 166 checks passed, covering every refusal (wrong role, other space, skipping, self-promotion, self-review, cooldowns, prerequisites, append-only). The script lived in the session scratchpad and **isn't in the repo yet**. Note for re-running: PGlite is one session, so serve it with `fetch_types: false` (postgres-js v4 loads types on a second connection, which clobbers PGlite's shared unnamed statement).

## Acceptance tests for Phases 2–4 (in the browser, not yet run)

- [ ] Lead builds Frontend: renames levels, adds a YouTube lesson, a checkpoint with questions and a brief → publishes module, level, track. Publishing without the brief/checkpoint is refused.
- [ ] A learner joins the space → home says "Pick your track" → onboarding → roadmap shows module 1 open, module 2 locked, Intermediate hidden.
- [ ] Watch a video in the player: the bar moves only while playing; dragging to the end doesn't complete it.
- [ ] Checkpoint: wrong answers twice → 10-minute wait. Pass → explanations. Then submit the project.
- [ ] Mentor: `/review` → request changes → learner resubmits → approve with a score → feed post, roadmap moves on.
- [ ] `/learners`: Manager sees no Promote button; Mentor promotes; learner picks an option; Mentor adds a second track (prerequisite enforced).
- [ ] Placement: track with a task + ≥5 bank questions → learner takes it → mentor recommends → promote from `/review` → beginner modules show "Placed out".
- [ ] Standup on home → feed, streak 1; second post same day refused. React/comment; Manager deletes a comment.
- [ ] Run `select lenigo_snapshot_leaderboards();` → `/leaderboard` and home show points and rank.
- [ ] Workshops: Mentor schedules a standup review; learner RSVPs to present a project; link appears; after start, Mentor marks attendance.
- [ ] `/u/<username>` signed out: shows levels and approved projects, no email.

## Still open

- **"Bring your community" contact** on the landing page (email, form or other). Ask the user.
- **Seed curriculum:** GDG OAU Web Development tracks (Frontend, Backend, QA, Fullstack) aren't seeded. The user said they'll curate Frontend themselves.
- **Email notifications** (review done, promoted, session tomorrow) aren't built.
- The scenario test script isn't in the repo (see above).

## Invites, email and big member lists (2026-11-24, later)

- **The invite page signs you in itself.** No more detour to /login. Email invites lock the address; after the code checks out, `/auth/verify` accepts the invite in the same request and lands you in the community.
- **ZeptoMail + React Email.** `src/server/email/send.ts` posts to the ZeptoMail API (`Zoho-enczapikey` header, click/open tracking off so one-time links aren't rewritten). Templates live in `src/emails` (`layout.tsx` brand shell, `invite.tsx`). Needs `ZEPTOMAIL_PASSWORD` + `EMAIL_FROM`; otherwise invites fall back to the Supabase code email, whose button opens the invite page where that code is entered.
- **One-click accept** (needs `SUPABASE_SECRET_KEY` too): the email button carries a second secret `k` (sha256 in `invites.signin_key_hash`, migration 0006). The page shows an "Accept invite" button that POSTs to `/invite/<token>/accept` (same-origin, so mail scanners prefetching the GET can't use it). The route burns `k` in one UPDATE, refuses Super Admins and deactivated accounts, mints a session with `admin.generateLink` + `verifyOtp`, then redeems. The inviter only ever sees the plain link, so they can't sign in as the invitee. Resend rotates both secrets. The invite page sets `referrer: no-referrer`.
- **Member lists scale.** Community members and space team pages are server-paged (50 per page), searchable (name / email / GitHub, LIKE wildcards escaped) and filterable by role with per-role counts; state is in the URL. The space home and the admin community page no longer load every member.
- **Cursor and mobile.** Global `cursor: pointer` for clickable elements (Tailwind v4 removed it); stat tiles go two-up on phones; top-bar role badges hide below `sm`; members/team grids no longer overflow. All 22 pages were checked at 375 px for horizontal overflow (mostly empty data).
- Not tested yet: a real ZeptoMail send (`EMAIL_FROM` isn't set) and one-click accept (`SUPABASE_SECRET_KEY` isn't set). Admin → Users still lists at most 100 (searchable), no paging.
