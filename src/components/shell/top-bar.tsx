import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import type { User } from "@/server/db/schema";
import { global } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Floating pill bar, same shape as the landing page nav. `children` is the breadcrumb. */
export function TopBar({ user, children, className }: { user: User; children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("sticky top-0 z-30 px-3 pt-3 sm:px-5", className)}>
      <div className="flex h-14 items-center gap-3 rounded-full bg-card/90 pr-2 pl-4 shadow-card ring-1 ring-foreground/5 backdrop-blur">
        <Logo href="/c" />
        {children ? (
          <>
            <span className="text-muted-foreground/50 select-none" aria-hidden>
              /
            </span>
            <div className="flex min-w-0 items-center gap-2">{children}</div>
          </>
        ) : null}
        <div className="ml-auto">
          <UserMenu
            user={{
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
              githubUsername: user.githubUsername,
              username: user.username,
              globalRole: user.globalRole,
            }}
            showHouse={global.canEnterHouse(user.globalRole)}
          />
        </div>
      </div>
    </header>
  );
}
