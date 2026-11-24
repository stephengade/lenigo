"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CirclePlay,
  ClipboardCheck,
  Cloud,
  Code2,
  Flame,
  Lock,
  MessageSquareText,
  Palette,
  Rocket,
  Smartphone,
  Sparkles,
  Star,
  Trophy,
  UserRound,
  UsersRound,
  BrainCircuit,
  Clock,
  FileVideo,
  Link2,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * The public home page. Everything here is static marketing; the only server input is
 * whether the visitor is signed in, which swaps the calls to action.
 */

/** Uppercase display headings: Rubik Black. */
const H = "font-display font-black uppercase leading-[0.95] tracking-tight";

/* ── Shared bits ──────────────────────────────────────────────────────────── */

const burstPoints = Array.from({ length: 24 }, (_, i) => {
  const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 === 0 ? 50 : 42;
  return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
}).join(" ");

/** The starburst from the design system, used as stickers. */
function Burst({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center", className)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <polygon points={burstPoints} className="fill-current" strokeLinejoin="round" />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("inline-flex items-center gap-2 text-sm font-semibold text-primary", className)}>
      <span className="size-1.5 rounded-full bg-primary" /> {children}
    </p>
  );
}

const SignedIn = createContext(false);

/** Where "start" buttons go: the app if signed in, otherwise sign-in (Lenigo is invite-only). */
function useStart() {
  const signedIn = useContext(SignedIn);
  return signedIn ? { href: "/c", label: "Go to your communities" } : { href: "/login", label: "Join with your invite" };
}

/** Community leads don't self-serve yet: they send a request (/bring) and the Lenigo team provisions it. */
const BRING_HREF = "/bring";

function PrimaryCta({ className }: { className?: string }) {
  const start = useStart();
  return (
    <Link
      href={start.href}
      className={cn(
        "inline-flex h-13 items-center gap-2 rounded-full bg-sun px-7 text-[15px] font-semibold text-ink shadow-[0_4px_0_0_var(--sun-foreground)] outline-none transition-transform hover:-translate-y-px active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--sun-foreground)] focus-visible:ring-4 focus-visible:ring-sun/50",
        className,
      )}
    >
      {start.label} <ArrowRight className="size-4" />
    </Link>
  );
}

/* ── Content (generic: any community, any space) ──────────────────────────── */

const SPACES = [
  {
    id: "web",
    name: "Web Development",
    icon: Code2,
    tone: "bg-lilac-soft text-lilac-foreground",
    dot: "bg-lilac",
    track: "Frontend · Foundations",
    tracks: ["Frontend", "Backend", "Fullstack"],
    modules: ["Semantic HTML", "The Box Model", "Flexbox Layouts", "CSS Grid"],
    url: "gdg-oau/web-development",
  },
  {
    id: "data",
    name: "Data Science",
    icon: BarChart3,
    tone: "bg-sun-soft text-sun-foreground",
    dot: "bg-sun",
    track: "Data Analysis · Foundations",
    tracks: ["Data Analysis", "Machine Learning"],
    modules: ["Spreadsheets to SQL", "Python for Data", "Cleaning with Pandas", "Telling Stories with Charts"],
    url: "gdg-oau/data-science",
  },
  {
    id: "mobile",
    name: "Mobile",
    icon: Smartphone,
    tone: "bg-mint-soft text-mint-foreground",
    dot: "bg-mint",
    track: "Android · Foundations",
    tracks: ["Android", "Flutter"],
    modules: ["Kotlin Basics", "Layouts & Views", "State & Lifecycle", "Talking to APIs"],
    url: "gdg-oau/mobile",
  },
  {
    id: "design",
    name: "Product Design",
    icon: Palette,
    tone: "bg-rose-soft text-rose-foreground",
    dot: "bg-rose",
    track: "UI/UX · Foundations",
    tracks: ["UI/UX", "Design Systems"],
    modules: ["Design Principles", "Figma Basics", "Wireframes", "Clickable Prototypes"],
    url: "design-circle/product-design",
  },
  {
    id: "cloud",
    name: "Cloud",
    icon: Cloud,
    tone: "bg-secondary text-secondary-foreground",
    dot: "bg-primary",
    track: "Cloud · Foundations",
    tracks: ["Cloud Engineering", "DevOps"],
    modules: ["Linux & the Shell", "Networking 101", "Your First Deploy", "Containers"],
    url: "gdg-oau/cloud",
  },
  {
    id: "ai",
    name: "AI & ML",
    icon: BrainCircuit,
    tone: "bg-sage-soft text-sage-foreground",
    dot: "bg-sage",
    track: "Applied AI · Foundations",
    tracks: ["Applied AI", "ML Engineering"],
    modules: ["How Models Learn", "Prompting Well", "Building with APIs", "Evaluating Outputs"],
    url: "ai-builders/applied-ai",
  },
] as const;
type SpaceId = (typeof SPACES)[number]["id"];

