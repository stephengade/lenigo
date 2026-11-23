import { ArrowRight, CalendarClock, CheckCircle2, Flame, GitPullRequestArrow, Map, Trophy } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/button-link";
import { getSessionUser } from "@/server/auth/session";

const LOOP = [
  { icon: Map, title: "Follow a roadmap", body: "Tracks split into Beginner, Intermediate and Advanced. Each module has curated videos, articles and a starter repo." },
  { icon: GitPullRequestArrow, title: "Ship proof of work", body: "Every module ends with a real build. Submit the repo and live link, and a mentor reviews it." },
  { icon: Flame, title: "Check in daily", body: "A 30-second standup: what you did, what's next, what's blocking you. Streaks keep you honest." },
  { icon: Trophy, title: "Climb together", body: "Points for every standup, quiz and approved project. Weekly, monthly and all-time leaderboards." },
  { icon: CalendarClock, title: "Get live reviews", body: "RSVP to calls or meetups, attach your project, and get it reviewed live by a mentor." },
];

const STRUCTURE = [
  { name: "GDG OAU", kind: "Community", spaces: ["Web Development", "Data Science", "Mobile", "Cloud"] },
  { name: "Claude Ambassadors", kind: "Community", spaces: ["General"] },
];

export default async function Home() {
  const user = await getSessionUser();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <ButtonLink href="/c">
              Open your communities <ArrowRight data-icon="inline-end" />
            </ButtonLink>
          ) : (
            <ButtonLink href="/login" variant="outline">
              Sign in
            </ButtonLink>
          )}
        </nav>
      </header>

      <main>
        <section className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-paper-dots [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="relative mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
              <span className="size-1.5 rounded-full bg-ember" /> Community learning, with accountability built in
            </p>
            <h1 className="mt-6 max-w-4xl text-5xl leading-[0.98] font-extrabold text-balance sm:text-7xl">
              Get out of tutorial hell. <span className="text-ember">Ship</span> with your community.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
              Lenigo gives tech communities structured roadmaps, required hands-on projects, daily public standups, mentor reviews and
              leaderboards, so learners keep shipping long after the first tutorial.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href={user ? "/c" : "/login"} size="lg" className="h-11 px-5">
                {user ? "Go to your communities" : "Sign in with your invite"} <ArrowRight data-icon="inline-end" />
              </ButtonLink>
            </div>
          </div>
        </section>

        <section className="border-y bg-card">
          <div className="mx-auto grid max-w-6xl gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            {LOOP.map(({ icon: Icon, title, body }, i) => (
              <div key={title} className="bg-card p-6">
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-ember" />
                  <span className="font-mono text-[11px] text-muted-foreground">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-base font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-bold sm:text-4xl">One home for every community, and every track inside it.</h2>
            <p className="mt-4 text-muted-foreground">
              A campus community like GDG OAU runs Web Development, Data Science and more as separate <em>spaces</em>, each with its own
              leads, mentors, curriculum and leaderboard. Community owners oversee all of them.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              {["Invite-only roles: Lead, Manager, Mentor, Member", "Members can join any open space in their community", "A full audit trail for platform operators"].map(
                (t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-moss" /> {t}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="space-y-4">
            {STRUCTURE.map((c) => (
              <div key={c.name} className="rounded-2xl border bg-card p-5 shadow-[0_1px_0_0_var(--border)]">
                <div className="flex items-center justify-between">
                  <div className="font-display text-lg font-bold">{c.name}</div>
                  <span className="font-mono text-[11px] text-muted-foreground uppercase">/c/{c.name.toLowerCase().replace(/\s+/g, "-")}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {c.spaces.map((s) => (
                    <span key={s} className="rounded-lg border bg-background px-3 py-1.5 text-sm">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Lenigo</span>
          <span className="font-mono">learn · build · ship</span>
        </div>
      </footer>
    </div>
  );
}
