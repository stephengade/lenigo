import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { InvitePanel } from "@/components/community/invite-panel";
import { MemberRoleSelect, RemoveMemberButton } from "@/components/community/member-actions";
import { pageSpaceRole } from "@/server/auth/guards";
import { listSpaceMembers } from "@/server/services/communities";
import { listActiveInvites } from "@/server/services/invites";
import { SPACE_ROLES, space as rules } from "@/lib/permissions";

export const metadata = { title: "Team" };

export default async function SpaceTeamPage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const access = await pageSpaceRole(c, s, rules.canViewTeam);
  const [members, invites] = await Promise.all([
    listSpaceMembers(access.space.id),
    listActiveInvites({ communityId: access.community.id, spaceId: access.space.id }),
  ]);
  const scope = { kind: "space" as const, communitySlug: c, spaceSlug: s };
  const counts = SPACE_ROLES.map((r) => [r, members.filter((m) => m.role === r).length] as const);

  return (
    <div>
      <PageHeader
        title="Team & members"
        description={
          access.spaceRole === "LEAD"
            ? "Invite Managers, Mentors and Members, or another Lead. Managers can invite Mentors and Members."
            : "As a Manager you can invite Mentors and Members. Only Leads can add Managers or Leads."
        }
      />

      <div className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
            {counts.map(([r, n]) => (
              <span key={r}>
                {r.toLowerCase()}s · <span className="text-foreground">{n}</span>
              </span>
            ))}
          </div>
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
            {members.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nobody has joined yet. Community Owners and Admins already have Lead access.
              </li>
            ) : null}
            {members.map((m) => {
              const self = m.userId === access.user.id;
              const assignable = self ? [] : SPACE_ROLES.filter((to) => to !== m.role && rules.canChangeRole(access.spaceRole, m.role, to));
              return (
                <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                  <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                      {self ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.githubUsername ? `@${m.githubUsername} · ` : `${m.email} · `}joined {format(m.joinedAt, "d MMM yyyy")}
                    </div>
                  </div>
                  <MemberRoleSelect scope={scope} userId={m.userId} role={m.role} assignable={assignable} />
                  {!self && rules.canRemove(access.spaceRole, m.role) ? (
                    <RemoveMemberButton communitySlug={c} spaceSlug={s} userId={m.userId} name={m.name ?? m.email} />
                  ) : (
                    <span className="size-7" />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside>
          <InvitePanel
            scope={scope}
            roles={rules.invitableRoles(access.spaceRole)}
            invites={invites.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.spaceRole!,
              uses: i.uses,
              maxUses: i.maxUses,
              expiresAt: i.expiresAt.toISOString(),
              createdBy: i.createdBy ?? i.createdByEmail,
            }))}
          />
        </aside>
      </div>
    </div>
  );
}