const MARQUEE = ["Web Development", "Data Science", "Mobile", "Product Design", "Cloud", "AI & ML", "Cybersecurity", "DevOps", "Technical Writing", "Game Dev"];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <SignedIn.Provider value={signedIn}>
      <div id="top" className="min-h-dvh overflow-x-clip bg-background text-foreground">
        <Hero />
        <Marquee />
        <Spaces />
        <HowItWorks />
        <Features />
        <Audiences />
        <Faq />
        <ClosingCta />
        <Footer />
      </div>
    </SignedIn.Provider>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

const NAV = [
  ["Home", "#top"],
  ["How it works", "#how-it-works"],
  ["Features", "#features"],
  ["FAQ", "#faq"],
] as const;

function Hero() {
  const signedIn = useContext(SignedIn);
  const start = useStart();
  const [active, setActive] = useState("Home");
  const [space, setSpace] = useState<SpaceId>("web");
  return (
    <section className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1000px] bg-sun-soft/70 [mask-image:linear-gradient(to_bottom,black_60%,transparent)] dark:bg-sun-soft/30" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[880px] bg-paper-dots opacity-60 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-8">
        {/* Floating nav */}
        <header className="sticky top-3 z-40 pt-4">
          <div className="flex items-center gap-3 rounded-full bg-card/85 py-2 pr-2 pl-4 shadow-card backdrop-blur">
            <a href="#top" className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
              <LogoMark className="size-8" />
              <span className={cn(H, "text-xl text-ink")}>Lenigo</span>
            </a>
            <nav className="mx-auto hidden items-center gap-1 md:flex">
              {NAV.map(([n, href]) => (
                <a
                  key={n}
                  href={href}
                  onClick={() => setActive(n)}
                  aria-current={active === n ? "true" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/25",
                    active === n ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {n}
                </a>
              ))}
            </nav>
            {!signedIn && (
              <Link href="/login" className="ml-auto hidden h-10 items-center px-3 text-sm font-semibold text-foreground sm:inline-flex md:ml-0">
                Sign in
              </Link>
            )}
            <Link
              href={start.href}
              className={cn(
                "ml-auto inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-button",
                !signedIn && "sm:ml-0",
              )}
            >
              {signedIn ? "Open Lenigo" : "Get started"} <ArrowRight className="size-4" />
            </Link>
          </div>
        </header>

        {/* Headline */}
        <div className="relative pt-16 pb-12 text-center sm:pt-20">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-semibold shadow-xs">
            <Burst className="size-4 text-ember" /> For tech communities, clubs and bootcamps
          </p>
          <h1 className={cn(H, "mx-auto mt-6 max-w-5xl text-[clamp(2.5rem,7.2vw,5.75rem)] text-ink")}>
            Learn it. <br className="sm:hidden" />
            Build it.
            <br />
            <span className="relative inline-block -rotate-2 rounded-2xl bg-primary px-4 pt-1 pb-2 text-primary-foreground shadow-pop sm:rounded-3xl sm:px-6">
              Ship it.
              <Burst className="absolute -top-3 -right-5 size-10 rotate-12 text-sun sm:-top-8 sm:-right-10 sm:size-20">
                <Sparkles className="size-4 text-ink sm:size-8" strokeWidth={2.25} />
              </Burst>
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg text-pretty text-muted-foreground sm:text-xl">
            Lenigo turns your community into a place where people actually finish: handpicked roadmaps, mentor-reviewed projects, daily
            standups and a leaderboard that rewards real work.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta />
            <a href={BRING_HREF} className="inline-flex h-13 items-center gap-2 rounded-full bg-card px-6 text-[15px] font-semibold shadow-card">
              Bring your community
            </a>
          </div>
        </div>

        {/* Stage: browser window + floating achievement stickers */}
        <div className="relative mx-auto max-w-5xl pb-24">
          <Sticker className="-top-7 -left-4 -rotate-6 bg-mint text-white lg:-left-16" icon={<Check strokeWidth={3} />}>
            <b>Capstone approved</b>
            <span className="opacity-80">Scored 92/100</span>
          </Sticker>
          <Sticker className="top-36 -right-4 rotate-6 bg-lilac text-lilac-foreground lg:-right-20" icon={<Rocket />}>
            <b>Promoted</b>
            <span className="opacity-80">to Intermediate</span>
          </Sticker>
          <Sticker className="bottom-14 -left-4 rotate-3 bg-ink text-ink-foreground lg:-left-20" icon={<Flame className="text-sun" />}>
            <b>12-day streak</b>
            <span className="opacity-70">Standup posted</span>
          </Sticker>
          <BrowserFrame space={space} setSpace={setSpace} />
        </div>
      </div>
    </section>
  );
}

