"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, ListOrdered, Lock, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Phones and tablets: the step's controls stay on screen in a bar at the bottom (Previous, the
 * course content, Mark as completed), so a learner never scrolls past a long quiz to find them.
 * The course content opens as a sheet above the bar. Hidden from lg up, where the sidebar shows.
 */
export function MobileStepBar({
  prevHref,
  nextHref,
  unlocked,
  hint,
  position,
  total,
  children,
}: {
  prevHref: string | null;
  nextHref: string;
  unlocked: boolean;
  /** "Next: …" when unlocked, otherwise what's still needed. */
  hint: string;
  position: number;
  total: number;
  /** The course content list (server-rendered). */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const sheetId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      {open ? <button type="button" aria-label="Close course content" className="fixed inset-0 z-40 bg-ink/40" onClick={() => setOpen(false)} /> : null}
      {open ? (
        <div
          id={sheetId}
          role="dialog"
          aria-label="Course content"
          className="fixed inset-x-0 bottom-0 z-50 max-h-[75dvh] overflow-y-auto rounded-t-3xl bg-surface p-3 pb-[calc(6rem+env(safe-area-inset-bottom))] shadow-card"
          // Picking a step navigates; close the sheet as it does.
          onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}
        >
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => setOpen(false)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <X /> Close
            </button>
          </div>
          {children}
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        <p className="mb-1.5 truncate px-1 text-xs text-muted-foreground">{hint}</p>
        <div className="flex items-center gap-2">
          {prevHref ? (
            <Link href={prevHref} aria-label="Previous step" className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "shrink-0")}>
              <ChevronLeft />
            </Link>
          ) : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={sheetId}
            onClick={() => setOpen((v) => !v)}
            className={cn(buttonVariants({ variant: "outline" }), "shrink-0 tabular")}
          >
            <ListOrdered /> {position}/{total}
          </button>
          {unlocked ? (
            <Link href={nextHref} className={cn(buttonVariants(), "min-w-0 flex-1 px-3")}>
              <Check strokeWidth={3} /> <span className="truncate">Mark as completed</span> <ChevronRight />
            </Link>
          ) : (
            <button type="button" disabled className={cn(buttonVariants(), "min-w-0 flex-1 px-3")}>
              <Lock /> <span className="truncate">Mark as completed</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
