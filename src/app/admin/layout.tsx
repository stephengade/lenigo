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
    <div className="min-h-dvh md:grid md:grid-cols-[264px_1fr]">
      {/* Floating dark panel: the Global House is visibly a different place from a community. */}
      <aside className="m-3 flex flex-col rounded-3xl bg-ink text-ink-foreground md:sticky md:top-3 md:h-[calc(100dvh-1.5rem)]">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <LogoMark inverted className="size-8" />
            <div className="leading-tight">
              <div className="font-display text-base font-black tracking-tight uppercase">Global House</div>
              <div className="text-xs text-ink-foreground/55">Lenigo platform</div>
            </div>
          </Link>
        </div>
        <AdminNav />
        <div className="m-3 mt-auto hidden items-center gap-3 rounded-2xl bg-ink-foreground/8 p-3 md:flex">
          <UserMenu
            user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl, githubUsername: user.githubUsername, username: user.username, globalRole: user.globalRole }}
            showHouse
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user.name ?? user.email}</div>
            <RoleBadge role={user.globalRole} className="mt-0.5 h-5 bg-ink-foreground/12 px-2 text-[11px] text-ink-foreground" />
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">{children}</main>
    </div>
  );
}
