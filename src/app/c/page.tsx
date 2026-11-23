import Link from "next/link";
import { ArrowUpRight, Building2, Compass } from "lucide-react";
import { TopBar } from "@/components/shell/top-bar";
import { EmptyState, PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { ButtonLink } from "@/components/button-link";
import { requireUser } from "@/server/auth/session";
import { listMyCommunities } from "@/server/services/communities";
import { global } from "@/lib/permissions";

export const metadata = { title: "My communities" };

export default async function MyCommunitiesPage() {
  const user = await requireUser("/c");
  const communities = await listMyCommunities(user);
  const staff = global.canEnterHouse(user.globalRole);

  return (
    <div className="min-h-dvh">
      <TopBar user={user} />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <PageHeader
          eyebrow={`Hi ${user.name?.split(" ")[0] ?? "there"}`}
          title="Your communities"
          description="Every community you belong to, and the spaces you learn or mentor in."
          actions={
            staff ? (
              <ButtonLink href="/admin" variant="outline">
                <Building2 /> Global House
              </ButtonLink>
            ) : null
          }
        />

        {communities.length === 0 ? (
          <EmptyState
            icon={<Compass />}
            title="You're not in a community yet"
            action={staff ? <ButtonLink href="/admin/communities/new">Provision a community</ButtonLink> : null}
          >
            Lenigo is invite-only. Ask your community lead for an invite link, open it, and you&rsquo;ll land right here.
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            {communities.map(({ community, role, spaces }) => (
              <section key={community.id} className="overflow-hidden rounded-2xl border bg-card">
                <Link
                  href={`/c/${community.slug}`}
                  className="group flex items-center gap-4 p-5 transition-colors hover:bg-muted/50"
                >
                  <div className="grid size-11 place-items-center rounded-xl bg-ink font-display text-lg font-bold text-ink-foreground">
                    {community.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="truncate text-lg font-bold">{community.name}</h2>
                      <RoleBadge role={role} />
                      {community.status === "SUSPENDED" ? <span className="text-xs text-destructive">Suspended</span> : null}
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">/c/{community.slug}</p>
                  </div>
                  <ArrowUpRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
                {spaces.length ? (
                  <div className="flex flex-wrap gap-2 border-t bg-background/50 px-5 py-3">
                    {spaces.map(({ space, role: spaceRole }) => (
                      <Link
                        key={space.id}
                        href={`/c/${community.slug}/${space.slug}`}
                        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:border-foreground/20"
                      >
                        {space.name}
                        <RoleBadge role={spaceRole} />
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
