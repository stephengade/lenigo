"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, apiError } from "@/lib/api";

export function AcceptInvite({ token, signedInAs, lockedTo }: { token: string; signedInAs: string; lockedTo: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mismatch = lockedTo !== null && lockedTo.toLowerCase() !== signedInAs.toLowerCase();

  function accept() {
    setError(null);
    start(async () => {
      const { data, error } = await api.invites({ token }).redeem.post();
      if (error) return setError(apiError(error));
      router.replace(data.redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Button size="lg" className="w-full" onClick={accept} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Accept invite <ArrowRight data-icon="inline-end" />
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{signedInAs}</span>
        {mismatch ? (
          <>
            {" "}
            · this invite was sent to a different address.{" "}
            <button
              className="underline underline-offset-2"
              onClick={async () => {
                await fetch("/auth/signout", { method: "POST" });
                router.refresh();
              }}
            >
              Switch account
            </button>
          </>
        ) : null}
      </p>
      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
