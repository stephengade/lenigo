import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { InvitePanel } from "@/components/community/invite-panel";
import {
  MemberRoleSelect,
  RemoveMemberButton,
} from "@/components/community/member-actions";
import { pageSpaceRole } from "@/server/auth/guards";
import {
  MEMBERS_PAGE_SIZE,
  pageSpaceMembers,
} from "@/server/services/communities";
import {
  MemberFilters,
  MemberPager,
} from "@/components/community/member-directory";
import { invitableTracks, listActiveInvites } from "@/server/services/invites";
import { ROLE_LABEL, SPACE_ROLES, space as rules } from "@/lib/permissions";

export const metadata = { title: "Team" };

export default async function SpaceTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ community: string; space: string }>;
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const [{ community: c, space: s }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const access = await pageSpaceRole(c, s, rules.canViewTeam);
  const [list, invites, tracks] = await Promise.all([
    pageSpaceMembers(access.space.id, {
      q: query.q,
      role: query.role,
      page: Number(query.page) || 1,
    }),
    listActiveInvites({
      communityId: access.community.id,
      spaceId: access.space.id,
    }),
    invitableTracks(access.space.id),
  ]);
  const scope = { kind: "space" as const, communitySlug: c, spaceSlug: s };

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

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <MemberFilters
            roles={SPACE_ROLES.map((r) => ({
              value: r,
              label: r === "MEMBER" ? "Learners" : `${ROLE_LABEL[r]}s`,
            }))}
            counts={list.counts}
            all={list.all}
            active={list.role}
          />
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
            {list.rows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                {query.q || list.role
                  ? "Nobody matches. Try another name, or clear the filters."
                  : "Nobody has joined yet. Community Leads and Admins already have Space Lead access."}
              </li>
            ) : null}
            {list.rows.map((m) => {
              const self = m.userId === access.user.id;
              const assignable = self
                ? []
                : SPACE_ROLES.filter(
                    (to) =>
                      to !== m.role &&
                      rules.canChangeRole(access.spaceRole, m.role, to),
                  );
              return (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4"
                >
                  <UserAvatar name={m.name} email={m.email} src={m.avatarUrl} />
                  <div className="min-w-0 flex-1 basis-40">
                    <div className="truncate text-sm font-medium">
                      {m.name ?? m.email}
                      {self ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (you)
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {m.githubUsername
                        ? `@${m.githubUsername} · `
                        : `${m.email} · `}
                      joined {format(m.joinedAt, "d MMM yyyy")}
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <MemberRoleSelect
                      scope={scope}
                      userId={m.userId}
                      role={m.role}
                      assignable={assignable}
                    />
                    {!self && rules.canRemove(access.spaceRole, m.role) ? (
                      <RemoveMemberButton
                        communitySlug={c}
                        spaceSlug={s}
                        userId={m.userId}
                        name={m.name ?? m.email}
                      />
                    ) : (
                      <span className="size-7" />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <MemberPager
            page={list.page}
            pageSize={MEMBERS_PAGE_SIZE}
            total={list.total}
          />
        </section>

        <aside>
          <InvitePanel
            scope={scope}
            roles={rules.invitableRoles(access.spaceRole)}
            placement={{ tracks, canPlaceAbove: rules.canPromoteLevel(access.spaceRole) }}
            invites={invites.map((i) => ({
              id: i.id,
              email: i.email,
              role: i.spaceRole!,
              uses: i.uses,
              maxUses: i.maxUses,
              expiresAt: i.expiresAt.toISOString(),
              expired: i.expired,
              createdBy: i.createdBy ?? i.createdByEmail,
              placement: i.track ? `${i.track} (${i.levelTitle ?? "first level"})` : null,
            }))}
          />
        </aside>
      </div>
    </div>
  );
}
