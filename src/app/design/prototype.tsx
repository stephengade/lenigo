"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { cva, type VariantProps } from "class-variance-authority";
import {
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CirclePlay,
  ClipboardCheck,
  ExternalLink,
  Info,
  Presentation,
  Rocket,
  Clock,
  Flame,
  GitBranch,
  Lock,
  Timer,
  Moon,
  Search,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { MODULE_REQUIREMENTS } from "@/lib/permissions";
import { INTAKE_QUESTIONS, PLACEMENT } from "@/lib/placement";
import { POINT_SOURCES } from "@/lib/points";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
 * Prototype primitives. If approved, these replace components/ui/button.tsx,
 * input.tsx and card.tsx (same names, same API, new look).
 * ───────────────────────────────────────────────────────────────────────── */

const pill = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-[background-color,box-shadow,transform] outline-none select-none focus-visible:ring-4 focus-visible:ring-ring/25 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-button hover:bg-primary/90",
        ink: "bg-ink text-ink-foreground shadow-button hover:bg-ink/85",
        secondary: "border border-primary/35 bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline: "border border-border bg-card text-foreground shadow-xs hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "bg-destructive/10 text-destructive hover:bg-destructive/15",
      },
      size: {
        sm: "h-8 px-3.5 text-[13px]",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

function Btn({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof pill>) {
  return <button type="button" className={cn(pill({ variant, size }), className)} {...props} />;
}

const tones = {
  lilac: "fill-lilac text-lilac-foreground",
  sun: "fill-sun text-sun-foreground",
  rose: "fill-rose text-rose-foreground",
  mint: "fill-mint-soft text-mint-foreground",
  sage: "fill-sage text-sage-foreground",
} as const;
type Tone = keyof typeof tones;

/** Starburst badge, the signature shape behind icons and avatars. */
function Burst({ tone, size = 64, children }: { tone: Tone; size?: number; children: React.ReactNode }) {
  const points = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 50 : 43;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <span className={cn("relative grid shrink-0 place-items-center", tones[tone])} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <polygon points={points} strokeLinejoin="round" />
      </svg>
      <span className="relative [&_svg]:size-[42%]" style={{ width: size, height: size, display: "grid", placeItems: "center" }}>
        {children}
      </span>
    </span>
  );
}

const chip = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3.5", {
  variants: {
    tone: {
      mint: "bg-mint-soft text-mint-foreground",
      sun: "bg-sun-soft text-sun-foreground",
      lilac: "bg-lilac-soft text-lilac-foreground",
      rose: "bg-rose-soft text-rose-foreground",
      neutral: "bg-surface text-muted-foreground",
      ink: "bg-ink text-ink-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});

function Chip({ tone, className, ...props }: React.ComponentProps<"span"> & VariantProps<typeof chip>) {
  return <span className={cn(chip({ tone }), className)} {...props} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-input bg-card px-4 text-sm shadow-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15";

/* ─────────────────────────────────────────────────────────────────────── */

const MODULES = [
  { title: "Semantic HTML", date: "Week 1", mins: 45, status: "done" },
  { title: "The Box Model", date: "Week 1", mins: 60, status: "done" },
  { title: "Flexbox Layouts", date: "Week 2", mins: 75, status: "active" },
  { title: "CSS Grid", date: "Week 2", mins: 60, status: "locked" },
  { title: "Responsive Design", date: "Week 3", mins: 90, status: "locked" },
  { title: "Ship a Landing Page", date: "Week 3", mins: 120, status: "locked" },
] as const;

const ROLES = [
  { id: "MENTOR", label: "Mentor", hint: "Reviews submissions", tone: "sun" as Tone, icon: UserRound },
  { id: "MEMBER", label: "Member", hint: "Follows the roadmap", tone: "lilac" as Tone, icon: UsersRound },
];

export function Prototype() {
  const { resolvedTheme, setTheme } = useTheme();
  const [nav, setNav] = useState("Roadmap");
  const [filterOpen, setFilterOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [role, setRole] = useState("MENTOR");

  return (
    <div className="min-h-dvh bg-background pb-24">
      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-8">
        {/* ── Top bar ─────────────────────────────────────────────── */}
        <header className="flex items-center gap-3 rounded-full bg-sage px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 pl-1">
            <LogoMark className="size-8" />
            <span className="font-display text-xl font-bold tracking-tight text-sage-foreground">lenigo</span>
          </div>
          <nav className="ml-auto hidden items-center gap-1 sm:flex">
            {["Roadmap", "Standups", "Leaderboard", "Team"].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNav(n)}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ink/20",
                  nav === n ? "bg-ink text-ink-foreground" : "text-sage-foreground/80 hover:bg-white/40 hover:text-sage-foreground",
                )}
              >
                {n}
              </button>
            ))}
          </nav>
          <Btn
            variant="ghost"
            size="icon"
            className="ml-auto text-sage-foreground hover:bg-white/40 sm:ml-1"
            aria-label="Toggle theme"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          </Btn>
        </header>

        {/* ── Page header + stats ─────────────────────────────────── */}
        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">GDG OAU · Web Development</p>
            <h1 className="mt-1 text-4xl font-bold sm:text-5xl">Your roadmap</h1>
          </div>
          <Btn variant="primary">
            Continue: Flexbox Layouts <ChevronRight />
          </Btn>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat tone="lilac" icon={<BookOpen />} value="7 modules" label="Completed" />
          <Stat tone="sun" icon={<Flame />} value="12 days" label="Current streak" />
          <Stat tone="rose" icon={<Trophy />} value="1,240 pts" label="#4 · board updates 7 AM & 7 PM" />
        </div>

        {/* ── Module list panel ───────────────────────────────────── */}
        <section className="mt-6 rounded-3xl bg-surface p-3 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <input placeholder="Search modules" className={cn(inputCls, "rounded-full pl-10")} />
            </div>
            <div className="relative">
              <Btn variant={filterOpen ? "secondary" : "outline"} onClick={() => { setFilterOpen((o) => !o); setTopicOpen(false); }} aria-expanded={filterOpen}>
                <SlidersHorizontal /> Filter
              </Btn>
              {filterOpen && (
                <div className="absolute top-12 left-0 z-20 flex items-start gap-2">
                  <Menu>
                    <MenuItem trailing={<Calendar />}>By week</MenuItem>
                    <MenuItem trailing={<ChevronRight />} active={topicOpen} onClick={() => setTopicOpen((o) => !o)}>
                      By status
                    </MenuItem>
                  </Menu>
                  {topicOpen && (
                    <Menu>
                      {["Completed", "In progress", "Locked", "Needs review"].map((t) => (
                        <MenuItem key={t} onClick={() => setFilterOpen(false)}>{t}</MenuItem>
                      ))}
                    </Menu>
                  )}
                </div>
              )}
            </div>
            {/* Track + level are read-only for learners. Level names come from the space (levels.title). */}
            <div className="ml-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground" title="Your mentor promotes you when you're ready">
              <span className="hidden sm:inline">Frontend track</span>
              <Chip tone="ink">HTML, CSS &amp; JS</Chip>
              <Chip><Lock /> Frameworks</Chip>
              <Chip><Lock /> Production</Chip>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-card p-4 shadow-card sm:p-5">
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
              aria-expanded={expanded}
            >
              <span className="grid size-9 place-items-center rounded-xl border border-border">
                <ChevronDown className={cn("size-4 transition-transform", !expanded && "-rotate-90")} />
              </span>
              <span className="font-display text-xl font-bold">HTML &amp; CSS Foundations</span>
              <span className="ml-auto text-sm text-muted-foreground">2 of 6 done</span>
            </button>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
              <div className="h-full w-1/3 rounded-full bg-mint" />
            </div>
            {expanded && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.map((m) => <ModuleCard key={m.title} {...m} />)}
              </div>
            )}
          </div>
        </section>

        {/* ── Rules made visible: completion, points, review ─────── */}
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          <ModuleProgress />
          <HowPointsWork />
          <ReviewCard />
        </div>

        {/* ── Joining: track pick, placement test, branch choice ─── */}
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-3">
          <JoinSpace />
          <PlacementCard />
          <BranchPicker />
        </div>

        {/* ── Forms + buttons ─────────────────────────────────────── */}
        <div className="mt-6 grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
          <section className="rounded-3xl bg-sage p-3 sm:p-5">
            <div className="rounded-2xl bg-card p-5 shadow-card sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">Invite to Web Development</h2>
                  <p className="mt-1 text-sm text-muted-foreground">They&rsquo;ll get a sign-in link. Invites expire in 7 days.</p>
                </div>
                <Btn variant="ghost" size="icon" aria-label="Close"><X /></Btn>
              </div>
              <div className="mt-5 grid gap-4">
                <Field label="Email">
                  <input type="email" placeholder="name@school.edu" className={inputCls} />
                </Field>
                <div className="grid gap-1.5">
                  <span className="text-[13px] font-medium">Role</span>
                  <div className="grid grid-cols-2 gap-3" role="radiogroup">
                    {ROLES.map((r) => {
                      const on = role === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setRole(r.id)}
                          className={cn(
                            "relative flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center transition-[border-color,box-shadow] outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                            on ? "border-primary ring-4 ring-primary/12" : "border-border hover:border-foreground/20",
                          )}
                        >
                          {on && (
                            <span className="absolute top-2.5 right-2.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                          )}
                          <Burst tone={r.tone} size={56}><r.icon /></Burst>
                          <span className="text-sm font-semibold">{r.label}</span>
                          <span className="-mt-1.5 text-xs text-muted-foreground">{r.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between gap-3">
                <Btn variant="outline">Cancel</Btn>
                <Btn>Send invite <ChevronRight /></Btn>
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-surface p-5 sm:p-6">
            <h2 className="text-2xl font-bold">Buttons &amp; chips</h2>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <Btn>Primary</Btn>
              <Btn variant="ink">Ink</Btn>
              <Btn variant="secondary">Secondary</Btn>
              <Btn variant="outline">Outline</Btn>
              <Btn variant="ghost">Ghost</Btn>
              <Btn variant="destructive">Remove</Btn>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <Btn size="sm">Small</Btn>
              <Btn size="md">Medium</Btn>
              <Btn size="lg"><Sparkles /> Large</Btn>
              <Btn disabled>Disabled</Btn>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Chip tone="mint"><Check /> Done</Chip>
              <Chip tone="sun"><Flame /> 12-day streak</Chip>
              <Chip tone="lilac"><BookOpen /> Quiz</Chip>
              <Chip tone="rose">Needs review</Chip>
              <Chip><Lock /> Locked</Chip>
            </div>

            <h3 className="mt-8 text-lg font-bold">Type</h3>
            <div className="mt-2 space-y-1.5">
              <p className="font-display text-5xl font-black uppercase leading-none">Rubik Black</p>
              <p className="font-display text-2xl font-semibold">Rubik for headings &amp; numbers</p>
              <p className="text-base">Inter for everything you read and click. 0123456789</p>
              <p className="text-sm text-muted-foreground">Muted helper text, 14px.</p>
            </div>

            <h3 className="mt-8 text-lg font-bold">Colour</h3>
            <div className="mt-3 grid grid-cols-5 gap-2 text-[11px] text-muted-foreground">
              {[
                ["primary", "bg-primary"],
                ["ink", "bg-ink"],
                ["sage", "bg-sage"],
                ["surface", "bg-surface border border-border"],
                ["card", "bg-card border border-border"],
                ["lilac", "bg-lilac"],
                ["sun", "bg-sun"],
                ["rose", "bg-rose"],
                ["mint", "bg-mint"],
                ["destructive", "bg-destructive"],
              ].map(([n, c]) => (
                <div key={n} className="grid gap-1">
                  <span className={cn("h-10 rounded-xl", c)} />
                  {n}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ tone, icon, value, label }: { tone: Tone; icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-surface p-5">
      <Burst tone={tone} size={68}>{icon}</Burst>
      <div>
        <div className="font-display text-3xl leading-none font-bold tabular">{value}</div>
        <div className="mt-1.5 text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function ModuleCard({ title, date, mins, status }: { title: string; date: string; mins: number; status: "done" | "active" | "locked" }) {
  const locked = status === "locked";
  return (
    <button
      type="button"
      disabled={locked}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-[border-color,box-shadow,transform] outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
        locked ? "cursor-not-allowed bg-surface/60" : "hover:-translate-y-0.5 hover:border-foreground/15 hover:shadow-card",
        status === "active" && "border-primary/40 ring-4 ring-primary/8",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cn("font-semibold", locked && "text-muted-foreground")}>{title}</span>
        {status === "done" && <Chip tone="mint"><Check /> Done</Chip>}
        {status === "active" && <Chip tone="sun">In progress</Chip>}
        {locked && <Lock className="size-4 text-muted-foreground" />}
      </div>
      <div className="flex items-center gap-4 text-[13px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Calendar className="size-4 text-lilac-foreground" /> {date}</span>
        <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-mint-foreground" /> {mins} min</span>
      </div>
    </button>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return <div className="w-52 rounded-2xl border border-border bg-popover p-1.5 shadow-pop">{children}</div>;
}

function MenuItem({ children, trailing, active, onClick }: { children: React.ReactNode; trailing?: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:text-muted-foreground",
        active && "bg-accent",
      )}
    >
      {children}
      {trailing}
    </button>
  );
}

/* ── Rule-driven components ─────────────────────────────────────────── */

const REQ_ICON = { videos: CirclePlay, checkpoints: ClipboardCheck, project: Rocket } as const;
const REQ_STATE = {
  videos: { done: 3, total: 4, note: "Lesson 4 on YouTube · 6 min left" },
  checkpoints: { done: 1, total: 2, note: "Checkpoint 2 opens after lesson 4" },
  project: { done: 0, total: 1, note: "Build a responsive card grid with Flexbox" },
} as const;

/** What finishing a module takes. No "mark as done": the server credits progress. */
function ModuleProgress() {
  return (
    <section className="rounded-3xl bg-surface p-3 sm:p-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Flexbox Layouts</h2>
          <Chip tone="sun">In progress</Chip>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">To finish this module and unlock the next:</p>
        <ol className="mt-4 grid gap-3">
          {MODULE_REQUIREMENTS.map((r, i) => {
            const st = REQ_STATE[r.key];
            const Icon = REQ_ICON[r.key];
            const done = st.done >= st.total;
            const blocked = i > 0 && REQ_STATE[MODULE_REQUIREMENTS[i - 1].key].done < REQ_STATE[MODULE_REQUIREMENTS[i - 1].key].total;
            return (
              <li key={r.key} className={cn("rounded-2xl border p-3.5", done ? "border-mint/40 bg-mint-soft/50" : "border-border")}>
                <div className="flex items-center gap-3">
                  <span className={cn("grid size-9 place-items-center rounded-xl", done ? "bg-mint text-white" : blocked ? "bg-surface text-muted-foreground" : "bg-secondary text-secondary-foreground")}>
                    {done ? <Check className="size-4" strokeWidth={3} /> : blocked ? <Lock className="size-4" /> : <Icon className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{r.label}</span>
                      <span className="text-xs text-muted-foreground tabular">{st.done}/{st.total}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                      <div className={cn("h-full rounded-full", done ? "bg-mint" : "bg-primary")} style={{ width: `${(st.done / st.total) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <p className="mt-2 pl-12 text-xs text-muted-foreground">{st.note}. {r.hint}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 rounded-2xl border border-dashed border-border p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Learn more</span>
            <Chip>Optional</Chip>
          </div>
          <ul className="mt-2 grid gap-1.5 text-sm">
            {["A Complete Guide to Flexbox", "Flexbox Froggy (practice)"].map((a) => (
              <li key={a} className="flex items-center gap-2 text-muted-foreground">
                <ExternalLink className="size-3.5 shrink-0" /> <span className="truncate">{a}</span>
              </li>
            ))}
          </ul>
        </div>
        <Btn className="mt-5 w-full">Resume lesson 4 <ChevronRight /></Btn>
      </div>
    </section>
  );
}

/** Shows WHAT earns points, never how much (or in what order of value). Weights stay on the server. */
const SOURCE_ICON = {
  video: { icon: CirclePlay, tone: "bg-secondary text-secondary-foreground" },
  checkpoint: { icon: ClipboardCheck, tone: "bg-lilac-soft text-lilac-foreground" },
  project: { icon: Rocket, tone: "bg-rose-soft text-rose-foreground" },
  standup: { icon: UsersRound, tone: "bg-mint-soft text-mint-foreground" },
  review: { icon: Presentation, tone: "bg-sun-soft text-sun-foreground" },
  workshop: { icon: Calendar, tone: "bg-sage-soft text-sage-foreground" },
  streak: { icon: Flame, tone: "bg-ember-soft text-ember" },
} as const;

function HowPointsWork() {
  return (
    <section className="rounded-3xl bg-sage p-3 sm:p-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <Burst tone="sun" size={48}><Trophy /></Burst>
          <div>
            <h2 className="text-xl font-bold">How you earn points</h2>
            <p className="text-sm text-muted-foreground">Everything here moves you up the board.</p>
          </div>
        </div>
        <ul className="mt-4 grid gap-1">
          {POINT_SOURCES.map((p) => {
            const { icon: Icon, tone } = SOURCE_ICON[p.key];
            return (
              <li key={p.key} className="flex items-start gap-3 rounded-xl px-1 py-2">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", tone)}><Icon className="size-4" /></span>
                <div>
                  <div className="text-sm font-semibold">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.hint}</div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-surface p-3 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" />
          Exact values aren&rsquo;t published. Mentors score projects on quality, so there&rsquo;s no shortcut past doing the work well.
        </p>
      </div>
    </section>
  );
}

/** Mentor view: review and score a capstone. Members never see this. */
function ReviewCard() {
  const [score, setScore] = useState(78);
  return (
    <section className="rounded-3xl bg-surface p-3 sm:p-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <Chip tone="lilac"><Presentation /> Mentor review</Chip>
          <span className="text-xs text-muted-foreground">Submitted 2h ago</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Burst tone="lilac" size={44}><UserRound /></Burst>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">Ada Okafor · Beginner</div>
            <div className="truncate text-xs text-muted-foreground">Capstone: The Box Model</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Btn variant="outline" size="sm"><ExternalLink /> Repo</Btn>
          <Btn variant="outline" size="sm"><ExternalLink /> Live</Btn>
        </div>
        <div className="mt-5 grid gap-1.5">
          <div className="flex items-center justify-between text-[13px] font-medium">
            <span>Score</span>
            <span className="font-display text-2xl font-bold tabular">{score}<span className="text-sm text-muted-foreground">/100</span></span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
            aria-label="Score"
          />
        </div>
        <div className="mt-4">
          <Field label="Feedback (required)">
            <textarea rows={3} placeholder="What works, what to improve…" className={cn(inputCls, "h-auto py-3")} />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Btn variant="outline">Request changes</Btn>
          <Btn>Approve &amp; score</Btn>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">You can&rsquo;t review your own projects. Every review is logged.</p>
      </div>
    </section>
  );
}

/* ── Joining a space ────────────────────────────────────────────────── */

/** Tracks are whatever the space defines; these are GDG OAU Web Development's. */
const TRACKS = [
  { id: "frontend", title: "Frontend", hint: "HTML, CSS, JavaScript, then a framework", needs: null },
  { id: "backend", title: "Backend", hint: "APIs, databases, auth", needs: null },
  { id: "qa", title: "QA", hint: "Testing, automation, quality", needs: null },
  { id: "fullstack", title: "Fullstack", hint: "Next.js, Supabase, Cloudinary, Cloudflare", needs: "Frontend · Frameworks" },
];

/** Onboarding: picks a starting track, never a level. */
function JoinSpace() {
  const [track, setTrack] = useState("frontend");
  const [hours, setHours] = useState(8);
  const [q0, q1, q2, q3] = INTAKE_QUESTIONS;
  return (
    <section className="rounded-3xl bg-sage p-3 sm:p-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <p className="text-xs font-medium text-muted-foreground">Welcome to Web Development · 1 of 2</p>
        <h2 className="mt-1 text-xl font-bold">{q0.label}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{q0.hint}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {TRACKS.map((t) => {
            const locked = t.needs !== null;
            const on = track === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={locked}
                onClick={() => setTrack(t.id)}
                aria-pressed={on}
                className={cn(
                  "rounded-2xl border p-3 text-left transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                  on ? "border-primary bg-secondary" : "border-border hover:bg-accent",
                  locked && "cursor-not-allowed opacity-60 hover:bg-transparent",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{t.title}</span>
                  {locked ? <Lock className="size-3.5 text-muted-foreground" /> : on && <Check className="size-4 text-primary" strokeWidth={3} />}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{locked ? `Needs ${t.needs}` : t.hint}</p>
              </button>
            );
          })}
        </div>
        <div className="mt-4 grid gap-3">
          <Field label={q1.label}>
            <textarea rows={2} placeholder={q1.hint} className={cn(inputCls, "h-auto py-2.5")} />
          </Field>
          <Field label={q2.label}>
            <input placeholder="https://github.com/…" className={inputCls} />
          </Field>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between text-[13px] font-medium">
              <span>{q3.label}</span>
              <span className="tabular">{hours}h</span>
            </div>
            <input type="range" min={1} max={40} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full accent-[var(--primary)]" aria-label={q3.label} />
          </div>
        </div>
        <Btn className="mt-5 w-full">Start at the beginning <ChevronRight /></Btn>
        <p className="mt-2 text-center text-xs text-muted-foreground">Already know the basics? You can take a placement test next.</p>
      </div>
    </section>
  );
}

/** Optional placement test. Passing only RECOMMENDS; a mentor still promotes. */
function PlacementCard() {
  const steps = [
    { icon: Timer, title: "Timed quiz", body: `${PLACEMENT.quizQuestions} questions, ${PLACEMENT.quizMinutes} minutes, drawn at random` },
    { icon: Rocket, title: "Practical task", body: "Build a small layout from a brief. Opens if you pass the quiz" },
    { icon: UserRound, title: "Mentor review", body: "A mentor checks your work and decides whether to move you up" },
  ];
  return (
    <section className="rounded-3xl bg-surface p-3 sm:p-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <Burst tone="lilac" size={48}><ClipboardCheck /></Burst>
          <div>
            <h2 className="text-xl font-bold">Skip ahead?</h2>
            <p className="text-sm text-muted-foreground">Optional placement test · Frontend</p>
          </div>
        </div>
        <ol className="mt-4 grid gap-3">
          {steps.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground"><st.icon className="size-4" /></span>
              <div>
                <div className="text-sm font-semibold">{i + 1}. {st.title}</div>
                <div className="text-xs text-muted-foreground">{st.body}</div>
              </div>
            </li>
          ))}
        </ol>
        <ul className="mt-4 grid gap-1.5 rounded-xl bg-surface p-3 text-xs text-muted-foreground">
          <li className="flex gap-2"><Info className="mt-px size-3.5 shrink-0" />Can place you up to Frameworks. The last level needs a chat with a mentor.</li>
          <li className="flex gap-2"><Info className="mt-px size-3.5 shrink-0" />One attempt every {PLACEMENT.retakeAfterDays} days.</li>
          <li className="flex gap-2"><Info className="mt-px size-3.5 shrink-0" />Modules you skip are marked &ldquo;Placed out&rdquo; and don&rsquo;t earn points.</li>
        </ul>
        <div className="mt-5 flex gap-2">
          <Btn variant="outline" className="flex-1">Not now</Btn>
          <Btn className="flex-1">Start test</Btn>
        </div>
      </div>
    </section>
  );
}

const BRANCHES = [
  { id: "react", title: "React + Next.js", body: "Server components, routing, data fetching" },
  { id: "vue", title: "Vue + Nuxt", body: "Composition API, Nuxt routing, data fetching" },
];

/** Intermediate: shared core first, then pick one framework. */
function BranchPicker() {
  const [pick, setPick] = useState("react");
  return (
    <section className="rounded-3xl bg-surface p-3 sm:p-4">
      <div className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">Frameworks</h2>
          <Chip tone="mint"><Check /> Core done</Chip>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Everyone takes the same core, then picks one path.</p>
        <div className="mt-4 rounded-2xl border border-mint/40 bg-mint-soft/50 p-3.5">
          <div className="text-sm font-semibold">Core · required</div>
          <p className="mt-1 text-xs text-muted-foreground">JSX &amp; components · State &amp; props · Vite · Routing basics</p>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <GitBranch className="size-3.5" /> Then pick one
        </div>
        <div className="mt-2 grid gap-2">
          {BRANCHES.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setPick(b.id)}
              aria-pressed={pick === b.id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-3 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
                pick === b.id ? "border-primary bg-secondary" : "border-border hover:bg-accent",
              )}
            >
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", pick === b.id ? "border-primary" : "border-border")}>
                {pick === b.id && <span className="size-2.5 rounded-full bg-primary" />}
              </span>
              <span>
                <span className="block text-sm font-semibold">{b.title}</span>
                <span className="block text-xs text-muted-foreground">{b.body}</span>
              </span>
            </button>
          ))}
        </div>
        <Btn className="mt-5 w-full">Start this path <ChevronRight /></Btn>
        <p className="mt-2 text-xs text-muted-foreground">You can change your mind until you start. After that, ask a mentor to switch you.</p>
      </div>
    </section>
  );
}
