"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Check, Copy, Link2, Loader2, Mail, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/role-badge";
import { api, apiError } from "@/lib/api";
import { LEVEL_LABEL, ROLE_LABEL, type CommunityRole, type LevelTier, type SpaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { FieldError, invalid } from "@/components/form-field";
import { useZodForm } from "@/components/use-zod-form";
import { inviteSchema } from "@/lib/schemas";

export type InviteScope =
  | { kind: "community"; communitySlug: string }
  | { kind: "space"; communitySlug: string; spaceSlug: string };

export type ActiveInvite = {
  id: string;
  email: string | null;
  role: CommunityRole | SpaceRole;
  uses: number;
  maxUses: number | null;
  expiresAt: string;
  /** Email invites stay listed for 30 days after expiring, so they can be resent. */
  expired: boolean;
  createdBy: string | null;
  /** Learner invites: "Frontend (Intermediate)". */
  placement?: string | null;
};

type Role = CommunityRole | SpaceRole;

/** Space learner invites: the tracks someone can be started on, and whether this inviter may pick a level above the first. */
export type InvitePlacementOptions = {
  tracks: { id: string; title: string; levels: { tier: LevelTier; title: string }[] }[];
  canPlaceAbove: boolean;
};

const selectClass = "h-9 w-full rounded-control border border-input bg-card px-3 text-sm shadow-xs disabled:opacity-60";

export function InvitePanel({
  scope,
  roles,
  invites,
  placement,
}: {
  scope: InviteScope;
  roles: Role[];
  invites: ActiveInvite[];
  placement?: InvitePlacementOptions;
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(roles.includes("MEMBER") ? "MEMBER" : roles[roles.length - 1]);
  const [trackId, setTrackId] = useState("");
  const [tier, setTier] = useState<LevelTier>("BEGINNER");
  const track = placement?.tracks.find((t) => t.id === trackId);
  const canPlace = scope.kind === "space" && role === "MEMBER" && !!placement?.tracks.length;
  // Email is the default mode, and email invites last 14 days.
  const form = useZodForm(inviteSchema, { mode: "email", email: "", maxUses: "", expiresInDays: "14" });
  const mode = form.watch("mode");
  const fieldError = form.formState.errors.email?.message ?? form.formState.errors.maxUses?.message;
  const [result, setResult] = useState<{ url: string; emailed: boolean; emailError?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const create = form.handleSubmit((body) => {
    start(async () => {
      const c = api.c({ community: scope.communitySlug });
      const { data, error } =
        scope.kind === "community"
          ? await c.invites.post({ ...body, role: role as CommunityRole })
          : await c({ space: scope.spaceSlug }).invites.post({
              ...body,
              role: role as SpaceRole,
              ...(canPlace && track ? { trackId: track.id, tier } : {}),
            });
      if (error) return void toast.error(apiError(error));
      setResult(data);
      setCopied(false);
      if (mode === "email") {
        if (data.emailed) toast.success(`Invite emailed to ${body.email}`);
        else toast.warning("Invite created, but the email didn't send. Share the link instead.");
        form.setValue("email", "");
      }
      router.refresh();
    });
  });

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <form noValidate onSubmit={create} className="rounded-2xl bg-card shadow-card ring-1 ring-foreground/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Invite people</h2>
          <div className="inline-flex rounded-control bg-surface p-1 text-sm" role="tablist">
            {(
              [
                ["email", Mail, "Email"],
                ["link", Link2, "Shareable link"],
              ] as const
            ).map(([m, Icon, label]) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  form.setValue("mode", m);
                  form.clearErrors();
                  setResult(null);
                  form.setValue("expiresInDays", m === "email" ? "14" : "7");
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[calc(var(--radius-control)-4px)] px-3 py-1 font-medium whitespace-nowrap transition-colors",
                  mode === m ? "bg-ink text-ink-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_160px]">
          {mode === "email" ? (
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address</Label>
              <Input id="invite-email" type="email" placeholder="ada@oauife.edu.ng" {...form.register("email")} {...invalid("invite-email", fieldError)} />
              <FieldError id="invite-email-error" message={fieldError} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="invite-uses">Max uses</Label>
              <Input id="invite-uses" type="number" min={1} max={1000} placeholder="Unlimited" {...form.register("maxUses")} {...invalid("invite-uses", fieldError)} />
              <FieldError id="invite-uses-error" message={fieldError} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-full">
                <SelectValue>{(v: Role) => ROLE_LABEL[v]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {canPlace ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_160px]">
            <div className="space-y-1.5">
              <Label htmlFor="invite-track">Start them on</Label>
              <select
                id="invite-track"
                className={selectClass}
                value={trackId}
                onChange={(e) => {
                  setTrackId(e.target.value);
                  setTier("BEGINNER");
                }}
              >
                <option value="">They pick a track when they join</option>
                {placement!.tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-level">Level</Label>
              <select
                id="invite-level"
                className={selectClass}
                value={tier}
                disabled={!track}
                onChange={(e) => setTier(e.target.value as LevelTier)}
              >
                {(track?.levels ?? [{ tier: "BEGINNER" as const, title: LEVEL_LABEL.BEGINNER }]).map((l) => (
                  <option key={l.tier} value={l.tier} disabled={l.tier !== "BEGINNER" && !placement!.canPlaceAbove}>
                    {l.title}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {track
                ? tier === "BEGINNER"
                  ? `They join ${track.title} at the start.`
                  : `They join ${track.title} at ${track.levels.find((l) => l.tier === tier)?.title}. Earlier levels stay open to them but earn no points.`
                : "Optional. Leave it and they choose their first track themselves."}
              {placement!.canPlaceAbove ? "" : " Only Mentors and Leads can start someone above the first level."}
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-expiry">Expires in</Label>
            <select
              id="invite-expiry"
              className="h-9 rounded-control border border-input bg-card px-3 text-sm shadow-xs"
              {...form.register("expiresInDays")}
            >
              {[1, 3, 7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {d} day{d > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : mode === "email" ? <Mail /> : <Link2 />}
            {mode === "email" ? "Send invite" : "Create link"}
          </Button>
        </div>

        {result ? (
          <div className="mt-5 rounded-xl border border-dashed bg-surface p-3">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{result.url}</code>
              <Button type="button" size="sm" variant="outline" onClick={() => copy(result.url)}>
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {mode === "email"
                ? result.emailed
                  ? "We also emailed them this invite. This copy of the link always asks them to sign in first."
                  : `Email not sent${result.emailError ? ` (${result.emailError})` : ""}. Send them this link yourself.`
                : "Anyone with this link can join with the selected role until it expires or runs out of uses."}
            </p>
          </div>
        ) : null}
      </form>

      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Pending invites · {invites.length}</h3>
        {invites.some((i) => i.email) ? (
          <p className="mb-3 text-xs text-muted-foreground">Resend emails a fresh invite; the old link and email button stop working.</p>
        ) : null}
        {invites.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl bg-card shadow-card ring-1 ring-foreground/5">
            {invites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} scope={scope} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function InviteRow({ invite, scope }: { invite: ActiveInvite; scope: InviteScope }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resending, startResend] = useTransition();
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  function resend() {
    startResend(async () => {
      const c = api.c({ community: scope.communitySlug });
      const { data, error } =
        scope.kind === "community"
          ? await c.invites({ inviteId: invite.id }).resend.post()
          : await c({ space: scope.spaceSlug }).invites({ inviteId: invite.id }).resend.post();
      if (error) return void toast.error(apiError(error));
      if (data.emailed) {
        setFallbackUrl(null);
        toast.success(`New invite sent to ${invite.email}. The old link no longer works.`);
      } else {
        setFallbackUrl(data.url);
        toast.warning("The email didn't send. Copy the new link and send it yourself.");
      }
      router.refresh();
    });
  }

  function revoke() {
    start(async () => {
      const c = api.c({ community: scope.communitySlug });
      const { error } =
        scope.kind === "community"
          ? await c.invites({ inviteId: invite.id }).delete()
          : await c({ space: scope.spaceSlug }).invites({ inviteId: invite.id }).delete();
      if (error) return void toast.error(apiError(error));
      toast.success("Invite revoked");
      router.refresh();
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="grid size-8 place-items-center rounded-lg bg-surface text-muted-foreground">
        {invite.email ? <Mail className="size-4" /> : <Link2 className="size-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{invite.email ?? "Shareable link"}</span>
          <RoleBadge role={invite.role} />
        </div>
        {invite.placement ? <div className="truncate text-xs font-medium text-foreground/80">Starts on {invite.placement}</div> : null}
        <div className="text-xs text-muted-foreground">
          {invite.email ? "Single use" : `${invite.uses}${invite.maxUses ? ` / ${invite.maxUses}` : ""} used`} ·{" "}
          {invite.expired ? (
            <span className="font-medium text-destructive">expired {formatDistanceToNowStrict(new Date(invite.expiresAt), { addSuffix: true })}</span>
          ) : (
            <>expires {formatDistanceToNowStrict(new Date(invite.expiresAt), { addSuffix: true })}</>
          )}
          {invite.createdBy ? ` · by ${invite.createdBy}` : ""}
        </div>
        {fallbackUrl ? (
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary"
            onClick={async () => {
              await navigator.clipboard.writeText(fallbackUrl);
              toast.success("New link copied");
            }}
          >
            <Copy className="size-3" /> Copy the new link
          </button>
        ) : null}
      </div>
      {invite.email ? (
        <Button size="sm" variant="outline" onClick={resend} disabled={resending || pending} aria-label={`Resend invite to ${invite.email}`}>
          {resending ? <Loader2 className="animate-spin" /> : <RotateCw />} Resend
        </Button>
      ) : null}
      <Button size="icon-sm" variant="ghost" onClick={revoke} disabled={pending || resending} aria-label="Revoke invite">
        {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </li>
  );
}
