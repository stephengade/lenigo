import Link from "next/link";
import { asc } from "drizzle-orm";
import { Filter } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { ActivityList } from "@/components/admin/activity-list";
import { pageGlobalHouse } from "@/server/auth/guards";
import { listActivity } from "@/server/services/admin";
import { ACTION_TYPES } from "@/server/activity";
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";

export const metadata = { title: "Activity" };

type Search = { community?: string; action?: string; user?: string; before?: string };

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<Search> }) {
  await pageGlobalHouse();
  const sp = await searchParams;
  const filters = {
    community: sp.community || undefined,
    action: sp.action && (ACTION_TYPES as readonly string[]).includes(sp.action) ? sp.action : undefined,
    user: sp.user?.slice(0, 120) || undefined,
    before: sp.before ? Number(sp.before) || undefined : undefined,
  };

  const [{ items, nextCursor }, allCommunities] = await Promise.all([
    listActivity({ ...filters, limit: 50 }),
    db.select({ slug: communities.slug, name: communities.name }).from(communities).orderBy(asc(communities.name)),
  ]);

  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    Object.entries({ ...filters, ...extra }).forEach(([k, v]) => v !== undefined && v !== "" && p.set(k, String(v)));
    return `?${p.toString()}`;
  };
  const filtered = Boolean(filters.community || filters.action || filters.user);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="FR-7.2"
        title="Activity stream"
        description="Every critical change across every community: sign-ins, provisioning, invites, role changes, submissions and more."
      />

      <form className="mb-6 grid gap-2 rounded-2xl bg-card shadow-card ring-1 ring-foreground/5 p-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]" action="/admin/activity">
        <select name="community" defaultValue={filters.community ?? ""} className="h-10 rounded-full border border-input bg-card px-4 text-sm shadow-xs" aria-label="Community">
          <option value="">All communities</option>
          {allCommunities.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={filters.action ?? ""} className="h-10 rounded-full border border-input bg-card px-4 text-sm shadow-xs" aria-label="Action type">
          <option value="">All actions</option>
          {ACTION_TYPES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          name="user"
          defaultValue={filters.user ?? ""}
          placeholder="Email, name or GitHub handle"
          className="h-10 rounded-full border border-input bg-card px-4 text-sm shadow-xs outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15"
          aria-label="User"
        />
        <div className="flex gap-2">
          <button type="submit" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
            <Filter className="size-4" /> Filter
          </button>
          {filtered ? (
            <Link href="/admin/activity" className="inline-flex h-9 items-center rounded-lg px-3 text-sm text-muted-foreground hover:text-foreground">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <ActivityList items={items} />

      <div className="mt-4 flex justify-between">
        {filters.before ? (
          <ButtonLink href={`/admin/activity${qs({ before: undefined })}`} variant="ghost" size="sm">
            Back to latest
          </ButtonLink>
        ) : (
          <span />
        )}
        {nextCursor ? (
          <ButtonLink href={`/admin/activity${qs({ before: nextCursor })}`} variant="outline" size="sm">
            Older events
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
