import Link from "next/link";
import { ChevronLeft, Lock } from "lucide-react";
import { TopBar } from "@/components/shell/top-bar";
import { SpaceNav } from "@/components/shell/space-nav";
import { RoleBadge } from "@/components/role-badge";
import { JoinSpaceButton } from "@/components/community/join-space-button";
import { pageSpace } from "@/server/auth/guards";
import { getCommunityHub } from "@/server/services/communities";

export async function generateMetadata({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community, space } = await params;
  return { title: { template: `%s · ${space} · ${community}`, default: `${space} · ${community}` } };
}

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ community: string; space: string }>;
}) {
  const { community: communitySlug, space: spaceSlug } = await params;
  const access = await pageSpace(communitySlug, spaceSlug);
  const { community, space, spaceRole, user } = access;
  const base = `/c/${community.slug}/${space.slug}`;

  // Visible but not joined (OPEN space): show a join gate instead of the space.
  if (!spaceRole) {
    return (
      <div className="min-h-dvh">
        <TopBar user={user}>
          <Link href={`/c/${community.slug}`} className="truncate text-sm font-semibold hover:underline">
            {community.name}
          </Link>
        </TopBar>
        <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
          <div className="grid size-16 place-items-center rounded-2xl bg-lilac-soft font-display text-3xl font-black text-lilac-foreground">
            {space.name.slice(0, 1)}
          </div>
          <h1 className="mt-6 font-display text-4xl leading-[0.95] font-black tracking-tight uppercase">{space.name}</h1>
          <p className="mt-2 text-muted-foreground">{space.description ?? `A learning space in ${community.name}.`}</p>
          {space.joinPolicy === "OPEN" ? (
            <JoinSpaceButton communitySlug={community.slug} spaceSlug={space.slug} spaceName={space.name} size="lg" className="mt-8" />
          ) : (
            <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" /> Invite only. Ask a lead for an invite.
            </p>
          )}
        </main>
      </div>
    );
  }

  const siblings = (await getCommunityHub(access)).filter((s) => s.effectiveRole);

  return (
    <div className="min-h-dvh">
      <TopBar user={user}>
        <Link href={`/c/${community.slug}`} className="hidden truncate text-sm text-muted-foreground hover:text-foreground sm:inline">
          {community.name}
        </Link>
        <span className="hidden text-border sm:inline" aria-hidden>
          /
        </span>
        <span className="truncate text-sm font-semibold">{space.name}</span>
        <RoleBadge role={spaceRole} />
      </TopBar>

      {access.isOverride ? (
        <div className="mx-3 mt-3 rounded-full bg-secondary px-6 py-2 text-center text-xs font-medium text-secondary-foreground sm:mx-5">
          Super Admin override: you have Lead access here. Everything you do is logged.
        </div>
      ) : null}

      <div className="mx-auto flex max-w-7xl gap-8 px-4 sm:px-6">
        <aside className="sticky top-20 my-6 hidden h-[calc(100dvh-6.5rem)] w-60 shrink-0 flex-col rounded-3xl bg-surface p-3 md:flex">
          <Link
            href={`/c/${community.slug}`}
            className="mb-4 inline-flex items-center gap-1 px-3.5 pt-2 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" /> {community.name}
          </Link>
          <SpaceNav base={base} role={spaceRole} />

          {siblings.length > 1 ? (
            <div className="mt-auto">
              <div className="mb-1 px-3.5 text-xs font-semibold text-muted-foreground">Your spaces</div>
              <div className="flex flex-col gap-1">
                {siblings.map(({ space: s }) => (
                  <Link
                    key={s.id}
                    href={`/c/${community.slug}/${s.slug}`}
                    className="flex items-center gap-2.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-card hover:text-foreground aria-[current=true]:bg-card aria-[current=true]:font-medium aria-[current=true]:text-foreground"
                    aria-current={s.id === space.id}
                  >
                    <span className="grid size-6 place-items-center rounded-lg bg-lilac-soft text-[11px] font-bold text-lilac-foreground">
                      {s.name.slice(0, 1)}
                    </span>
                    <span className="truncate">{s.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 flex-1 py-8">
          <div className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 md:hidden">
            <div className="w-max">
              <SpaceNav base={base} role={spaceRole} row />
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
