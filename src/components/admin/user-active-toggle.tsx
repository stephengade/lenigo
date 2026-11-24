"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, apiError } from "@/lib/api";

/** Super Admin only: block (or restore) someone's access to the whole platform. Nothing is deleted. */
export function UserActiveToggle({ userId, name, deactivated }: { userId: string; name: string; deactivated: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    const msg = deactivated
      ? `Reactivate ${name}? They can sign in again and get their communities, roles and history back.`
      : `Deactivate ${name}? They're signed out of Lenigo and can't sign in until you reactivate them. Their memberships and history are kept.`;
    if (!confirm(msg)) return;
    start(async () => {
      const { error } = await api.admin.users({ id: userId }).active.patch({ active: deactivated });
      if (error) return void toast.error(apiError(error));
      toast.success(deactivated ? `${name} reactivated` : `${name} deactivated`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant={deactivated ? "outline" : "ghost"} onClick={toggle} disabled={pending} className={deactivated ? "" : "text-destructive"}>
      {pending ? <Loader2 className="animate-spin" /> : deactivated ? <UserCheck /> : <UserX />}
      {deactivated ? "Reactivate" : "Deactivate"}
    </Button>
  );
}
