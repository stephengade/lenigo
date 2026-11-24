import Link from "next/link";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export type HealthRow = {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  members: number;
  spaces: number;
  dau: number;
  wau: number;
  shipped: number;
  pendingReviews: number;
  avgStreak: number;
  owner: string | null;
};

/** FR-7.3: compare tenants on engagement and review backlog. */
export function HealthTable({ rows }: { rows: HealthRow[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="px-4 py-3 font-medium">Community</th>
            <th className="px-3 py-3 text-right font-medium">Members</th>
            <th className="px-3 py-3 text-right font-medium">DAU / WAU</th>
            <th className="px-3 py-3 text-right font-medium">Shipped</th>
            <th className="px-3 py-3 text-right font-medium">Avg streak</th>
            <th className="px-4 py-3 text-right font-medium">Review backlog</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const engagement = r.members ? Math.round((r.wau / r.members) * 100) : 0;
            return (
              <tr key={r.id} className="transition-colors hover:bg-surface">
                <td className="px-4 py-3">
                  <Link href={`/admin/communities/${r.slug}`} className="group flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-lg bg-ink font-display text-sm font-bold text-ink-foreground">
                      {r.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium group-hover:underline">
                        {r.name}
                        {r.status === "SUSPENDED" ? (
                          <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">Suspended</span>
                        ) : null}
                      </span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        /c/{r.slug} · {r.spaces} space{r.spaces === 1 ? "" : "s"}
                        {r.owner ? ` · ${r.owner}` : " · no owner yet"}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3 text-right tabular">{r.members}</td>
                <td className="px-3 py-3 text-right tabular">
                  {r.dau} / {r.wau}
                  <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-mint" style={{ width: `${Math.min(engagement, 100)}%` }} />
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular">{r.shipped}</td>
                <td className="px-3 py-3 text-right tabular">
                  <span className="inline-flex items-center gap-1">
                    <Flame className="size-3.5 text-sun-foreground" />
                    {r.avgStreak}d
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "inline-flex min-w-8 justify-center rounded-full px-2 py-0.5 text-xs font-medium tabular",
                      r.pendingReviews > 10 ? "bg-destructive/10 text-destructive" : r.pendingReviews > 0 ? "bg-sun-soft text-sun-foreground" : "bg-surface text-muted-foreground",
                    )}
                  >
                    {r.pendingReviews}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
