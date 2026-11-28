import Link from "next/link";
import { Lock } from "lucide-react";
import { TopBar } from "@/components/shell/top-bar";
import { SpaceFrame } from "@/components/shell/space-frame";
import { RoleBadge } from "@/components/role-badge";
import { JoinSpaceButton } from "@/components/community/join-space-button";
import { pageSpace, titleNames } from "@/server/auth/guards";
import { getCommunityHub } from "@/server/services/communities";

export async function generateMetadata({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community, space } = await params;
  const n = await titleNames(community, space);
  if (!n) return {}; // no access: keep the site's generic title
  const place = `${n.space} · ${n.community}`;
  return { title: { template: `%s · ${place}`, default: place } };
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
        <RoleBadge role={spaceRole} className="hidden shrink-0 sm:inline-flex" />
      </TopBar>

      {access.isOverride ? (
        <div className="mx-3 mt-3 rounded-full bg-secondary px-6 py-2 text-center text-xs font-medium text-secondary-foreground sm:mx-5">
          Super Admin override: you have Lead access here. Everything you do is logged.
        </div>
      ) : null}

      <SpaceFrame
        base={base}
        role={spaceRole}
        community={{ name: community.name, slug: community.slug }}
        siblings={siblings.map(({ space: s }) => ({ id: s.id, name: s.name, slug: s.slug }))}
        currentSpaceId={space.id}
      >
        {children}
      </SpaceFrame>
    </div>
  );
}
