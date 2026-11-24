import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeft } from "lucide-react";
import { TopBar } from "@/components/shell/top-bar";
import { PageHeader } from "@/components/page-header";
import { ButtonLink } from "@/components/button-link";
import { UserAvatar } from "@/components/user-avatar";
import { InvitePanel } from "@/components/community/invite-panel";
import { CommunityMemberMenu, MemberRoleSelect } from "@/components/community/member-actions";
import { pageCommunity } from "@/server/auth/guards";
import { listCommunityMembers } from "@/server/services/communities";
import { listActiveInvites } from "@/server/services/invites";
import { COMMUNITY_ROLES, community as rules } from "@/lib/permissions";

export const metadata = { title: "Members" };

export default async function CommunityMembersPage({ params }: { params: Promise<{ community: string }> }) {
  const { community: slug } = await params;
  const access = await pageCommunity(slug);
  if (!rules.canViewMembers(access.role)) redirect(`/c/${slug}`);

  const [members, invites] = await Promise.all([
    listCommunityMembers(access.community.id),
    listActiveInvites({ communityId: access.community.id }),
  ]);
  const scope = { kind: "community" as const, communitySlug: slug };

  return (
    <div className="min-h-dvh">
      <TopBar user={access.user}>
        <span className="truncate text-sm font-semibold">{access.community.name}</span>
      </TopBar>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <ButtonLink href={`/c/${slug}`} variant="ghost" size="sm" className="mb-4 -ml-2">
          <ChevronLeft /> {access.community.name}
        </ButtonLink>
        <PageHeader
          title="Members & invites"
          description="Community Leads and Admins act as Space Lead in every space. To give someone a role in one space only (Space Lead, Manager, Mentor), invite them from that space's Team page."
        />

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section>
            <h2 className="mb-3 text-xs font-medium text-muted-foreground">Members · {members.length}</h2>
            <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
              {members.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nobody has joined yet. People appear here once they accept an invite.
                </li>
              ) : null}
              {members.map((m) => (
                <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                  <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                      {m.userId === access.user.id ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.githubUsername ? `@${m.githubUsername} · ` : ""}
                      {m.spaces} space{m.spaces === 1 ? "" : "s"} · joined {format(m.joinedAt, "d MMM yyyy")}
                    </div>
                  </div>
                  <MemberRoleSelect
                    scope={scope}
                    userId={m.userId}
                    role={m.role}
                    assignable={
                      m.userId === access.user.id
                        ? []
                        : COMMUNITY_ROLES.filter((to) => to !== m.role && rules.canChangeRole(access.role, m.role, to))
                    }
                  />
                  <CommunityMemberMenu
                    communitySlug={slug}
                    userId={m.userId}
                    name={m.name ?? m.email}
                    canHandOver={m.userId !== access.user.id && m.role !== "OWNER" && rules.canHandOver(access.role)}
                    canRemove={m.userId !== access.user.id && rules.canRemove(access.role, m.role)}
                    viewerIsLead={access.membershipRole === "OWNER"}
                  />
                </li>
              ))}
            </ul>
          </section>

          <aside>
            <InvitePanel
              scope={scope}
              roles={rules.invitableRoles(access.role)}
              invites={invites.map((i) => ({
                id: i.id,
                email: i.email,
                role: i.communityRole!,
                uses: i.uses,
                maxUses: i.maxUses,
                expiresAt: i.expiresAt.toISOString(),
                expired: i.expired,
                createdBy: i.createdBy ?? i.createdByEmail,
              }))}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}
