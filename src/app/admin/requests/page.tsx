import Link from "next/link";
import { notFound } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ExternalLink, Mail } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { RequestStatusSelect } from "@/components/admin/request-status";
import { pageGlobalHouse } from "@/server/auth/guards";
import { listCommunityRequests } from "@/server/services/community-requests";
import { global } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Requests" };

const TABS = [
  [null, "Open"],
  ["NEW", "New"],
  ["CONTACTED", "Contacted"],
  ["PROVISIONED", "Set up"],
  ["DECLINED", "Declined"],
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await pageGlobalHouse();
  if (!global.canProvision(me.globalRole)) notFound();
  const { status: raw } = await searchParams;
  const { rows, status, counts } = await listCommunityRequests(me, raw);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Global House"
        title="Requests"
        description="People who asked to bring their community to Lenigo (from the landing page). Reply by email, then provision the community and mark the request set up."
      />
      <nav className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Filter requests">
        {TABS.map(([value, label]) => {
          const on = status === value;
          const n = value ? (counts[value] ?? 0) : (counts.NEW ?? 0) + (counts.CONTACTED ?? 0);
          return (
            <Link
              key={label}
              href={value ? `/admin/requests?status=${value}` : "/admin/requests"}
              aria-current={on ? "true" : undefined}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
                on ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground",
              )}
            >
              {label} <span className={on ? "text-background/70" : "text-muted-foreground/80"}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-10 text-center text-sm text-muted-foreground shadow-card ring-1 ring-foreground/5">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ r, handledBy }) => (
            <li key={r.id} className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg font-bold">{r.communityName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {r.size} members{r.location ? ` · ${r.location}` : ""} · {formatDistanceToNowStrict(r.createdAt, { addSuffix: true })}
                  </p>
                </div>
                <RequestStatusSelect id={r.id} status={r.status} />
              </div>
              <p className="mt-3 text-sm whitespace-pre-line">{r.about}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <a href={`mailto:${r.email}?subject=${encodeURIComponent(`${r.communityName} on Lenigo`)}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                  <Mail className="size-4" /> {r.name} &lt;{r.email}&gt;
                </a>
                {r.link ? (
                  <a href={r.link} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground">
                    <ExternalLink className="size-4 shrink-0" /> <span className="truncate">{r.link.replace(/^https:\/\//, "")}</span>
                  </a>
                ) : null}
                <Link
                  href={`/admin/communities/new?name=${encodeURIComponent(r.communityName)}&owner=${encodeURIComponent(r.email)}`}
                  className="ml-auto inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-xs font-semibold text-background"
                >
                  Provision
                </Link>
              </div>
              {handledBy && r.handledAt ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Updated by {handledBy} {formatDistanceToNowStrict(r.handledAt, { addSuffix: true })}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
