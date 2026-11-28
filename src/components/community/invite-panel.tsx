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
import { ROLE_LABEL, type CommunityRole, type SpaceRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { FieldError, invalid } from "@/components/form-field";
import { emailError, intError } from "@/lib/validate";

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
};

type Role = CommunityRole | SpaceRole;

export function InvitePanel({ scope, roles, invites }: { scope: InviteScope; roles: Role[]; invites: ActiveInvite[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"email" | "link">("email");
  const [role, setRole] = useState<Role>(roles.includes("MEMBER") ? "MEMBER" : roles[roles.length - 1]);
  const [email, setEmail] = useState("");
  const [maxUses, setMaxUses] = useState<string>("");
  const [expiresInDays, setExpiresInDays] = useState("14"); // email is the default mode, and email invites last 14 days
  const [result, setResult] = useState<{ url: string; emailed: boolean; emailError?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tried, setTried] = useState(false);
  const problem = mode === "email" ? emailError(email) : intError(maxUses, { label: "max uses", min: 1, max: 1000 });
  const shown = tried ? problem : null;
  const [pending, start] = useTransition();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (problem) return;
    start(async () => {
      const body = {
        email: mode === "email" ? email : null,
        maxUses: mode === "link" && maxUses ? Number(maxUses) : null,
        expiresInDays: Number(expiresInDays),
      };
      const c = api.c({ community: scope.communitySlug });
      const { data, error } =
        scope.kind === "community"
          ? await c.invites.post({ ...body, role: role as CommunityRole })
          : await c({ space: scope.spaceSlug }).invites.post({ ...body, role: role as SpaceRole });
      if (error) return void toast.error(apiError(error));
      setResult(data);
      setCopied(false);
      if (mode === "email") {
        if (data.emailed) toast.success(`Invite emailed to ${email}`);
        else toast.warning("Invite created, but the email didn't send. Share the link instead.");
        setEmail("");
      }
      router.refresh();
    });
  }

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
          <div className="inline-flex rounded-full bg-surface p-1 text-sm" role="tablist">
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
                  setMode(m);
                  setTried(false);
                  setResult(null);
                  setExpiresInDays(m === "email" ? "14" : "7");
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium whitespace-nowrap transition-colors",
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
              <Input id="invite-email" type="email" required placeholder="ada@oauife.edu.ng" value={email} onChange={(e) => setEmail(e.target.value)} {...invalid("invite-email", shown)} />
              <FieldError id="invite-email-error" message={shown} />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="invite-uses">Max uses</Label>
              <Input id="invite-uses" type="number" min={1} max={1000} placeholder="Unlimited" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} {...invalid("invite-uses", shown)} />
              <FieldError id="invite-uses-error" message={shown} />
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

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="invite-expiry">Expires in</Label>
            <select
              id="invite-expiry"
              className="h-9 rounded-full border border-input bg-card px-3 text-sm shadow-xs"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
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
