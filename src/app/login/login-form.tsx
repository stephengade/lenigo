"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function GithubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

type Step = "email" | "code";
type Busy = null | "github" | "sending" | "verifying";

/**
 * Email sign-in with a one-time code. The code is checked on the server (/auth/verify),
 * which also records the sign-in. No account needed beforehand: the first code creates it.
 */
export function LoginForm({ next, github: githubEnabled }: { next: string; github: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  async function github() {
    setBusy("github");
    setError(null);
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, scopes: "read:user user:email" },
    });
    if (error) {
      setError(error.message);
      setBusy(null);
    }
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy("sending");
    setError(null);
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email: email.trim(),
      // Only used by the email's "open the sign-in page" link; the code itself works anywhere.
      options: { emailRedirectTo: `${location.origin}/login?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    setBusy(null);
    if (error) {
      setError(/rate|seconds/i.test(error.message) ? "Too many codes requested. Wait a minute, then try again." : error.message);
      return;
    }
    setSent(true);
    setCode("");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy("verifying");
    setError(null);
    try {
      const res = await fetch("/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code: code.trim(), next }),
      });
      const body = (await res.json().catch(() => ({}))) as { next?: string; error?: string };
      if (!res.ok || !body.next) {
        setError(body.error ?? "We couldn't sign you in. Try again.");
        setBusy(null);
        return;
      }
      router.replace(body.next);
      router.refresh();
    } catch {
      setError("Network problem. Check your connection and try again.");
      setBusy(null);
    }
  }

  if (step === "code") {
    return (
      <div className="mt-8 rounded-3xl bg-surface p-3">
        <form onSubmit={verify} className="rounded-2xl bg-card p-6 shadow-card">
          <div className="grid size-11 place-items-center rounded-2xl bg-mint-soft text-mint-foreground">
            <MailCheck className="size-5" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">{sent ? "Check your inbox" : "Enter your code"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sent ? "We sent a sign-in code to " : "Use the sign-in code we emailed to "}
            <span className="font-medium text-foreground">{email}</span>.
          </p>
          <div className="mt-5 space-y-1.5">
            <Label htmlFor="code">Sign-in code</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              maxLength={10}
              required
              autoFocus
              placeholder="123456"
              className="font-mono text-lg tracking-[0.3em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <Button type="submit" size="lg" className="mt-4 w-full" disabled={busy !== null || code.length < 6}>
            {busy === "verifying" ? <Loader2 className="animate-spin" /> : null}
            Sign in
            <ArrowRight data-icon="inline-end" />
          </Button>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-x-4 -ml-2">
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => sendCode()}>
              {busy === "sending" ? <Loader2 className="animate-spin" /> : null}
              Send a new code
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => {
                setStep("email");
                setError(null);
              }}
            >
              Use a different email
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      {githubEnabled ? (
        <>
          <Button variant="ink" size="lg" className="w-full" onClick={github} disabled={busy !== null}>
            {busy === "github" ? <Loader2 className="animate-spin" /> : <GithubIcon className="size-4" />}
            Continue with GitHub
          </Button>
          <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or email
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : null}

      <form onSubmit={sendCode} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="ada@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={busy !== null || !email}>
          {busy === "sending" ? <Loader2 className="animate-spin" /> : null}
          Email me a sign-in code
          <ArrowRight data-icon="inline-end" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          disabled={busy !== null || !email}
          onClick={() => {
            setSent(false);
            setError(null);
            setStep("code");
          }}
        >
          I already have a code
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {githubEnabled ? (
        <p className="text-xs text-muted-foreground">GitHub is recommended: it fills in your handle and avatar for project reviews.</p>
      ) : null}
    </div>
  );
}
