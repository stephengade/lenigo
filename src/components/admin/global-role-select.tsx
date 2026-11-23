"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, apiError } from "@/lib/api";
import { GLOBAL_ROLES, ROLE_LABEL, type GlobalRole } from "@/lib/permissions";

export function GlobalRoleSelect({ userId, role }: { userId: string; role: GlobalRole }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(v) => {
        const to = v as GlobalRole;
        if (to === role) return;
        if (to === "SUPER_ADMIN" && !confirm("Super Admins can override every community and change anyone's global role. Continue?")) return;
        start(async () => {
          const { error } = await api.admin.users({ id: userId }).role.patch({ role: to });
          if (error) return void toast.error(apiError(error));
          toast.success(`Global role set to ${ROLE_LABEL[to]}`);
          router.refresh();
        });
      }}
    >
      <SelectTrigger size="sm" className="w-36" aria-label="Global role">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        <SelectValue>{(v: GlobalRole) => ROLE_LABEL[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {GLOBAL_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