function Sticker({ className, icon, children }: { className?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={cn("absolute z-10 hidden items-center gap-3 rounded-2xl border-[3px] border-card py-2.5 pr-4 pl-2.5 text-sm shadow-pop md:flex", className)}>
      <span className="grid size-9 place-items-center rounded-xl bg-white/20 [&_svg]:size-4.5">{icon}</span>
      <span className="grid leading-tight">{children}</span>
    </div>
  );
}

/** A miniature of the real product. Tabs switch between spaces: Lenigo isn't one subject. */
function BrowserFrame({ space, setSpace }: { space: SpaceId; setSpace: (s: SpaceId) => void }) {
  const s = SPACES.find((x) => x.id === space)!;
  return (
    <div className="rounded-[1.75rem] bg-ink p-2 shadow-pop sm:p-2.5">
      <div className="flex items-center gap-3 px-3 py-2">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-rose" />
          <span className="size-2.5 rounded-full bg-sun" />
          <span className="size-2.5 rounded-full bg-mint" />
        </span>
        <span className="mx-auto truncate rounded-full bg-ink-foreground/10 px-4 py-1 font-mono text-[11px] text-ink-foreground/70">
          lenigo.app/c/{s.url}
        </span>
        <span className="w-10" />
      </div>
      <div className="rounded-[1.25rem] bg-surface">
        {/* space tabs */}
        <div className="flex gap-1.5 overflow-x-auto border-b border-border px-4 pt-4 pb-3 [scrollbar-width:none]" role="tablist" aria-label="Spaces">
          {SPACES.slice(0, 4).map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={x.id === space}
              onClick={() => setSpace(x.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-ring/25",
                x.id === space ? "bg-ink text-ink-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <x.icon className="size-3.5" /> {x.name}
            </button>
          ))}
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-[1.35fr_1fr] sm:p-6">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-muted-foreground">{s.track}</p>
                <p className={cn(H, "mt-1 text-2xl")}>Your roadmap</p>
              </div>
              <span className="shrink-0 rounded-full bg-sun-soft px-2.5 py-1 text-xs font-semibold text-sun-foreground">2 of 6</span>
            </div>
            <ul className="mt-4 grid gap-2">
              {s.modules.map((m, i) => {
                const st = i < 2 ? "done" : i === 2 ? "active" : "locked";
                return (
                  <li key={m} className={cn("flex items-center gap-3 rounded-xl border p-3", st === "active" ? "border-primary bg-secondary" : "border-border")}>
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg",
                        st === "done" ? "bg-mint text-white" : st === "active" ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground",
                      )}
                    >
                      {st === "done" ? <Check className="size-4" strokeWidth={3} /> : st === "active" ? <CirclePlay className="size-4" /> : <Lock className="size-4" />}
                    </span>
                    <span className={cn("truncate text-sm font-medium", st === "locked" && "text-muted-foreground")}>{m}</span>
                    {st === "active" && <span className="ml-auto hidden text-xs font-medium text-primary sm:inline">Resume</span>}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="grid content-start gap-4">
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <div className="flex items-center justify-between">
                <p className={cn(H, "text-xl")}>Leaderboard</p>
                <Trophy className="size-4 text-sun-foreground" />
              </div>
              <ol className="mt-3 grid gap-2.5 text-sm">
                {[
                  ["Ada O.", "bg-lilac"],
                  ["Tunde A.", "bg-sun"],
                  ["Zainab K.", "bg-rose"],
                ].map(([n, c], i) => (
                  <li key={n} className="flex items-center gap-3">
                    <span className="w-4 text-xs font-bold text-muted-foreground tabular">{i + 1}</span>
                    <span className={cn("size-7 rounded-full", c)} />
                    <span className="font-medium">{n}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Updates at 7 AM &amp; 7 PM</p>
            </div>
            <div className="rounded-2xl bg-card p-4 shadow-card">
              <p className="text-xs font-semibold text-muted-foreground">Today&rsquo;s standup</p>
              <p className="mt-1.5 text-sm">Finished module 2, starting {s.modules[2]}. No blockers.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Marquee ──────────────────────────────────────────────────────────────── */

function Marquee() {
  const row = [...MARQUEE, ...MARQUEE];
  return (
    <div className="relative -my-4 -rotate-2 bg-ink py-4 text-ink-foreground" aria-label="Spaces communities run on Lenigo">
      <div className="flex w-max animate-[lenigo-marquee_40s_linear_infinite] items-center gap-8 motion-reduce:animate-none">
        {row.map((t, i) => (
          <span key={i} className="flex items-center gap-8" aria-hidden={i >= MARQUEE.length}>
            <span className={cn(H, "text-2xl whitespace-nowrap sm:text-3xl")}>{t}</span>
            <Burst className="size-6 text-sun" />
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Spaces: community → spaces → tracks ──────────────────────────────────── */

function Spaces() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-32 pb-24 sm:px-8">
      <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Eyebrow>One home for every subject</Eyebrow>
          <h2 className={cn(H, "mt-3 text-[clamp(2.25rem,5vw,3.75rem)] text-ink")}>
            Your community.
            <br />
            <span className="text-primary">Every</span> space.
          </h2>
        </div>
        <p className="text-lg text-muted-foreground">
          Split your community into spaces, one per subject. Each space runs its own tracks, mentors, standups and leaderboard, and
          names its levels however it likes.
        </p>
      </div>

      <div className="mt-12 rounded-[2rem] bg-surface p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-xs">
          <span className="grid size-9 place-items-center rounded-xl bg-ink text-ink-foreground">
            <UsersRound className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Your community</p>
            <p className="text-xs text-muted-foreground">One place for members, mentors and leads</p>
          </div>
          <span className="ml-auto hidden text-xs font-medium text-muted-foreground sm:block">6 spaces</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SPACES.map((s) => (
            <div key={s.id} className="group rounded-2xl bg-card p-5 shadow-card transition-transform hover:-translate-y-0.5">
              <div className="flex items-center justify-between">
                <span className={cn("grid size-11 place-items-center rounded-2xl", s.tone)}>
                  <s.icon className="size-5" />
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <h3 className={cn(H, "mt-5 text-xl")}>{s.name}</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {s.tracks.map((t) => (
                  <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── How it works: a staircase, like the logo ─────────────────────────────── */

const STEPS = [
  { Icon: UserRound, title: "Join & pick a track", body: "Answer four quick questions. Start at the beginning, or take a placement test if you already know the basics." },
  { Icon: FileVideo, title: "Learn from the best", body: "Handpicked videos and articles from people who teach it well. Watch time is tracked; skipping ahead doesn't count." },
  { Icon: ClipboardCheck, title: "Prove it", body: "Pass checkpoint quizzes, then ship a capstone project. A mentor reviews it and gives it a score." },
  { Icon: Rocket, title: "Level up", body: "When your work is ready, a mentor promotes you. Levels are earned, never picked." },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-20 bg-sage/60 py-24 dark:bg-sage-soft">
      <div className="mx-auto max-w-6xl px-4 sm:px-8">
        <div className="text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className={cn(H, "mx-auto mt-3 max-w-3xl text-[clamp(2.25rem,5vw,3.75rem)] text-ink")}>
            One step at a time.
            <br />
            <span className="text-primary">No skipping.</span>
          </h2>
        </div>
        <ol className="mt-16 grid gap-4 lg:grid-cols-4 lg:items-end">
          {STEPS.map(({ Icon, title, body }, i) => (
            <li key={title} className="flex flex-col">
              <div className="rounded-3xl bg-card p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-secondary text-secondary-foreground">
                    <Icon className="size-5" />
                  </span>
                  <span className={cn(H, "text-4xl text-primary/25")}>0{i + 1}</span>
                </div>
                <h3 className={cn(H, "mt-5 text-xl")}>{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
              {/* the step itself: rises left to right on desktop */}
              <div className={cn("mt-3 hidden rounded-2xl bg-ink lg:block", ["h-6", "h-16", "h-28", "h-40"][i])} aria-hidden />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ── Features: bento with tiny live mocks ─────────────────────────────────── */

function Tile({ className, title, body, children }: { className?: string; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col rounded-3xl bg-card p-6 shadow-card", className)}>
      <div className="flex-1">{children}</div>
      <h3 className={cn(H, "mt-6 text-xl")}>{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Features() {
  const [answer, setAnswer] = useState<number | null>(null);
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-8">
      <div className="grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <Eyebrow>Built for follow-through</Eyebrow>
          <h2 className={cn(H, "mt-3 text-[clamp(2.25rem,5vw,3.75rem)] text-ink")}>
            No shortcuts.
            <br />
            Just <span className="text-primary">progress.</span>
          </h2>
        </div>
        <p className="text-lg text-muted-foreground">Everything people need to keep going, and nothing that lets them fake it.</p>
      </div>

      <div className="mt-12 grid gap-4 md:grid-cols-6">
        <Tile className="md:col-span-4" title="Curated, not uploaded" body="Lessons are handpicked from YouTube, Google Drive or anywhere on the web. YouTube plays right inside Lenigo and watch time is tracked.">
          <div className="rounded-2xl bg-surface p-4">
            <div className="flex flex-wrap gap-2">
              {[
                [CirclePlay, "YouTube · plays in-app"],
                [FileVideo, "Google Drive"],
                [Link2, "Any https link"],
              ].map(([I, t]) => {
                const Icon = I as typeof CirclePlay;
                return (
                  <span key={t as string} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-semibold shadow-xs">
                    <Icon className="size-3.5 text-primary" /> {t as string}
                  </span>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-card p-3 shadow-xs">
              <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-lg bg-ink text-ink-foreground">
                <CirclePlay className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">Lesson 3 · 14 min</p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
                  <div className="h-full w-[62%] rounded-full bg-primary" />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">62% watched</p>
              </div>
            </div>
          </div>
        </Tile>

        <Tile className="md:col-span-2" title="Mentor-scored" body="Every module ends in a real project. Mentors review it, score it and leave feedback.">
          <div className="grid place-items-center rounded-2xl bg-lilac-soft py-6">
            <div className="relative grid size-28 place-items-center">
              <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" className="stroke-card" />
                <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeDasharray="89.8 97.4" className="stroke-lilac-foreground" />
              </svg>
              <span className={cn(H, "text-3xl text-lilac-foreground")}>92</span>
            </div>
          </div>
        </Tile>

        <Tile className="md:col-span-2" title="Checkpoints" body="Short quizzes between lessons, graded on the server. Pass them to move on.">
          <div className="rounded-2xl bg-sun-soft p-4">
            <p className="text-sm font-semibold text-sun-foreground">Which chart best shows change over time?</p>
            <div className="mt-3 grid gap-1.5">
              {["A line chart", "A pie chart", "A word cloud"].map((o, i) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setAnswer(i)}
                  className={cn(
                    "rounded-xl border bg-card px-3 py-2 text-left text-xs font-medium transition-colors",
                    answer === i ? (i === 0 ? "border-mint text-mint-foreground" : "border-rose text-rose-foreground") : "border-transparent",
                  )}
                >
                  {o}
                  {answer === i && <span className="float-right">{i === 0 ? "Correct" : "Try again"}</span>}
                </button>
              ))}
            </div>
          </div>
        </Tile>

        <Tile className="md:col-span-2" title="Daily standups" body="Thirty seconds: what you did, what's next, what's blocking you. Streaks keep people honest.">
          <div className="grid gap-2 rounded-2xl bg-mint-soft p-4">
            {[
              ["Tunde A.", "Deployed my first container"],
              ["Zainab K.", "Stuck on joins, will ask in review"],
            ].map(([n, t]) => (
              <div key={n} className="flex items-start gap-2.5 rounded-xl bg-card p-2.5 shadow-xs">
                <span className="size-7 shrink-0 rounded-full bg-mint" />
                <div className="min-w-0 text-xs">
                  <p className="font-semibold">{n}</p>
                  <p className="truncate text-muted-foreground">{t}</p>
                </div>
              </div>
            ))}
          </div>
        </Tile>

        <Tile className="md:col-span-2" title="Fair leaderboards" body="Updated for everyone at 7 AM and 7 PM. You see what earns points, not the exact values, so nobody can game it.">
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-rose-soft py-8">
            {["7:00 AM", "7:00 PM"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-sm font-bold shadow-xs">
                <Clock className="size-4 text-rose-foreground" /> {t}
              </span>
            ))}
          </div>
        </Tile>

        <div className="grid items-center gap-6 rounded-3xl bg-ink p-6 text-ink-foreground shadow-card md:col-span-6 md:grid-cols-[1fr_1.15fr] md:p-8">
          <div>
            <h3 className={cn(H, "text-2xl sm:text-3xl")}>
              Skip ahead, <span className="text-sun">the honest way</span>
            </h3>
            <p className="mt-3 max-w-md text-sm opacity-75">
              Already know the basics? Take an optional placement test. A mentor makes the final call, and modules you skip don&rsquo;t
              earn points.
            </p>
          </div>
          <ol className="grid gap-2 sm:grid-cols-3">
            {[
              ["Timed quiz", "Random questions, server-graded"],
              ["Practical task", "Build something small"],
              ["Mentor review", "They decide if you move up"],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-ink-foreground/8 p-4">
                <span className="grid size-7 place-items-center rounded-full bg-sun text-xs font-bold text-ink">{i + 1}</span>
                <p className="mt-3 text-sm font-semibold">{t}</p>
                <p className="mt-1 text-xs opacity-70">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ── For learners / for leads ─────────────────────────────────────────────── */

const AUDIENCES = [
  {
    tag: "For learners",
    title: "Finish what you start",
    tone: "bg-lilac",
    cta: "start",
    points: [
      "A clear roadmap, so you always know what's next",
      "Real projects in your portfolio, reviewed by mentors",
      "A community that notices when you show up, and when you don't",
      "Levels you earn, so they actually mean something",
    ],
  },
  {
    tag: "For community leads",
    title: "Run it without the spreadsheets",
    tone: "bg-sun",
    cta: "bring",
    points: [
      "Spaces, tracks and roles for every subject you run",
      "Invite people by email or a shareable link",
      "See who's active, who's stuck and who's ready to move up",
      "Every action is logged, so nothing happens quietly",
    ],
  },
];

function Audiences() {
  const start = useStart();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-8">
      <div className="grid gap-4 lg:grid-cols-2">
        {AUDIENCES.map((a) => (
          <div key={a.tag} className={cn("rounded-[2rem] p-3 sm:p-4", a.tone)}>
            <div className="flex h-full flex-col rounded-3xl bg-card p-6 shadow-card sm:p-8">
              <p className="text-sm font-semibold text-muted-foreground">{a.tag}</p>
              <h3 className={cn(H, "mt-2 text-3xl text-ink sm:text-4xl")}>{a.title}</h3>
              <ul className="mt-6 grid flex-1 gap-3">
                {a.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15px]">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-ink text-ink-foreground">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
              {a.cta === "start" ? (
                <Link href={start.href} className="mt-8 inline-flex items-center gap-2 self-start font-semibold text-primary">
                  {start.label} <ArrowRight className="size-4" />
                </Link>
              ) : (
                <a href={BRING_HREF} className="mt-8 inline-flex items-center gap-2 self-start font-semibold text-primary">
                  Bring your community <ArrowRight className="size-4" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────────────── */

const FAQ: [string, string, string?][] = [
  ["Who can join?", "Lenigo is invite-only. A community lead or mentor sends you an email invite or a shareable link, and you join their space."],
  ["Is it only for web development?", "No. A community can run any number of spaces (data, mobile, design, cloud, AI, writing) and each space defines its own tracks and level names."],
  ["Do you host the videos?", "No. Mentors handpick the best lessons from YouTube, Google Drive and the web. YouTube videos play inside Lenigo so progress can be tracked."],
  ["Can I choose my level?", "You start at the beginning of your track. If you already know the basics, take the optional placement test. A mentor promotes you; you can't promote yourself."],
  ["How do points work?", "You can see everything that earns points: lessons, checkpoints, projects, standups, review sessions and streaks. The exact values stay private so the board rewards real work."],
  ["How do I bring my community?", "Talk to the Lenigo team and we'll set up your community. You'll get an owner account to create spaces and invite your leads, mentors and members.", "bring-your-community"],
];

function Faq() {
  // Links like #bring-your-community jump to a question: open it so the answer shows.
  useEffect(() => {
    const openTarget = () => {
      const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (el instanceof HTMLDetailsElement) el.open = true;
    };
    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);
  return (
    <section id="faq" className="mx-auto grid max-w-6xl scroll-mt-24 gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <Eyebrow>FAQ</Eyebrow>
        <h2 className={cn(H, "mt-3 text-[clamp(2.25rem,5vw,3.75rem)] text-ink")}>
          Good <span className="text-primary">questions</span>
        </h2>
        <p className="mt-4 max-w-sm text-muted-foreground">Still curious? Ask your community lead.</p>
        <MessageSquareText className="mt-8 hidden size-24 -rotate-6 text-primary/15 lg:block" strokeWidth={1.25} />
      </div>
      <div className="grid gap-2">
        {FAQ.map(([q, a, id], i) => (
          <details key={q} id={id} className="group scroll-mt-24 rounded-2xl bg-surface px-5 open:bg-card open:shadow-card target:bg-card target:shadow-card" open={i === 0 || undefined}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              {q}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="pb-5 text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ── Closing CTA + footer ─────────────────────────────────────────────────── */

function ClosingCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
      <div className="relative overflow-hidden rounded-[2.5rem] bg-primary px-6 py-20 text-center text-primary-foreground sm:px-12">
        <div className="pointer-events-none absolute inset-0 bg-paper-dots opacity-20" />
        <Burst className="absolute -top-10 -left-10 size-40 text-sun/90" />
        <Burst className="absolute -right-8 -bottom-12 size-36 text-lilac" />
        <Star className="absolute top-10 right-16 size-7 rotate-12 text-sun" fill="currentColor" />
        <Sparkles className="absolute bottom-12 left-16 size-8 text-white/80" />
        <h2 className={cn(H, "relative mx-auto max-w-3xl text-[clamp(2.5rem,6vw,4.75rem)]")}>
          Your community,
          <br />
          levelled up.
        </h2>
        <p className="relative mx-auto mt-5 max-w-md text-lg opacity-85">Start learning with your invite, or bring your whole community to Lenigo.</p>
        <div className="relative mt-9 flex flex-wrap justify-center gap-3">
          <PrimaryCta />
          <a href={BRING_HREF} className="inline-flex h-13 items-center rounded-full border-2 border-primary-foreground/40 px-6 font-semibold">
            Bring your community
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const start = useStart();
  const cols: [string, [string, string][]][] = [
    ["Product", [["How it works", "#how-it-works"], ["Features", "#features"], ["FAQ", "#faq"]]],
    ["Communities", [[start.label, start.href], ["Bring your community", BRING_HREF]]],
  ];
  return (
    <footer className="mx-auto max-w-6xl px-4 pt-8 sm:px-8">
      <div className="grid gap-10 border-t border-border pt-12 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <LogoMark className="size-8" />
            <span className={cn(H, "text-xl")}>Lenigo</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">A learning and accountability home for tech communities.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <p className="text-sm font-semibold">{title}</p>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
              {links.map(([l, href]) => (
                <li key={l}>
                  {href.startsWith("/") ? (
                    <Link href={href} className="hover:text-foreground">{l}</Link>
                  ) : (
                    <a href={href} className="hover:text-foreground">{l}</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {/* Oversized wordmark, cropped by the page edge */}
      <p aria-hidden className={cn(H, "mt-16 -mb-[0.18em] text-center text-[clamp(5rem,22vw,17rem)] text-surface select-none")}>
        Lenigo
      </p>
      <p className="pb-6 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} Lenigo</p>
    </footer>
  );
}
