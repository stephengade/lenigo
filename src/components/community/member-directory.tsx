"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Builds this page's URL with some search params changed; null removes one. */
function useHref() {
  const pathname = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}

/**
 * Search box and role chips for a member list. State lives in the URL (?q=&role=&page=), so the
 * server does the filtering and a filtered view can be shared or reloaded.
 */
export function MemberFilters({
  roles,
  counts,
  all,
  active,
  placeholder = "Search by name, email or GitHub",
}: {
  roles: { value: string; label: string }[];
  counts: Record<string, number | undefined>;
  all: number;
  active?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const href = useHref();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Search as you type, a moment after the last keystroke.
  useEffect(() => {
    // Only navigate when the box differs from the URL (not on mount, which dev runs twice).
    if (q.trim() === (params.get("q") ?? "")) return;
    const t = setTimeout(() => start(() => router.replace(href({ q: q.trim() || null, page: null }), { scroll: false })), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const chip = (value: string | null, label: string, n: number) => {
    const on = (active ?? null) === value;
    return (
      <Link
        key={value ?? "all"}
        href={href({ role: value, page: null })}
        scroll={false}
        aria-current={on ? "true" : undefined}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
          on ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground",
        )}
      >
        {label}
        <span className={cn("tabular", on ? "text-background/70" : "text-muted-foreground/80")}>{n.toLocaleString()}</span>
      </Link>
    );
  };

  return (
    <div className="mb-3 space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search members"
          maxLength={100}
          className="h-10 w-full rounded-full bg-card pr-10 pl-10 text-sm shadow-xs ring-1 ring-foreground/10 outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="absolute top-1/2 right-2 -translate-y-1/2">
          {pending ? (
            <Loader2 className="m-1.5 size-4 animate-spin text-muted-foreground" />
          ) : q ? (
            <button
              type="button"
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </span>
      </div>
      {/* Scrolls sideways on small screens instead of wrapping into a tall block. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {chip(null, "All", all)}
        {roles.map((r) => chip(r.value, r.label, counts[r.value] ?? 0))}
      </div>
    </div>
  );
}

/** "51–100 of 1,234" with previous / next links. Hidden when everything fits on one page. */
export function MemberPager({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const href = useHref();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page === 1) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold ring-1 ring-foreground/10 bg-card hover:bg-surface aria-disabled:pointer-events-none aria-disabled:opacity-40";
  return (
    <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
      <span className="tabular">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <span className="flex items-center gap-2">
        <Link href={href({ page: page > 2 ? String(page - 1) : null })} scroll={false} aria-disabled={page <= 1} tabIndex={page <= 1 ? -1 : undefined} className={btn}>
          <ChevronLeft className="size-3.5" /> Previous
        </Link>
        <span className="hidden tabular sm:inline">
          Page {page} of {pages}
        </span>
        <Link href={href({ page: String(page + 1) })} scroll={false} aria-disabled={page >= pages} tabIndex={page >= pages ? -1 : undefined} className={btn}>
          Next <ChevronRight className="size-3.5" />
        </Link>
      </span>
    </nav>
  );
}
