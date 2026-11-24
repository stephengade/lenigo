import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowUpCircle, ExternalLink, Flame, LifeBuoy, MessagesSquare, Rocket } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/form-field";
import { UserAvatar } from "@/components/user-avatar";
import { CommentForm, DeleteCommentButton, Reactions, StandupForm } from "@/components/social/social";
import { pageSpaceRole } from "@/server/auth/guards";
import { getTodayStandup, listFeed } from "@/server/services/social";
import { getRoadmap } from "@/server/services/learning";
import { cn } from "@/lib/utils";

export const metadata = { title: "Feed" };

type Item = Awaited<ReturnType<typeof listFeed>>["items"][number];

export default async function FeedPage({ params, searchParams }: { params: Promise<{ community: string; space: string }>; searchParams: Promise<{ before?: string; help?: string }> }) {
  const { community: c, space: s } = await params;
  const sp = await searchParams;
  const access = await pageSpaceRole(c, s, () => true);
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? new Date(sp.before) : null;
  const helpOnly = sp.help === "1";
  const [feed, today, roadmap] = await Promise.all([listFeed(access, { before, helpOnly }), getTodayStandup(access), before ? null : getRoadmap(access)]);
  const myModules = (roadmap?.progress ?? []).flatMap((p) => p.levels.flatMap((l) => l.modules.filter((m) => !m.locked && !m.complete).map((m) => ({ id: m.id, title: m.title }))));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Feed" title="What everyone's building" description="Daily standups, shipped projects and level-ups from this space." />

      {!before ? (
        <Panel tone="sage">
          <Section title={today ? "You posted today" : "Today's standup"} description={today ? "Come back tomorrow to keep your streak." : "Thirty seconds: what you did, what's next, and anything in your way."}>
            {today ? (
              <div className="rounded-xl bg-surface p-4 text-sm">
                <p className="whitespace-pre-wrap">{today.didToday}</p>
                <p className="mt-2 text-muted-foreground">Next: {today.nextStep}</p>
              </div>
            ) : (
              <StandupForm c={c} s={s} modules={myModules} />
            )}
          </Section>
        </Panel>
      ) : null}

      <div className="flex gap-2 text-sm">
        <Link href="?" className={cn("rounded-full px-4 py-1.5 font-medium", !helpOnly ? "bg-ink text-ink-foreground" : "bg-surface text-muted-foreground")}>
          Everything
        </Link>
        <Link href="?help=1" className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium", helpOnly ? "bg-ink text-ink-foreground" : "bg-surface text-muted-foreground")}>
          <LifeBuoy className="size-3.5" /> Needs help
        </Link>
      </div>

      {feed.items.length === 0 ? (
        <EmptyState icon={<MessagesSquare />} title={helpOnly ? "Nobody is blocked" : "Quiet so far"}>
          {helpOnly ? "Standups that mention a blocker show up here." : "Post the first standup and get things moving."}
        </EmptyState>
      ) : (
        <ol className="grid gap-4">
          {feed.items.map((item) => (
            <FeedCard key={item.id} c={c} s={s} item={item} />
          ))}
        </ol>
      )}

      {feed.nextBefore ? (
        <div className="text-center">
          <Link href={`?${new URLSearchParams({ before: feed.nextBefore, ...(helpOnly ? { help: "1" } : {}) })}`} className="text-sm font-medium text-primary hover:underline">
            Older posts
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FeedCard({ c, s, item }: { c: string; s: string; item: Item }) {
  const name = item.actor.name ?? item.actor.email;
  const headline =
    item.kind === "STANDUP" ? (
      <>posted a standup{item.standup?.module ? ` on ${item.standup.module}` : ""}</>
    ) : item.kind === "PROJECT_APPROVED" ? (
      <>
        shipped <strong>{String(item.meta.module ?? "a project")}</strong>
      </>
    ) : item.kind === "LEVEL_PROMOTED" ? (
      <>
        moved up to <strong>{String(item.meta.level ?? "the next level")}</strong> in {String(item.meta.track ?? "their track")}
      </>
    ) : item.kind === "STREAK_MILESTONE" ? (
      <>
        hit a <strong>{String(item.meta.days ?? "")}-day</strong> streak
      </>
    ) : (
      <>passed a checkpoint</>
    );
  const Icon = item.kind === "PROJECT_APPROVED" ? Rocket : item.kind === "LEVEL_PROMOTED" ? ArrowUpCircle : item.kind === "STREAK_MILESTONE" ? Flame : null;

  return (
    <li className={cn("rounded-2xl bg-card p-5 shadow-card ring-1 ring-foreground/5", item.kind !== "STANDUP" && "bg-gradient-to-br from-card to-lilac-soft/40")}>
      <header className="flex items-start gap-3">
        <UserAvatar name={item.actor.name} email={item.actor.email} src={item.actor.avatarUrl} className="size-9" />
        <div className="min-w-0 flex-1 text-sm">
          <p>
            {item.actor.username ? (
              <Link href={`/u/${item.actor.username}`} className="font-semibold hover:underline">
                {name}
              </Link>
            ) : (
              <span className="font-semibold">{name}</span>
            )}{" "}
            <span className="text-muted-foreground">{headline}</span>
          </p>
          <p className="text-xs text-muted-foreground">{formatDistanceToNowStrict(item.createdAt, { addSuffix: true })}</p>
        </div>
        {Icon ? <Icon className="size-5 text-primary" /> : null}
        {item.helpNeeded ? <Badge variant="rose">Needs help</Badge> : null}
      </header>

      {item.standup ? (
        <div className="mt-3 grid gap-2 text-sm">
          <p className="whitespace-pre-wrap">{item.standup.standup.didToday}</p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Next:</span> {item.standup.standup.nextStep}
          </p>
          {item.standup.standup.blockers ? (
            <p className="rounded-xl bg-rose-soft/60 px-3 py-2 text-rose-foreground">
              <span className="font-medium">Blocked:</span> {item.standup.standup.blockers}
            </p>
          ) : null}
        </div>
      ) : null}

      {item.project ? (
        <p className="mt-3 flex gap-4 text-sm">
          <a href={item.project.repoUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary">
            Code <ExternalLink className="size-3.5" />
          </a>
          {item.project.liveUrl ? (
            <a href={item.project.liveUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary">
              Live <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </p>
      ) : null}

      <div className="mt-4">
        <Reactions c={c} s={s} itemId={item.id} reactions={item.reactions} />
      </div>

      {item.comments.length ? (
        <ul className="mt-4 grid gap-2 border-t border-border pt-3">
          {item.comments.map((cm) => (
            <li key={cm.id} className="flex gap-2.5 text-sm">
              <UserAvatar name={cm.author.name} email={cm.author.email} src={cm.author.avatarUrl} className="size-6" />
              <div className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">{cm.author.name ?? cm.author.email}</span>
                  <span className="text-muted-foreground">{formatDistanceToNowStrict(cm.createdAt, { addSuffix: true })}</span>
                  {cm.canDelete ? (
                    <span className="ml-auto">
                      <DeleteCommentButton c={c} s={s} commentId={cm.id} />
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">{cm.body}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3">
        <CommentForm c={c} s={s} itemId={item.id} />
      </div>
    </li>
  );
}
