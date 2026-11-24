import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";
import { getSessionUser } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-next";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  missing_code: "That sign-in link was incomplete. Try again.",
  // Older emailed links still work through /auth/confirm; these cover them.
  link_invalid: "That sign-in link isn't valid. Request a new one.",
  link_expired: "That sign-in link has expired. Request a new one.",
  sign_in_failed: "We couldn't sign you in. Try again.",
  deactivated: "This account has been deactivated. Contact your community lead or the Lenigo team.",
};

/* What the left panel promises. No point values: learners see sources, never weights. */
const HIGHLIGHTS = [
  { label: "Roadmaps", tone: "bg-lilac" },
  { label: "Mentor reviews", tone: "bg-mint" },
  { label: "Daily standups", tone: "bg-rose" },
] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext, "/c");
  if (await getSessionUser()) redirect(next);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative m-3 hidden overflow-hidden rounded-[2rem] bg-sun-soft p-10 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 bg-paper-dots opacity-60" />
        <Logo className="relative" />
        <div className="relative mt-auto max-w-lg">
          <p className="font-display text-6xl leading-[0.92] font-black tracking-tight text-balance text-ink uppercase">
            Learn it.
            <br />
            Build it.
            <br />
            <span className="mt-2 inline-block -rotate-2 rounded-3xl bg-primary px-5 pt-1 pb-2 text-primary-foreground shadow-pop">Ship it.</span>
          </p>
          <p className="mt-8 text-lg text-muted-foreground">
            Follow a roadmap, ship a project every module, check in daily and get real reviews from mentors in your community.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {HIGHLIGHTS.map((h) => (
              <li key={h.label} className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-semibold shadow-xs">
                <span className={`size-2 rounded-full ${h.tone}`} /> {h.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col p-6 sm:p-10">
        <Logo className="lg:hidden" />
        <div className="m-auto w-full max-w-sm py-10">
          <h1 className="font-display text-4xl leading-[0.95] font-black tracking-tight uppercase">Sign in</h1>
          <p className="mt-3 text-muted-foreground">New here? No sign-up needed: we email you a code, and your first sign-in creates your account. Invited? Open your invite link first.</p>
          {error ? (
            <p role="alert" className="mt-6 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {ERRORS[error] ?? error}
            </p>
          ) : null}
          <LoginForm next={next} github={env.AUTH_GITHUB_ENABLED} />
        </div>
      </section>
    </main>
  );
}
