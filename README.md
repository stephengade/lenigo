# Lenigo

A multi-tenant community learning and accountability platform: structured roadmaps, required projects, daily standups, mentor reviews, streaks and leaderboards.

**Stack:** Next.js 16 (App Router, `proxy.ts`) · TypeScript · Tailwind v4 + shadcn/ui (Base UI) · **Elysia** API mounted at `/api` with an Eden typed client · **Drizzle ORM** · **Supabase** (Postgres + Auth: GitHub OAuth and email magic links).

## Tenancy model

```
Global House (/admin)                 platform operators: SUPER_ADMIN · ADMIN · VIEWER
└── Community   /c/gdg-oau            OWNER · ADMIN · MEMBER
    ├── Space   /c/gdg-oau/web-dev    LEAD · MANAGER · MENTOR · MEMBER
    └── Space   /c/gdg-oau/data-science
```

- **Communities** (e.g. GDG OAU, Claude Ambassadors) are provisioned from `/admin/communities/new`, with an Owner and initial spaces.
- **Spaces** are where learning happens. Curriculum, submissions, standups, points and workshops are all scoped to a space (and carry `communityId` for rollups).
- Community **Owners/Admins act as Lead in every space**. Space roles come from space invites.
- Spaces are **OPEN** (any community member can join as Member) or **INVITE** only.
- Super Admins can open any community with Owner rights (a banner says so, and actions are logged).

RBAC rules live in one pure module, `src/lib/permissions.ts`, which the server enforces and the UI reads. The PRD's role-escalation rules hold: only Leads (or Owners/Admins, or global staff) can assign Lead or Manager, and Managers can invite only Mentors and Members.

## Project layout

```
src/
  app/                    Next.js routes (pages call services directly)
    api/[[...slugs]]/     → mounts the Elysia app
    admin/                Global House
    c/[community]/        community hub, members & invites
    c/[community]/[space] space portal (dashboard, team, …)
    invite/[token]/       invite redemption
    auth/                 OAuth callback, magic-link confirm, sign-out
  proxy.ts                Next 16 Proxy (ex-middleware): session refresh + login redirect
  server/
    api/app.ts            Elysia routes (all mutations)
    auth/                 session sync, tenant access resolvers, page guards
    services/             tenant-scoped business logic (communities, invites, admin)
    db/schema.ts          Drizzle schema for all four phases
    activity.ts           append-only audit log writer
  lib/permissions.ts      RBAC matrix
drizzle/                  SQL migrations
```

## Setup

### 1. Supabase project

1. **Settings → API Keys:** copy the **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` and the **Publishable key** (`sb_publishable_…`; the legacy `anon` key also works) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. **Connect → ORMs:** copy the *transaction pooler* URL (port 6543) as `DATABASE_URL` and the *session/direct* URL (port 5432) as `DIRECT_URL`.
3. **Authentication → URL Configuration:**
   - Site URL: `http://localhost:3000` (your prod URL in production)
   - Redirect URLs: add `http://localhost:3000/**` (and `https://your-domain/**`)
4. **Authentication → Providers → GitHub:** enable it. Create a GitHub OAuth App whose callback is `https://<project-ref>.supabase.co/auth/v1/callback`.
5. **Authentication → Emails → Magic Link** template: replace the link with
   ```html
   <a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">Sign in to Lenigo</a>
   ```
   Do the same for the **Confirm signup** template, using `type=signup`.
   This makes magic links and invite emails work across devices (`/auth/confirm` verifies the token on the server).
6. **Leaderboard schedule:** Database → Extensions → enable **pg_cron**, then run in the SQL editor (after `pnpm db:migrate`):
   ```sql
   select cron.schedule('lenigo-leaderboard', '0 6,18 * * *', 'select lenigo_snapshot_leaderboards()');
   ```
   Boards refresh at 06:00 and 18:00 UTC (7 AM / 7 PM in Lagos) for everyone. Keep this in sync with `src/lib/leaderboard.ts`.
7. For anything beyond local testing, set up **custom SMTP** (Authentication → Emails). Supabase's built-in mailer is heavily rate-limited.

