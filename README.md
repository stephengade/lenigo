# Lenigo

A multi-tenant community learning and accountability platform: structured roadmaps, required projects, daily standups, mentor reviews, streaks and leaderboards.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 + shadcn/ui (Base UI) · **Elysia** API mounted at `/api` with an Eden typed client · **Drizzle ORM** · **Supabase** (Postgres + Auth: GitHub OAuth and email magic links).

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

1. **Settings → API Keys:** copy the project URL and the anon/publishable key.
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
6. For anything beyond local testing, set up **custom SMTP** (Authentication → Emails). Supabase's built-in mailer is heavily rate-limited.

> Every table has Row Level Security **enabled with no policies**. The app connects as the database owner over a direct connection (bypassing RLS), so this only stops Supabase's auto-generated REST API from exposing the tables to the anon key. Don't add RLS policies unless you intend to use the Data API.

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

## API

The Elysia app in `src/server/api/app.ts` serves `/api/*` inside Next.js. Client components call it through the typed Eden client:

```ts
import { api, apiError } from "@/lib/api";
const { data, error } = await api.c({ community: "gdg-oau" })({ space: "web-dev" }).invites.post({ role: "MENTOR", email });
if (error) toast.error(apiError(error));
```

Errors are JSON `{ error: string }` with a meaningful status (401/403/404/409/410/422). Every route re-resolves tenant access from the slug in the URL; services never trust IDs from the body for scoping.

## Phase status

- [x] **Phase 1:** schema (all phases), Supabase auth (GitHub + magic link), Global House (overview, provisioning, health, activity stream, users and global roles), community → space hierarchy, role-scoped invites (email and shareable links), team management, RBAC, audit log, append-only ledger triggers.
- [ ] **Phase 2:** curriculum CMS, roadmap, module workspace (YouTube tracking, articles, labs), quizzes, sequential unlocking.
- [ ] **Phase 3:** standups, feed with reactions and comments, review queue, streak engine, points ledger, leaderboards.
- [ ] **Phase 4:** workshops, RSVP with live-review queue, public profiles `/u/[username]`.
