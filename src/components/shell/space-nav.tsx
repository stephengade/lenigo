"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarClock,
  GraduationCap,
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

type Item = { href: string; label: string; icon: LucideIcon; show: (r: SpaceRole) => boolean; /** Other pages that belong to this item. */ also?: string[] };

const ITEMS: Item[] = [
  { href: "", label: "Home", icon: Home, show: () => true },
  { href: "/roadmap", label: "Roadmap", icon: Map, show: () => true, also: ["/learn/", "/modules/"] },
  { href: "/feed", label: "Feed", icon: MessagesSquare, show: () => true },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy, show: () => true },
  { href: "/workshops", label: "Workshops", icon: CalendarClock, show: () => true },
];

const STAFF: Item[] = [
  { href: "/review", label: "Review queue", icon: ClipboardCheck, show: space.canReview },
  { href: "/learners", label: "Learners", icon: GraduationCap, show: space.canReview },
  { href: "/curriculum", label: "Curriculum", icon: LibraryBig, show: space.canEditCurriculum },
  { href: "/team", label: "Team", icon: Users, show: space.canViewTeam },
];

/** row: the phone tab strip. compact: icons only (the lesson player's focus mode). */
export function SpaceNav({ base, role, row, compact }: { base: string; role: SpaceRole; row?: boolean; compact?: boolean }) {
  const pathname = usePathname();
  const staff = STAFF.filter((i) => i.show(role));

  const link = (i: Item) => {
    const href = base + i.href;
    const active = i.href === "" ? pathname === base : pathname.startsWith(href) || !!i.also?.some((p) => pathname.startsWith(base + p));
    return (
      <Link
        key={i.href}
        href={href}
        aria-current={active ? "page" : undefined}
        title={compact ? i.label : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded-full py-2",
          compact ? "justify-center px-2" : "px-3.5",
          "text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/25",
          active ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:bg-card hover:text-foreground",
        )}
      >
        <i.icon className={cn("size-4", active ? "text-ink-foreground" : "text-muted-foreground group-hover:text-foreground")} />
        <span className={compact ? "sr-only" : "flex-1"}>{i.label}</span>
      </Link>
    );
  };

  return (
    <nav className={cn("flex gap-1", row ? "flex-row" : "flex-col")} aria-label="Space">
      {ITEMS.filter((i) => i.show(role)).map(link)}
      {row ? staff.map(link) : null}
      {!row && staff.length ? (
        <>
          {compact ? (
            <div className="mx-2 my-3 border-t border-border" role="separator" aria-label="Team tools" />
          ) : (
            <div className="mt-5 mb-1 px-3.5 text-xs font-semibold text-muted-foreground">Team tools</div>
          )}
          {staff.map(link)}
        </>
      ) : null}
    </nav>
  );
}
