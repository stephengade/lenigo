import Link from "next/link";
import { Check, Clock, Trophy } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/page-header";
import { Section } from "@/components/form-field";
import { UserAvatar } from "@/components/user-avatar";
import { pageSpaceRole } from "@/server/auth/guards";
import { getLeaderboard } from "@/server/services/social";
import { nextLeaderboardUpdate } from "@/lib/leaderboard";
import { POINT_SOURCES } from "@/lib/points";
import { cn } from "@/lib/utils";

export const metadata = { title: "Leaderboard" };

const PODIUM = ["bg-sun text-sun-foreground", "bg-lilac text-lilac-foreground", "bg-rose-soft text-rose-foreground"];

export default async function LeaderboardPage({ params }: { params: Promise<{ community: string; space: string }> }) {
  const { community: c, space: s } = await params;
  const access = await pageSpaceRole(c, s, () => true);
  const board = await getLeaderboard(access.space.id);
  const next = nextLeaderboardUpdate();
  const me = board.rows.find((r) => r.user.id === access.user.id);
  // Times in the community's own timezone (the server may run in another one).
  const when = (d: Date, withDay = false) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: access.community.timezone, hour: "2-digit", minute: "2-digit", ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}) }).format(d);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Leaderboard"
        title="Who's shipping"
        description="Updated twice a day at the same time for everyone, so nobody can watch points tick up action by action."
        actions={
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm text-muted-foreground">
            <Clock className="size-4" /> Next update {when(next, true)}
          </span>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        {board.rows.length === 0 ? (
          <EmptyState icon={<Trophy />} title="The first board isn't out yet">
            It&rsquo;s published at the next update. Learners in this space are ranked; the team isn&rsquo;t.
          </EmptyState>
        ) : (
          <Panel>
            <div className="rounded-2xl bg-card shadow-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-3 text-xs text-muted-foreground">
                <span>Published {board.takenAt ? when(board.takenAt, true) : ""}</span>
                {me ? (
                  <span className="font-medium text-foreground">
                    You&rsquo;re #{me.rank} with {me.points.toLocaleString()} points
                  </span>
                ) : null}
              </div>
              <ol className="divide-y divide-border">
                {board.rows.map((r) => (
                  <li key={r.user.id} className={cn("flex items-center gap-3 px-5 py-3", r.user.id === access.user.id && "bg-secondary/60")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl font-display text-sm font-black", PODIUM[r.rank - 1] ?? "bg-surface text-muted-foreground")}>
                      {r.rank}
                    </span>
                    <UserAvatar name={r.user.name} email={r.user.email} src={r.user.avatarUrl} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.user.username ? (
                        <Link href={`/u/${r.user.username}`} className="hover:underline">
                          {r.user.name ?? r.user.username}
                        </Link>
                      ) : (
                        (r.user.name ?? "Learner")
                      )}
                    </span>
                    <span className="font-display text-lg font-bold tabular">{r.points.toLocaleString()}</span>
                  </li>
                ))}
              </ol>
            </div>
          </Panel>
        )}

        <Panel tone="sun">
          <Section title="What earns points">
            <ul className="grid gap-2">
              {POINT_SOURCES.map((p) => (
                <li key={p.key} className="flex items-start gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-mint" strokeWidth={3} />
                  <span>
                    <span className="font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-xl bg-surface p-3 text-xs text-muted-foreground">Exact values aren&rsquo;t published, so the board rewards real work, not gaming it.</p>
          </Section>
        </Panel>
      </div>
    </div>
  );
}
