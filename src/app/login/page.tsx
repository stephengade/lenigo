import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { LoginForm } from "./login-form";
import { getSessionUser } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  missing_code: "That sign-in link was incomplete. Try again.",
  link_invalid: "That sign-in link isn't valid. Request a new one.",
  link_expired: "That sign-in link has expired. Request a new one.",
  sign_in_failed: "We couldn't sign you in. Try again.",
};

const POINTS = [
  ["+10", "daily standup"],
  ["+25", "quiz passed"],
  ["+100", "project approved"],
] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next: rawNext, error } = await searchParams;
  const next = safeNext(rawNext, "/c");
  if (await getSessionUser()) redirect(next);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] rounded-full bg-ember/25 blur-3xl" />
        <Logo tone="light" className="relative" />
        <div className="relative mt-auto max-w-md space-y-6">
          <p className="font-display text-5xl leading-[1.02] font-bold text-balance">
            Tutorials end. <span className="text-ember">Streaks</span> don&rsquo;t.
          </p>
          <p className="text-primary-foreground/70">
            Pick a roadmap, ship a project every module, check in daily, and get real reviews from mentors in your community.
          </p>
          <ul className="grid grid-cols-3 gap-3 pt-4">
            {POINTS.map(([n, l]) => (
              <li key={l} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="font-display text-2xl font-bold text-ember">{n}</div>
                <div className="mt-1 font-mono text-[10px] tracking-wider text-primary-foreground/60 uppercase">{l}</div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col p-6 sm:p-10">
        <Logo className="lg:hidden" />
        <div className="m-auto w-full max-w-sm py-10">
          <h1 className="text-3xl font-bold">Sign in to Lenigo</h1>
          <p className="mt-2 text-sm text-muted-foreground">New here? Open your invite link — it signs you up and drops you into your community.</p>
          {error ? (
            <p role="alert" className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {ERRORS[error] ?? error}
            </p>
          ) : null}
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
