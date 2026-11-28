"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SpaceNav } from "@/components/shell/space-nav";
import { cn } from "@/lib/utils";
import type { SpaceRole } from "@/lib/permissions";

type Sibling = { id: string; name: string; slug: string };

/**
 * The space's page frame: the sidebar menu, the phone tab strip and the content column.
 * On lesson pages (/learn/…) it switches to focus mode, like a course player: the menu shrinks
 * to icons, the page gets wider so the video does, and the phone tab strip steps aside (the
 * lesson has its own bottom bar).
 */
export function SpaceFrame({
  base,
  role,
  community,
  siblings,
  currentSpaceId,
  children,
}: {
  base: string;
  role: SpaceRole;
  community: { name: string; slug: string };
  siblings: Sibling[];
  currentSpaceId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const focus = pathname.startsWith(`${base}/learn/`);

  return (
    <div className={cn("mx-auto flex gap-8 px-4 sm:px-6", focus ? "max-w-[96rem] gap-6" : "max-w-7xl")}>
      <aside
        className={cn(
          "sticky top-20 my-6 hidden h-[calc(100dvh-6.5rem)] shrink-0 flex-col rounded-3xl bg-surface md:flex",
          focus ? "w-16 items-stretch p-2" : "w-60 p-3",
        )}
      >
        <Link
          href={`/c/${community.slug}`}
          title={focus ? community.name : undefined}
          className={cn(
            "mb-4 inline-flex items-center gap-1 pt-2 text-xs font-medium text-muted-foreground hover:text-foreground",
            focus ? "justify-center" : "px-3.5",
          )}
        >
          <ChevronLeft className="size-3.5" /> <span className={focus ? "sr-only" : undefined}>{community.name}</span>
        </Link>
        <SpaceNav base={base} role={role} compact={focus} />

        {siblings.length > 1 ? (
          <div className="mt-auto">
            <div className={cn("mb-1 text-xs font-semibold text-muted-foreground", focus ? "sr-only" : "px-3.5")}>Your spaces</div>
            <div className="flex flex-col gap-1">
              {siblings.map((s) => (
                <Link
                  key={s.id}
                  href={`/c/${community.slug}/${s.slug}`}
                  title={focus ? s.name : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-full py-1.5 text-sm text-muted-foreground hover:bg-card hover:text-foreground aria-[current=true]:bg-card aria-[current=true]:font-medium aria-[current=true]:text-foreground",
                    focus ? "justify-center px-1" : "px-3",
                  )}
                  aria-current={s.id === currentSpaceId}
                >
                  <span className="grid size-6 place-items-center rounded-lg bg-lilac-soft text-[11px] font-bold text-lilac-foreground">{s.name.slice(0, 1)}</span>
                  <span className={focus ? "sr-only" : "truncate"}>{s.name}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </aside>

      <div className="min-w-0 flex-1 py-8">
        {focus ? null : (
          <div className="-mx-4 mb-6 overflow-x-auto px-4 pb-1 md:hidden">
            <div className="w-max">
              <SpaceNav base={base} role={role} row />
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
