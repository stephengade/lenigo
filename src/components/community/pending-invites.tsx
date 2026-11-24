"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { ArrowRight, Loader2, MailOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/role-badge";
import { api, apiError } from "@/lib/api";
import type { CommunityRole, SpaceRole } from "@/lib/permissions";

export type PendingInvite = {
  id: string;
  communityName: string;
  spaceName: string | null;
  role: CommunityRole | SpaceRole;
  expiresAt: Date;
  invitedBy: string | null;
};

/** Invites sent to the signed-in user's email, so they can accept without the email's link. */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function accept(id: string) {
    setError(null);
    setBusy(id);
    start(async () => {
      const { data, error } = await api.me.invites({ id }).accept.post();
      if (error) {
        setBusy(null);
        return setError(apiError(error));
      }
      router.replace(data.redirectTo);
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="pending-invites" className="mb-8 rounded-3xl bg-sun-soft p-5 sm:p-6">
      <h2 id="pending-invites" className="flex items-center gap-2 font-display text-lg font-bold">
        <MailOpen className="size-5" /> {invites.length === 1 ? "You have an invite" : `You have ${invites.length} invites`}
      </h2>
      <p className="text-sm text-muted-foreground">Sent to the email you signed in with.</p>
      <ul className="mt-4 grid gap-3">
        {invites.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-4 rounded-2xl bg-card p-4 shadow-card">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-bold">
                  {inv.communityName}
                  {inv.spaceName ? <span className="text-muted-foreground"> · {inv.spaceName}</span> : null}
                </span>
                <RoleBadge role={inv.role} />
              </div>
              <p className="text-xs text-muted-foreground">
                {inv.invitedBy ? `From ${inv.invitedBy} · ` : ""}expires in {formatDistanceToNowStrict(inv.expiresAt)}
              </p>
            </div>
            <Button onClick={() => accept(inv.id)} disabled={pending}>
              {busy === inv.id ? <Loader2 className="animate-spin" /> : null} Accept <ArrowRight data-icon="inline-end" />
            </Button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
