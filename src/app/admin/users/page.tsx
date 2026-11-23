import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import { GlobalRoleSelect } from "@/components/admin/global-role-select";
import { pageGlobalHouse } from "@/server/auth/guards";
import { listUsers } from "@/server/services/admin";
import { global } from "@/lib/permissions";

export const metadata = { title: "Users" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await pageGlobalHouse();
  const { q } = await searchParams;
  const rows = await listUsers(q?.slice(0, 120));
  const canAssign = global.canAssignGlobalRoles(me.globalRole);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Global House"
        title="Users"
        description={
          canAssign
            ? "Look up anyone on the platform and assign Global House roles. Admins provision and suspend communities; Viewers get read-only analytics."
            : "Look up anyone on the platform. Only Super Admins can change global roles."
        }
      />

      <form action="/admin/users" className="relative mb-6">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by email, name or GitHub handle"
          className="h-10 w-full rounded-xl border bg-card pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </form>

      <ul className="divide-y rounded-2xl border bg-card">
        {rows.length === 0 ? <li className="px-4 py-10 text-center text-sm text-muted-foreground">No users found.</li> : null}
        {rows.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
            <UserAvatar name={u.name} email={u.email} src={u.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {u.name ?? u.email}
                {u.id === me.id ? <span className="ml-1.5 text-xs text-muted-foreground">(you)</span> : null}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.email}
                {u.githubUsername ? ` · @${u.githubUsername}` : ""}
                {u.lastSeenAt ? ` · seen ${formatDistanceToNowStrict(u.lastSeenAt, { addSuffix: true })}` : ""}
              </div>
            </div>
            <div className="hidden max-w-56 flex-wrap justify-end gap-1 md:flex">
              {u.communities.slice(0, 3).map((slug) => (
                <Link key={slug} href={`/admin/communities/${slug}`} className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                  {slug}
                </Link>
              ))}
              {u.communities.length > 3 ? <span className="font-mono text-[10px] text-muted-foreground">+{u.communities.length - 3}</span> : null}
            </div>
            {canAssign && u.id !== me.id ? <GlobalRoleSelect userId={u.id} role={u.globalRole} /> : <RoleBadge role={u.globalRole} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
