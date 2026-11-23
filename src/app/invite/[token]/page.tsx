import { format } from "date-fns";
import { Link2Off } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/button-link";
import { RoleBadge } from "@/components/role-badge";
import { getSessionUser } from "@/server/auth/session";
import { previewInvite } from "@/server/services/invites";
import { AcceptInvite } from "./accept-invite";

export const metadata = { title: "You're invited" };

const ROLE_BLURB: Record<string, string> = {
  OWNER: "You'll run this community: create spaces, appoint admins and leads, and oversee every track.",
  ADMIN: "You'll help run this community, with Lead access in every space.",
  LEAD: "You'll own this space: curriculum, team, reviews and workshops.",
  MANAGER: "You'll build curriculum, invite mentors and members, and review projects.",
  MENTOR: "You'll review learners' projects, give feedback and run live review sessions.",
  MEMBER: "You'll follow the roadmap, ship projects, post daily standups and climb the leaderboard.",
};

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([previewInvite(token), getSessionUser()]);
  const next = `/invite/${token}`;

  return (
    <main className="flex min-h-dvh flex-col bg-paper-dots p-6">
      <Logo />
      <div className="m-auto w-full max-w-md">
        {!invite.ok ? (
          <div className="rounded-3xl border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <Link2Off className="size-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold">Invite unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{invite.reason}</p>
            <ButtonLink href={user ? "/c" : "/"} variant="outline" className="mt-6">
              {user ? "My communities" : "Back home"}
            </ButtonLink>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="relative bg-primary px-8 pt-8 pb-10 text-primary-foreground">
              <div className="pointer-events-none absolute -right-10 -bottom-20 size-56 rounded-full bg-ember/30 blur-3xl" />
              <p className="relative font-mono text-[11px] tracking-wider text-primary-foreground/60 uppercase">You&rsquo;re invited to</p>
              <h1 className="relative mt-2 text-3xl leading-tight font-bold">
                {invite.spaceName ?? invite.communityName}
              </h1>
              {invite.spaceName ? <p className="relative mt-1 text-primary-foreground/70">in {invite.communityName}</p> : null}
            </div>
            <div className="space-y-5 p-8">
              <div className="flex items-center gap-2 text-sm">
                Joining as <RoleBadge role={invite.role} />
              </div>
              <p className="text-sm text-muted-foreground">{ROLE_BLURB[invite.role]}</p>

              {user ? (
                <AcceptInvite token={token} signedInAs={user.email} lockedTo={invite.email} />
              ) : (
                <div className="space-y-3">
                  <ButtonLink href={`/login?next=${encodeURIComponent(next)}`} size="lg" className="h-11 w-full">
                    Sign in to accept
                  </ButtonLink>
                  <p className="text-center text-xs text-muted-foreground">
                    {invite.email
                      ? "Use the email address this invite was sent to."
                      : "New to Lenigo? Signing in creates your account."}
                  </p>
                </div>
              )}

              <p className="border-t pt-4 font-mono text-[11px] text-muted-foreground">
                /c/{invite.communitySlug}
                {invite.spaceSlug ? `/${invite.spaceSlug}` : ""} · expires {format(invite.expiresAt, "d MMM yyyy")}
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