> Every table has Row Level Security **enabled with no policies**. The app connects as the database owner over a direct connection (bypassing RLS), so this only stops Supabase's auto-generated REST API from exposing the tables to the publishable key. Don't add RLS policies unless you intend to use the Data API.

### 2. Run it

```bash
cp .env.example .env        # fill in the values above + SUPER_ADMIN_EMAILS
pnpm install
pnpm db:migrate             # applies drizzle/*.sql to Supabase
pnpm dev
```

Sign in at `/login` with an address in `SUPER_ADMIN_EMAILS`; you become a Super Admin. Then either:

- go to **/admin → Provision community**, or
- run `pnpm db:seed` to create **GDG OAU** (Web Development, Data Science, Mobile) and **Claude Ambassadors** (General), with you as Owner.

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm db:generate` | Create a migration from `schema.ts` changes |
| `pnpm db:migrate` | Apply migrations (uses `DIRECT_URL`) |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm db:seed` | Seed demo communities |
| `pnpm typecheck` / `pnpm lint` | Checks |

## Deployment

There is **no separate backend server**. The Elysia app is mounted inside a Next.js route handler (`src/app/api/[[...slugs]]/route.ts`), so `/api/*` is built and deployed together with the pages, as ordinary Node.js server functions. Anything that can host a Next.js server app can host Lenigo. It needs the **Node.js runtime** (the `postgres` driver uses TCP), not the Edge runtime.

| Target | Status | Notes |
| --- | --- | --- |
| **VPS / Docker** (`next build && next start`, behind Nginx/Caddy, PM2 or systemd) | ✅ Recommended | Full control, long-lived DB pool. |
| **Vercel** | ✅ | First-class Next 16 support, including `proxy.ts`. |
| **AWS Amplify Hosting** | ⚠️ Unverified | Amplify's docs list SSR support for Next.js 12–15. Next 16's `proxy.ts` isn't confirmed. Test a preview deploy first, or pin Next 15 (rename `proxy.ts` back to `middleware.ts` and export `middleware`). |

Wherever you deploy:

- **Set every env var before `next build`.** `NEXT_PUBLIC_*` values are inlined into the bundle at build time, so setting them only at runtime has no effect. Server-only values (`DATABASE_URL`, `SUPER_ADMIN_EMAILS`) are read at runtime and validated on first use, so the build itself doesn't need them.
- Use the **transaction pooler** (port 6543) for `DATABASE_URL` on serverless targets (Vercel, Amplify). On a VPS either pooler works.
- Set `NEXT_PUBLIC_APP_URL` to the public URL, and add `https://your-domain/**` to Supabase's redirect URLs.
- Run `pnpm db:migrate` from CI or your machine (it uses `DIRECT_URL`), not from the app server.

## API

The Elysia app in `src/server/api/app.ts` serves `/api/*` inside Next.js. Client components call it through the typed Eden client:

```ts
import { api, apiError } from "@/lib/api";
const { data, error } = await api.c({ community: "gdg-oau" })({ space: "web-dev" }).invites.post({ role: "MENTOR", email });
if (error) toast.error(apiError(error));
```

Errors are JSON `{ error: string }` with a meaningful status (401/403/404/409/410/422). Every route re-resolves tenant access from the slug in the URL; services never trust IDs from the body for scoping.

## Phase status

- [x] **Phase 1:** schema (all phases), Supabase auth (GitHub + magic link), Global House (overview, provisioning, health, activity stream, users and global roles), community → space hierarchy, role-scoped invites (email and shareable links), team management, RBAC, audit log, append-only ledger triggers. Schema also carries the learning rules (earned levels, checkpoints, capstones, mentor scoring); see handoff.md → Learning rules.
- [ ] **Phase 2:** curriculum CMS, roadmap, module workspace (server-verified video progress, checkpoint assessments, capstone projects), mentor scoring, tracks with per-track levels, onboarding questions + optional placement test, level promotions, sequential unlocking.
- [ ] **Phase 3:** standups, feed with reactions and comments, review queue, streak engine, points ledger, leaderboards.
- [ ] **Phase 4:** workshops, RSVP with live-review queue, public profiles `/u/[username]`.
