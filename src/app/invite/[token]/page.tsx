import { format } from "date-fns";
import { Link2Off } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/button-link";
import { RoleBadge } from "@/components/role-badge";
import { getSessionUser } from "@/server/auth/session";
import { oneClickAvailable, previewInvite } from "@/server/services/invites";
import { canSendEmail } from "@/server/email/send";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { AcceptInvite } from "./accept-invite";
import { LoginForm } from "@/app/login/login-form";
import { ROLE_BLURB } from "@/lib/role-copy";

export const metadata = { title: "You're invited", referrer: "same-origin" as const };

const ERRORS: Record<string, string> = {
  link_used: "That button has expired, was already used, or was replaced by a newer invite email. Confirm with a sign-in code below instead.",
  use_code: "You already have a Lenigo account, so confirm it's you with a sign-in code below.",
  deactivated: "This account has been deactivated. Contact your community lead or the Lenigo team.",
  sign_in_failed: "We couldn't sign you in with the button. Use a sign-in code below instead.",
  one_click_off: "Sign in with a code below to accept.",
  use_code_or_expired: "To keep your account safe, confirm it's you: we'll email a sign-in code to this address.",
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ k?: string; error?: string }>;
}) {
  const [{ token }, { k, error }] = await Promise.all([params, searchParams]);
  const [invite, user, oneClick] = await Promise.all([
    previewInvite(token),
    getSessionUser(),
    k && !error ? oneClickAvailable(token) : false,
  ]);
  // Came from the email's button but one-click doesn't apply (existing account, or past 72 hours).
  const notice = error ?? (k && !oneClick ? "use_code_or_expired" : undefined);
  const next = `/invite/${token}`;

  return (
    <main className="flex min-h-dvh flex-col bg-sun-soft/60 p-6 dark:bg-sun-soft/30">
      <Logo />
      <div className="m-auto w-full max-w-md">
        {!invite.ok ? (
          <div className="rounded-3xl bg-card p-8 text-center shadow-pop">
            <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface text-muted-foreground">
              <Link2Off className="size-6" />
            </div>
            <h1 className="mt-5 font-display text-3xl font-black tracking-tight uppercase">Invite unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{invite.reason}</p>
            <ButtonLink href={user ? "/c" : "/"} variant="outline" className="mt-6">
              {user ? "My communities" : "Back home"}
            </ButtonLink>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[2rem] bg-card shadow-pop">
            <div className="relative m-2 rounded-3xl bg-primary px-7 pt-7 pb-9 text-primary-foreground">
              <div className="pointer-events-none absolute inset-0 rounded-3xl bg-paper-dots opacity-20" />
              <p className="relative text-sm font-semibold text-primary-foreground/80">You&rsquo;re invited to</p>
              <h1 className="relative mt-2 font-display text-4xl leading-[0.95] font-black tracking-tight uppercase">
                {invite.spaceName ?? invite.communityName}
              </h1>
              {invite.spaceName ? <p className="relative mt-2 text-primary-foreground/80">in {invite.communityName}</p> : null}
            </div>
            <div className="space-y-5 px-7 pt-5 pb-7">
              <div className="flex items-center gap-2 text-sm">
                Joining as <RoleBadge role={invite.role} />
              </div>
              <p className="text-sm text-muted-foreground">{ROLE_BLURB[invite.role]}</p>

              {user ? (
                <AcceptInvite token={token} signedInAs={user.email} lockedTo={invite.email} />
              ) : invite.email && k && oneClick ? (
                // One press from the invite email: signs in as the invited address and accepts (see ./accept/route.ts).
                <form method="post" action={`/invite/${token}/accept`} className="space-y-3">
                  <input type="hidden" name="k" value={k} />
                  <Button type="submit" size="lg" className="w-full">
                    Accept invite <ArrowRight data-icon="inline-end" />
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Signs you in as <span className="font-medium text-foreground">{invite.email}</span>
                  </p>
                </form>
              ) : (
                <div className="-mt-3">
                  {notice ? (
                    <p
                      role={error ? "alert" : undefined}
                      className={
                        error
                          ? "mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
                          : "mt-3 rounded-2xl bg-surface px-4 py-3 text-sm text-muted-foreground"
                      }
                    >
                      {ERRORS[notice] ?? "Sign in with a code below to accept."}
                    </p>
                  ) : null}
                  {/* Sign in right here and the invite is accepted in the same step. Supabase's invite
                      email already holds a code; Lenigo's own email doesn't, so that starts by sending one. */}
                  <LoginForm
                    next={next}
                    github={false}
                    email={invite.email ?? undefined}
                    invite={token}
                    startWithCode={Boolean(invite.email) && !canSendEmail()}
                  />
                  {invite.email ? null : (
                    <p className="mt-3 text-center text-xs text-muted-foreground">New to Lenigo? Signing in creates your account.</p>
                  )}
                </div>
              )}

              <p className="border-t border-border pt-4 text-xs text-muted-foreground">
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
