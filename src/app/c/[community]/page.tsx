import Link from "next/link";
import { ArrowUpRight, FolderGit2, Layers, Lock, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const SPACE_TONES = ["bg-lilac-soft text-lilac-foreground", "bg-sun-soft text-sun-foreground", "bg-mint-soft text-mint-foreground", "bg-rose-soft text-rose-foreground", "bg-secondary text-secondary-foreground"];
import { TopBar } from "@/components/shell/top-bar";
import { EmptyState, PageHeader, Panel, StatTile } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { ButtonLink } from "@/components/button-link";
import { CreateSpaceDialog } from "@/components/community/create-space-dialog";
import { JoinSpaceButton } from "@/components/community/join-space-button";
import { pageCommunity, titleNames } from "@/server/auth/guards";
import { getCommunityHub, getCommunityStats } from "@/server/services/communities";
import { community as rules } from "@/lib/permissions";

export async function generateMetadata({ params }: { params: Promise<{ community: string }> }) {
  const n = await titleNames((await params).community);
  return { title: n?.community ?? "Community" };
}

export default async function CommunityHubPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const access = await pageCommunity(slug);
  const [spaces, stats] = await Promise.all([getCommunityHub(access), getCommunityStats(access.community.id)]);
  const { community, role, user } = access;

  return (
    <div className="min-h-dvh">
      <TopBar user={user}>
        <span className="truncate text-sm font-semibold">{community.name}</span>
        {role ? <RoleBadge role={role} className="hidden shrink-0 sm:inline-flex" /> : null}
      </TopBar>

      {access.isOverride ? (
        <div className="mx-3 mt-3 rounded-full bg-secondary px-6 py-2 text-center text-xs font-medium text-secondary-foreground sm:mx-5">
          You&rsquo;re viewing this community as a Super Admin. Changes you make are logged under your account.
        </div>
      ) : null}

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <PageHeader
          eyebrow="Community"
          title={community.name}
          description={community.description ?? "Pick a space to start learning."}
          actions={
            <>
              {rules.canViewMembers(role) ? (
                <ButtonLink href={`/c/${community.slug}/members`} variant="outline">
                  <Users /> Members &amp; invites
                </ButtonLink>
              ) : null}
              {rules.canCreateSpaces(role) ? <CreateSpaceDialog communitySlug={community.slug} /> : null}
            </>
          }
        />

        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <StatTile icon={<Layers />} tone="lilac" label="Spaces" value={spaces.length} />
          <StatTile icon={<Users />} tone="mint" label="Members" value={stats.members} />
          <StatTile icon={<FolderGit2 />} tone="sun" label="Projects shipped" value={stats.shipped} />
        </div>

        <h2 className="mb-4 font-display text-2xl font-black tracking-tight uppercase">Spaces</h2>
        {spaces.length === 0 ? (
          <EmptyState icon={<Layers />} title="No spaces yet" action={rules.canCreateSpaces(role) ? <CreateSpaceDialog communitySlug={community.slug} /> : null}>
            Spaces hold the learning: roadmaps, projects, standups and leaderboards. Create one for each track your community runs.
          </EmptyState>
        ) : (
          <Panel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map(({ space, members, mentors, effectiveRole, myRole }, i) => {
              const href = `/c/${community.slug}/${space.slug}`;
              return (
                <article key={space.id} className="group relative flex flex-col rounded-2xl bg-card p-5 shadow-card transition-transform hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn("grid size-11 place-items-center rounded-2xl font-display text-lg font-black", SPACE_TONES[i % SPACE_TONES.length])}>
                      {space.name.slice(0, 1)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {space.joinPolicy === "INVITE" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          <Lock className="size-3" /> Invite only
                        </span>
                      ) : null}
                      {effectiveRole ? <RoleBadge role={effectiveRole} /> : null}
                    </div>
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">
                    {effectiveRole ? (
                      <Link href={href} className="after:absolute after:inset-0">
                        {space.name}
                      </Link>
                    ) : (
                      space.name
                    )}
                  </h3>
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{space.description ?? "No description yet."}</p>
                  <div className="mt-5 flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground">
                      {members} learners · {mentors} team
                    </div>
                    {effectiveRole ? (
                      <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    ) : (
                      <JoinSpaceButton communitySlug={community.slug} spaceSlug={space.slug} spaceName={space.name} size="sm" className="relative z-10" />
                    )}
                  </div>
                  {effectiveRole && !myRole ? (
                    <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">Lead access through your community role.</p>
                  ) : null}
                </article>
              );
            })}
          </div>
          </Panel>
        )}
      </main>
    </div>
  );
}
