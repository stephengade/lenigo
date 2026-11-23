"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  ClipboardCheck,
  Home,
  LibraryBig,
  Map,
  MessagesSquare,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { space, type SpaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; show: (r: SpaceRole) => boolean; phase?: number };

const ITEMS: Item[] = [
  { href: "", label: "Home", icon: Home, show: () => true },
  { href: "/roadmap", label: "Roadmap", icon: Map, show: () => true, phase: 2 },
  { href: "/feed", label: "Feed", icon: MessagesSquare, show: () => true, phase: 3 },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, show: () => true, phase: 3 },
  { href: "/workshops", label: "Workshops", icon: CalendarClock, show: () => true, phase: 4 },
];

const STAFF: Item[] = [
  { href: "/review", label: "Review queue", icon: ClipboardCheck, show: space.canReview, phase: 3 },
  { href: "/curriculum", label: "Curriculum", icon: LibraryBig, show: space.canEditCurriculum, phase: 2 },
  { href: "/team", label: "Team", icon: Users, show: space.canViewTeam },
];

export function SpaceNav({ base, role, row }: { base: string; role: SpaceRole; row?: boolean }) {
  const pathname = usePathname();
  const staff = STAFF.filter((i) => i.show(role));

  const link = (i: Item) => {
    const href = base + i.href;
    const active = i.href === "" ? pathname === base : pathname.startsWith(href);
    return (
      <Link
        key={i.href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors",
          active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <i.icon className={cn("size-4", active ? "text-ember" : "text-muted-foreground group-hover:text-foreground")} />
        <span className="flex-1">{i.label}</span>
        {i.phase && !row ? <span className="font-mono text-[9px] text-muted-foreground/70">soon</span> : null}
      </Link>
    );
  };

  return (
    <nav className={cn("flex gap-0.5", row ? "flex-row" : "flex-col")} aria-label="Space">
      {ITEMS.filter((i) => i.show(role)).map(link)}
      {row ? staff.map(link) : null}
      {!row && staff.length ? (
        <>
          <div className="mt-5 mb-1.5 px-2.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">Team tools</div>
          {staff.map(link)}
        </>
      ) : null}
    </nav>
  );
}
