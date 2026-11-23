import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/shell/user-menu";
import type { User } from "@/server/db/schema";
import { global } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function TopBar({ user, children, className }: { user: User; children?: React.ReactNode; className?: string }) {
  return (
    <header className={cn("sticky top-0 z-30 border-b bg-background/85 backdrop-blur", className)}>
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Logo href="/c" />
        {children ? (
          <>
            <span className="text-border select-none" aria-hidden>
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
              globalRole: user.globalRole,
            }}
            showHouse={global.canEnterHouse(user.globalRole)}
          />
        </div>
      </div>
    </header>
  );
}
