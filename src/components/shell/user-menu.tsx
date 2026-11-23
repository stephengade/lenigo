"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Building2, LayoutGrid, LogOut, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { RoleBadge } from "@/components/role-badge";
import type { GlobalRole } from "@/lib/permissions";

export type MenuUser = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
  githubUsername: string | null;
  globalRole: GlobalRole;
};

export function UserMenu({ user, showHouse }: { user: MenuUser; showHouse: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Account menu"
      >
        <UserAvatar name={user.name} email={user.email} src={user.avatarUrl} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">{user.name ?? user.email}</span>
            <span className="truncate text-xs font-normal">{user.githubUsername ? `@${user.githubUsername}` : user.email}</span>
            {user.globalRole !== "USER" ? <RoleBadge role={user.globalRole} className="mt-1 self-start" /> : null}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/c" />}>
          <LayoutGrid /> My communities
        </DropdownMenuItem>
        {showHouse ? (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <Building2 /> Global House
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun /> : <Moon />} {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={async () => {
            await fetch("/auth/signout", { method: "POST" });
            router.replace("/");
            router.refresh();
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
