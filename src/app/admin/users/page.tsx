import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import { GlobalRoleSelect } from "@/components/admin/global-role-select";
import { UserActiveToggle } from "@/components/admin/user-active-toggle";
import { pageGlobalHouse } from "@/server/auth/guards";
import { pageUsers, USERS_PAGE_SIZE } from "@/server/services/admin";
import { global, ROLE_LABEL } from "@/lib/permissions";
import { MemberFilters, MemberPager } from "@/components/community/member-directory";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const me = await pageGlobalHouse();
  const sp = await searchParams;
  const { rows, page, role, counts, all, total } = await pageUsers({ q: sp.q, role: sp.role, page: Number(sp.page) });
  const canAssign = global.canAssignGlobalRoles(me.globalRole);
  const canDeactivate = global.canDeactivateUsers(me.globalRole);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Global House"
        title="Users"
        description={
          canAssign
            ? "Look up anyone on the platform, assign Global House roles, or deactivate an account. Admins provision and suspend communities; Viewers get read-only analytics. Deactivated people can't sign in; nothing of theirs is deleted."
            : "Look up anyone on the platform. Only Super Admins can change global roles."
        }
      />

      <MemberFilters
        roles={[
          ...(["SUPER_ADMIN", "ADMIN", "VIEWER", "USER"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] })),
          { value: "DEACTIVATED", label: "Deactivated" },
        ]}
        counts={counts}
        all={all}
        active={role}
        placeholder="Search by email, name or GitHub handle"
      />

      <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
        {rows.length === 0 ? <li className="px-4 py-10 text-center text-sm text-muted-foreground">{sp.q || role ? "No one matches." : "No users yet."}</li> : null}
        {rows.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
            <UserAvatar name={u.name} email={u.email} src={u.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {u.name ?? u.email}
                {u.id === me.id ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
                {u.deactivatedAt ? (
                  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">Deactivated</span>
                ) : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.email}
                {u.githubUsername ? ` · @${u.githubUsername}` : ""}
                {u.lastSeenAt ? ` · seen ${formatDistanceToNowStrict(u.lastSeenAt, { addSuffix: true })}` : ""}
              </div>
            </div>
            <div className="hidden max-w-56 flex-wrap justify-end gap-1 md:flex">
              {u.communities.slice(0, 3).map((slug) => (
                <Link key={slug} href={`/admin/communities/${slug}`} className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                  {slug}
                </Link>
              ))}
              {u.communities.length > 3 ? <span className="text-[11px] text-muted-foreground">+{u.communities.length - 3}</span> : null}
            </div>
            {canAssign && u.id !== me.id ? <GlobalRoleSelect userId={u.id} role={u.globalRole} /> : <RoleBadge role={u.globalRole} />}
            {canDeactivate && u.id !== me.id && (u.globalRole !== "SUPER_ADMIN" || u.deactivatedAt) ? (
              <UserActiveToggle userId={u.id} name={u.name ?? u.email} deactivated={!!u.deactivatedAt} />
            ) : null}
          </li>
        ))}
      </ul>
      <MemberPager page={page} pageSize={USERS_PAGE_SIZE} total={total} />
    </div>
  );
}
