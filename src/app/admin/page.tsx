import { ArrowRight, Plus } from "lucide-react";
import { PageHeader, StatTile } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { HealthTable } from "@/components/admin/health-table";
import { ActivityList } from "@/components/admin/activity-list";
import { pageGlobalHouse } from "@/server/auth/guards";
import { getGlobalTotals, listCommunityHealth } from "@/server/services/communities";
import { activityByDay, listActivity } from "@/server/services/admin";
import { global } from "@/lib/permissions";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  const user = await pageGlobalHouse();
  const [totals, health, recent, byDay] = await Promise.all([
    getGlobalTotals(),
    listCommunityHealth(),
    listActivity({ limit: 8 }),
    activityByDay(14),
  ]);
  const peak = Math.max(1, ...byDay.map((d) => d.n));

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <PageHeader
        eyebrow="Global House"
        title="Platform overview"
        description="Every community on Lenigo, how engaged its learners are, and where mentors are falling behind."
        actions={
          global.canProvision(user.globalRole) ? (
            <ButtonLink href="/admin/communities/new">
              <Plus /> Provision community
            </ButtonLink>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Communities" value={totals.communities} />
        <StatTile label="Users" value={totals.users} />
        <StatTile label="Weekly active learners" value={totals.weeklyActive} accent hint="Earned points in the last 7 days" />
        <div className="rounded-xl border bg-card p-4">
          <div className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">Events · 7 days</div>
          <div className="mt-2 font-display text-3xl font-bold tabular">{totals.events7d}</div>
          <div className="mt-2 flex h-8 items-end gap-0.5" aria-label="Activity per day, last 14 days">
            {byDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.n}`}
                className="flex-1 rounded-sm bg-ember/80"
                style={{ height: `${Math.max(6, (d.n / peak) * 100)}%`, opacity: d.n ? 1 : 0.25 }}
              />
            ))}
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Community health</h2>
          <ButtonLink href="/admin/communities" variant="ghost" size="sm">
            All communities <ArrowRight data-icon="inline-end" />
          </ButtonLink>
        </div>
        {health.length ? (
          <HealthTable rows={health} />
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No communities yet.</p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Latest activity</h2>
          <ButtonLink href="/admin/activity" variant="ghost" size="sm">
            Full stream <ArrowRight data-icon="inline-end" />
          </ButtonLink>
        </div>
        <ActivityList items={recent.items} compact />
      </section>
    </div>
  );
}
