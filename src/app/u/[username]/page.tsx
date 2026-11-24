import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ExternalLink, FolderGit2, GraduationCap } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Panel } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/button-link";
import { UserAvatar } from "@/components/user-avatar";
import { EditProfileDialog } from "@/components/profile/edit-profile";
import { getSessionUser } from "@/server/auth/session";
import { getPublicProfile } from "@/server/services/profiles";

/** Public: no sign-in needed (the proxy only guards /c and /admin). Shows nothing private. */
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await getPublicProfile(username);
  return { title: p ? `${p.user.name ?? p.user.username} on Lenigo` : "Profile not found", robots: { index: false } };
}

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const [profile, viewer] = await Promise.all([getPublicProfile(username), getSessionUser()]);
  if (!profile) notFound();
  const { user, levels, projects } = profile;
  const isMe = viewer?.id === user.id;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5 sm:px-6">
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

      <main className="mx-auto max-w-4xl space-y-6 px-4 pb-16 sm:px-6">
        <section className="flex flex-wrap items-center gap-5 rounded-3xl bg-sun-soft p-6 sm:p-8">
          <UserAvatar name={user.name} src={user.avatarUrl} className="size-20 text-xl" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl leading-[0.95] font-black tracking-tight uppercase sm:text-4xl">{user.name ?? user.username}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              @{user.username} · learning on Lenigo since {format(user.createdAt, "MMMM yyyy")}
              {user.githubUsername ? (
                <>
                  {" · "}
                  <a href={`https://github.com/${encodeURIComponent(user.githubUsername)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                    GitHub
                  </a>
                </>
              ) : null}
            </p>
            {user.bio ? <p className="mt-3 max-w-xl text-pretty">{user.bio}</p> : null}
          </div>
          {isMe && user.username ? <EditProfileDialog profile={{ name: user.name, username: user.username, bio: user.bio, emailNotifications: viewer!.emailNotifications }} /> : null}
        </section>

        {levels.length ? (
          <Panel tone="lilac">
            <div className="rounded-2xl bg-card p-5 shadow-card">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold">
                <GraduationCap className="size-5" /> Levels
              </h2>
              <p className="text-xs text-muted-foreground">Earned: a mentor moves learners up one level at a time.</p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {levels.map((l, i) => (
                  <li key={i} className="inline-flex items-center gap-2 rounded-full bg-surface py-1 pr-1 pl-4 text-sm font-medium">
                    {l.track}
                    <Badge variant="ink">{l.level ?? l.tier}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        ) : null}

        <Panel tone="sage">
          <div className="rounded-2xl bg-card p-5 shadow-card">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <FolderGit2 className="size-5" /> Shipped projects
            </h2>
            <p className="text-xs text-muted-foreground">Capstone projects approved by a mentor.</p>
            {projects.length ? (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {projects.map((p) => (
                  <li key={p.id} className="rounded-2xl border border-border p-4">
                    <div className="text-xs font-medium text-muted-foreground">{p.track}</div>
                    <h3 className="mt-0.5 font-display font-bold">{p.module}</h3>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <a href={p.repoUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary">
                        Code <ExternalLink className="size-3.5" />
                      </a>
                      {p.liveUrl ? (
                        <a href={p.liveUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium text-primary">
                          Live <ExternalLink className="size-3.5" />
                        </a>
                      ) : null}
                      {p.reviewedAt ? <span className="ml-auto text-xs text-muted-foreground">{format(p.reviewedAt, "MMM yyyy")}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-muted-foreground">No approved projects yet.</p>
            )}
          </div>
        </Panel>
      </main>
    </div>
  );
}
