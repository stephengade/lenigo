"use client";

import { useState } from "react";
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

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "github" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function github() {
    setState("github");
    setError(null);
    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, scopes: "read:user user:email" },
    });
    if (error) {
      setError(error.message);
      setState("idle");
    }
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/confirm?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
      setState("idle");
    } else setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="mt-8 rounded-3xl bg-surface p-3"><div className="rounded-2xl bg-card p-6 shadow-card">
        <div className="grid size-11 place-items-center rounded-2xl bg-mint-soft text-mint-foreground">
          <MailCheck className="size-5" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold">Check your inbox</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. It works on any device.
        </p>
        <Button variant="ghost" size="sm" className="mt-4 -ml-2" onClick={() => setState("idle")}>
          Use a different email
        </Button>
      </div></div>
    );
  }

  return (
    <div className="mt-8 space-y-6">
      <Button variant="ink" size="lg" className="w-full" onClick={github} disabled={state !== "idle"}>
        {state === "github" ? <Loader2 className="animate-spin" /> : <GithubIcon className="size-4" />}
        Continue with GitHub
      </Button>

      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or email
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={magicLink} className="space-y-3">
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
        <Button type="submit" size="lg" className="w-full" disabled={state !== "idle" || !email}>
          {state === "sending" ? <Loader2 className="animate-spin" /> : null}
          Email me a sign-in link
          <ArrowRight data-icon="inline-end" />
        </Button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">GitHub is recommended: it fills in your handle and avatar for project reviews.</p>
    </div>
  );
}
