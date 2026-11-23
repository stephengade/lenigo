"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
