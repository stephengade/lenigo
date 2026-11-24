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
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0" aria-label="Global House">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ink-foreground/25",
              active ? "bg-ink-foreground text-ink" : "text-ink-foreground/65 hover:bg-ink-foreground/10 hover:text-ink-foreground",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
      <Link
        href="/c"
        className="flex items-center gap-2.5 rounded-full px-3.5 py-2 text-sm whitespace-nowrap text-ink-foreground/55 hover:text-ink-foreground md:mt-4"
      >
        <ArrowLeft className="size-4" /> My communities
      </Link>
    </nav>
  );
}
