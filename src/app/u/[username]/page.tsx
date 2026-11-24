import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowUpRight, BadgeCheck, Code2, FolderGit2, Globe } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/button-link";
import { UserAvatar } from "@/components/user-avatar";
import { EditProfileDialog } from "@/components/profile/edit-profile";
import { ShareProfile } from "@/components/profile/share-profile";
import { getSessionUser } from "@/server/auth/session";
import { getPublicProfile } from "@/server/services/profiles";
import { cn } from "@/lib/utils";

const TIERS = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const TIER_LABEL = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" } as const;
const COVERS = [
  "bg-lilac-soft text-lilac-foreground",
  "bg-sun-soft text-sun-foreground",
  "bg-mint-soft text-mint-foreground",
  "bg-rose-soft text-rose-foreground",
];

/** "github.com/ada/todo" from "https://github.com/ada/todo/". */
function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, "")}${u.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** Public: no sign-in needed (the proxy only guards /c and /admin). Shows nothing private. */
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await getPublicProfile(username);
  if (!p) return { title: "Profile not found", robots: { index: false } };
  const name = p.user.name ?? p.user.username;
  const description = p.user.bio ?? `${p.projects.length} mentor-approved project${p.projects.length === 1 ? "" : "s"} on Lenigo.`;
  return { title: { absolute: `${name} on Lenigo` }, description, openGraph: { title: `${name} on Lenigo`, description }, robots: { index: false } };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [profile, viewer] = await Promise.all([getPublicProfile(username), getSessionUser()]);
  if (!profile) notFound();
  const { user, levels, projects } = profile;
  const isMe = viewer?.id === user.id;
  const name = user.name ?? user.username ?? "Learner";
  const top = levels.reduce<(typeof levels)[number] | null>((best, l) => (!best || TIERS.indexOf(l.tier) > TIERS.indexOf(best.tier) ? l : best), null);

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
        <Logo />
        {viewer ? (
          <ButtonLink href="/c" variant="outline" size="sm">
            Your communities
          </ButtonLink>
        ) : (
          <ButtonLink href="/login" size="sm">
            Sign in
          </ButtonLink>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        {/* Intro */}
        <section className="pt-6 pb-10 sm:pt-14 sm:pb-14">
          <UserAvatar name={user.name} src={user.avatarUrl} className="size-20 ring-4 ring-card sm:size-24 [&_[data-slot=avatar-fallback]]:text-2xl sm:[&_[data-slot=avatar-fallback]]:text-3xl" />
          <p className="mt-6 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Portfolio
          </p>
          <h1 className="mt-2 font-display text-5xl leading-[0.9] font-black tracking-tight break-words uppercase sm:text-7xl">{name}</h1>
          {user.bio ? (
            <p className="mt-5 max-w-2xl text-lg text-pretty break-words sm:text-xl">{user.bio}</p>
          ) : isMe ? (
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground">Add a short bio: what you&rsquo;re learning and what you like to build.</p>
          ) : null}
          <p className="mt-4 text-sm text-muted-foreground">
            <span className="break-all">@{user.username}</span> · learning on Lenigo since {format(user.createdAt, "MMMM yyyy")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {user.githubUsername ? (
              <ButtonLink href={`https://github.com/${encodeURIComponent(user.githubUsername)}`} target="_blank" rel="noopener noreferrer" size="sm">
                <Code2 /> GitHub
              </ButtonLink>
            ) : null}
            <ShareProfile name={name} />
            {isMe && user.username ? (
              <EditProfileDialog profile={{ name: user.name, username: user.username, bio: user.bio, emailNotifications: viewer!.emailNotifications }} />
            ) : null}
          </div>

          {/* gap-px over a border-coloured grid draws the dividers in both layouts. */}
          <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-3xl bg-border shadow-card ring-1 ring-foreground/5 sm:grid-cols-3">
            {[
              ["Projects shipped", String(projects.length)],
              ["Tracks", String(levels.length)],
              ["Top level", top ? (top.level ?? TIER_LABEL[top.tier]) : "—"],
            ].map(([label, value], i) => (
              <div key={label} className={cn("min-w-0 bg-card px-4 py-4 sm:px-6 sm:py-5", i === 2 && "col-span-2 sm:col-span-1")}>
                <dt className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</dt>
                <dd className="mt-1 truncate font-display text-xl font-black sm:text-3xl">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Work */}
        <section aria-labelledby="work" className="border-t border-border pt-10 sm:pt-14">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="work" className="font-display text-3xl font-black tracking-tight uppercase sm:text-4xl">
              Shipped work
            </h2>
            <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <BadgeCheck className="size-4 text-mint" /> Every project reviewed and approved by a mentor
            </p>
          </div>

          {projects.length ? (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2">
              {projects.map((p, i) => {
                const featured = i === 0 && projects.length !== 2;
                return (
                  <li
                    key={p.id}
                    className={cn("flex flex-col overflow-hidden rounded-3xl bg-card shadow-card ring-1 ring-foreground/5", featured && "sm:col-span-2")}
                  >
                    <div className={cn("relative flex items-end justify-between gap-3 p-5", featured ? "h-36 sm:h-48 sm:p-7" : "h-28", COVERS[i % COVERS.length])}>
                      <span className="rounded-full bg-card/80 px-3 py-1 text-xs font-semibold text-foreground">{p.track}</span>
                      <span className={cn("font-display leading-none font-black opacity-40", featured ? "text-6xl sm:text-8xl" : "text-5xl")} aria-hidden>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <div className={cn("flex flex-1 flex-col p-5", featured && "sm:p-7")}>
                      <h3 className={cn("font-display font-bold break-words", featured ? "text-2xl sm:text-3xl" : "text-xl")}>{p.module}</h3>
                      {p.summary ? <p className={cn("mt-2 text-sm text-muted-foreground", featured ? "line-clamp-4 sm:max-w-2xl sm:text-base" : "line-clamp-3")}>{p.summary}</p> : null}
                      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm">
                        <a href={p.repoUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-w-0 items-center gap-1.5 font-medium text-primary hover:underline">
                          <FolderGit2 className="size-4 shrink-0" /> <span className="truncate">{shortUrl(p.repoUrl)}</span>
                        </a>
                        {p.liveUrl ? (
                          <a href={p.liveUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            <Globe className="size-4" /> Live <ArrowUpRight className="size-3.5" />
                          </a>
                        ) : null}
                        {p.reviewedAt ? (
                          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <BadgeCheck className="size-3.5 text-mint" /> {format(p.reviewedAt, "MMM yyyy")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-8 rounded-3xl border-2 border-dashed border-border px-6 py-14 text-center">
              <FolderGit2 className="mx-auto size-8 text-muted-foreground" />
              <p className="mx-auto mt-4 max-w-sm text-muted-foreground">
                {isMe
                  ? "Your portfolio fills up as mentors approve your projects. Finish a module's project and submit it for review."
                  : `${name} hasn't shipped a project yet. Check back soon.`}
              </p>
            </div>
          )}
        </section>

        {/* Skills */}
        {levels.length ? (
          <section aria-labelledby="skills" className="mt-14 border-t border-border pt-10 sm:mt-20 sm:pt-14">
            <h2 id="skills" className="font-display text-3xl font-black tracking-tight uppercase sm:text-4xl">
              Skills
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">Levels are earned: a mentor moves a learner up one level at a time.</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {levels.map((l, i) => {
                const at = TIERS.indexOf(l.tier);
                return (
                  <li key={i} className="rounded-3xl bg-card p-5 shadow-card ring-1 ring-foreground/5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="min-w-0 truncate font-display text-lg font-bold">{l.track}</h3>
                      <span className="shrink-0 text-sm font-medium">{l.level ?? TIER_LABEL[l.tier]}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-1.5" role="img" aria-label={`${TIER_LABEL[l.tier]}: level ${at + 1} of 3`}>
                      {TIERS.map((t, j) => (
                        <div key={t}>
                          <div className={cn("h-2 rounded-full", j <= at ? "bg-primary" : "bg-surface")} />
                          <div className={cn("mt-1.5 truncate text-[11px]", j <= at ? "font-medium text-foreground" : "text-muted-foreground")}>{TIER_LABEL[t]}</div>
                        </div>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <footer className="mt-16 flex flex-col items-center gap-3 border-t border-border pt-8 text-center text-xs text-muted-foreground sm:mt-24">
          <p>Projects and levels on this page are verified by mentors in {name}&rsquo;s community.</p>
          <Link href="/" className="font-medium text-foreground hover:underline">
            Learn in public with Lenigo
          </Link>
        </footer>
      </main>
    </div>
  );
}
