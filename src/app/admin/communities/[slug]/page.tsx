import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { format } from "date-fns";
import { ChevronLeft, ExternalLink, Users } from "lucide-react";
import { PageHeader, StatTile } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { RoleBadge } from "@/components/role-badge";
import { UserAvatar } from "@/components/user-avatar";
import { ActivityList } from "@/components/admin/activity-list";
import { CommunityControls } from "@/components/admin/community-controls";
import { pageGlobalHouse } from "@/server/auth/guards";
import { getSessionUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { communities, spaces } from "@/server/db/schema";
import { communityLeadersSummary, listCommunityHealth } from "@/server/services/communities";
import { listActivity } from "@/server/services/admin";
import { global } from "@/lib/permissions";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user || !global.canEnterHouse(user.globalRole)) return { title: "Community" };
  const [c] = await db.select({ name: communities.name }).from(communities).where(eq(communities.slug, (await params).slug)).limit(1);
  return { title: c?.name ?? "Community" };
}

export default async function AdminCommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await pageGlobalHouse();
  const { slug } = await params;
  const [community] = await db.select().from(communities).where(eq(communities.slug, slug)).limit(1);
  if (!community) notFound();

  const [spaceRows, members, activity, health] = await Promise.all([
    db
      .select()
      .from(spaces)
      .where(and(eq(spaces.communityId, community.id), isNull(spaces.archivedAt)))
      .orderBy(spaces.position),
    communityLeadersSummary(community.id),
    listActivity({ community: slug, limit: 15 }),
    listCommunityHealth().then((rows) => rows.find((r) => r.id === community.id)),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <ButtonLink href="/admin/communities" variant="ghost" size="sm" className="mb-4 -ml-2">
          <ChevronLeft /> Communities
        </ButtonLink>
        <PageHeader
          eyebrow={`/c/${community.slug} · created ${format(community.createdAt, "d MMM yyyy")}`}
          title={
            <span className="flex items-center gap-3">
              {community.name}
              {community.status === "SUSPENDED" ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Suspended</span>
              ) : null}
            </span>
          }
          description={community.description ?? undefined}
          actions={
            <>
              {global.overridesCommunities(user.globalRole) ? (
                <>
                  <ButtonLink href={`/c/${community.slug}/members`}>
                    <Users /> Manage people &amp; invites
                  </ButtonLink>
                  <ButtonLink href={`/c/${community.slug}`} variant="outline">
                    Open portal <ExternalLink data-icon="inline-end" />
                  </ButtonLink>
                </>
              ) : null}
              <CommunityControls
                id={community.id}
                slug={community.slug}
                status={community.status}
                canSuspend={global.canSuspend(user.globalRole)}
                canDelete={global.canDeleteCommunity(user.globalRole)}
              />
            </>
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Members" value={members.total.toLocaleString()} />
        <StatTile label="WAU" value={health?.wau ?? 0} />
        <StatTile label="Shipped" value={health?.shipped ?? 0} accent />
        <StatTile label="Avg streak" value={`${health?.avgStreak ?? 0}d`} />
        <StatTile label="Review backlog" value={health?.pendingReviews ?? 0} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-2xl font-black tracking-tight uppercase">Spaces</h2>
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
            {spaceRows.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    /c/{community.slug}/{s.slug} · {s.joinPolicy === "OPEN" ? "open" : "invite only"}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <h2 className="mt-8 mb-3 font-display text-2xl font-black tracking-tight uppercase">People with community roles</h2>
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
            {members.leaders.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                The Community Lead hasn&rsquo;t accepted their invite yet. You can resend it from Manage people &amp; invites.
              </li>
            ) : null}
            {members.leaders.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                  <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{m.name ?? m.email}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  </div>
                  <RoleBadge role={m.role} />
                </li>
              ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl font-black tracking-tight uppercase">Recent activity</h2>
          <ActivityList items={activity.items} compact />
        </section>
      </div>
    </div>
  );
}
