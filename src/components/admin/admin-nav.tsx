"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, Building2, LayoutDashboard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/communities", label: "Communities", icon: Building2 },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/users", label: "Users", icon: Users },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-0.5 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0" aria-label="Global House">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
              active ? "bg-white/10 font-medium text-white" : "text-primary-foreground/65 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className={cn("size-4", active && "text-ember")} /> {label}
          </Link>
        );
      })}
      <Link
        href="/c"
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-primary-foreground/50 hover:text-white md:mt-4"
      >
        <ArrowLeft className="size-4" /> My communities
      </Link>
    </nav>
  );
}
