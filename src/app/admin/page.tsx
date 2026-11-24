import { Activity, ArrowRight, Building2, Plus, UserRound, Zap } from "lucide-react";
import { PageHeader, Panel, StatTile } from "@/components/page-header";
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Building2 />} tone="lilac" label="Communities" value={totals.communities} />
        <StatTile icon={<UserRound />} tone="mint" label="Users" value={totals.users} />
        <StatTile icon={<Zap />} tone="sun" label="Weekly active learners" value={totals.weeklyActive} hint="Earned points in the last 7 days" />
        <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5">
          <div className="flex items-center gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-rose-soft text-rose-foreground">
              <Activity className="size-5" />
            </span>
            <div>
              <div className="text-sm text-muted-foreground">Events, last 7 days</div>
              <div className="mt-1 font-display text-3xl leading-none font-bold tabular">{totals.events7d}</div>
            </div>
          </div>
          <div className="mt-4 flex h-10 items-end gap-1" aria-label="Activity per day, last 14 days">
            {byDay.map((d) => (
              <div
                key={d.day}
                title={`${d.day}: ${d.n}`}
                className="flex-1 rounded-full bg-primary"
                style={{ height: `${Math.max(10, (d.n / peak) * 100)}%`, opacity: d.n ? 1 : 0.2 }}
              />
            ))}
          </div>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-black tracking-tight uppercase">Community health</h2>
          <ButtonLink href="/admin/communities" variant="ghost" size="sm">
            All communities <ArrowRight data-icon="inline-end" />
          </ButtonLink>
        </div>
        {health.length ? (
          <Panel>
            <HealthTable rows={health} />
          </Panel>
        ) : (
          <Panel>
            <p className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">No communities yet.</p>
          </Panel>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-black tracking-tight uppercase">Latest activity</h2>
          <ButtonLink href="/admin/activity" variant="ghost" size="sm">
            Full stream <ArrowRight data-icon="inline-end" />
          </ButtonLink>
        </div>
        <Panel>
          <ActivityList items={recent.items} compact />
        </Panel>
      </section>
    </div>
  );
}
