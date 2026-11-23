import { LogoMark } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import { AdminNav } from "@/components/admin/admin-nav";
import { RoleBadge } from "@/components/role-badge";
import { pageGlobalHouse } from "@/server/auth/guards";
import Link from "next/link";

export const metadata = { title: { template: "%s · Global House", default: "Global House" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await pageGlobalHouse();

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      <aside className="flex flex-col bg-ink text-ink-foreground md:sticky md:top-0 md:h-dvh">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <LogoMark inverted />
            <div className="leading-tight">
              <div className="font-display text-sm font-bold">Global House</div>
              <div className="font-mono text-[10px] text-ink-foreground/50 uppercase">lenigo platform</div>
            </div>
          </Link>
        </div>
        <AdminNav />
        <div className="mt-auto hidden items-center gap-3 border-t border-white/10 px-5 py-4 md:flex">
          <UserMenu
            user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl, githubUsername: user.githubUsername, globalRole: user.globalRole }}
            showHouse
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{user.name ?? user.email}</div>
            <RoleBadge role={user.globalRole} className="bg-white/10 text-ink-foreground" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">{children}</main>
    </div>
  );
}
