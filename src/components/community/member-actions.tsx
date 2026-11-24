"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, MoreHorizontal, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RoleBadge } from "@/components/role-badge";
import { api, apiError } from "@/lib/api";
import { ROLE_LABEL, type CommunityRole, type SpaceRole } from "@/lib/permissions";
import type { InviteScope } from "./invite-panel";

type Role = CommunityRole | SpaceRole;

/** Role picker for one member. Shows a static badge when the viewer can't change this member. */
export function MemberRoleSelect({
  scope,
  userId,
  role,
  assignable,
}: {
  scope: InviteScope;
  userId: string;
  role: Role;
  /** Roles the viewer may move this member to (empty → read-only). */
  assignable: Role[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!assignable.length) return <RoleBadge role={role} />;

  function change(to: Role) {
    if (to === role) return;
    start(async () => {
      const c = api.c({ community: scope.communitySlug });
      const { error } =
        scope.kind === "community"
          ? await c.members({ userId }).patch({ role: to as CommunityRole })
          : await c({ space: scope.spaceSlug }).members({ userId }).patch({ role: to as SpaceRole });
      if (error) return void toast.error(apiError(error));
      toast.success(`Role changed to ${ROLE_LABEL[to]}`);
      router.refresh();
    });
  }

  const options = assignable.includes(role) ? assignable : [role, ...assignable];
  return (
    <Select value={role} onValueChange={(v) => change(v as Role)} disabled={pending}>
      <SelectTrigger size="sm" className="w-32" aria-label="Change role">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        <SelectValue>{(v: Role) => ROLE_LABEL[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RemoveMemberButton({
  communitySlug,
  spaceSlug,
  userId,
  name,
}: {
  communitySlug: string;
  spaceSlug: string;
  userId: string;
  name: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Remove ${name} from this space? Their progress is kept if they rejoin.`)) return;
        start(async () => {
          const { error } = await api.c({ community: communitySlug })({ space: spaceSlug }).members({ userId }).delete();
          if (error) return void toast.error(apiError(error));
          toast.success(`${name} removed`);
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <UserMinus />}
    </Button>
  );
}

/**
 * Actions on one community member: hand over the Community Lead role, or remove them from the
 * community and all its spaces. The server re-checks every rule; this only hides what won't work.
 */
export function CommunityMemberMenu({
  communitySlug,
  userId,
  name,
  canHandOver,
  canRemove,
  viewerIsLead,
}: {
  communitySlug: string;
  userId: string;
  name: string;
  canHandOver: boolean;
  canRemove: boolean;
  /** The viewer is a Community Lead by membership (a Super Admin override isn't), so handing over demotes them. */
  viewerIsLead: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canHandOver && !canRemove) return <span className="size-8" aria-hidden />;

  function handOver() {
    const msg = viewerIsLead
      ? `Make ${name} the Community Lead? You'll become an Admin of this community.`
      : `Make ${name} a Community Lead?`;
    if (!confirm(msg)) return;
    start(async () => {
      const { error } = await api.c({ community: communitySlug }).members({ userId })["hand-over"].post();
      if (error) return void toast.error(apiError(error));
      toast.success(`${name} is now Community Lead`);
      router.refresh();
    });
  }

  function remove() {
    if (!confirm(`Remove ${name} from this community and all its spaces? Their pending invites here are cancelled. Their learning history is kept if they're invited back.`)) return;
    start(async () => {
      const { error } = await api.c({ community: communitySlug }).members({ userId }).delete();
      if (error) return void toast.error(apiError(error));
      toast.success(`${name} removed from the community`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="grid size-8 place-items-center rounded-full text-muted-foreground outline-none hover:bg-surface hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Actions for ${name}`}
        disabled={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {canHandOver ? (
          <DropdownMenuItem onClick={handOver}>
            <Crown /> Make Community Lead
          </DropdownMenuItem>
        ) : null}
        {canRemove ? (
          <DropdownMenuItem variant="destructive" onClick={remove}>
            <UserMinus /> Remove from community
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
