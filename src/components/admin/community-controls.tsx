"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, apiError } from "@/lib/api";

export function CommunityControls({
  id,
  slug,
  status,
  canSuspend,
  canDelete,
}: {
  id: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  canSuspend: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState("");

  const toggle = () =>
    start(async () => {
      const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      const { error } = await api.admin.communities({ id }).status.patch({ status: next });
      if (error) return void toast.error(apiError(error));
      toast.success(next === "SUSPENDED" ? "Community suspended" : "Community reactivated");
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      const { error } = await api.admin.communities({ id }).delete({ confirmSlug: confirm });
      if (error) return void toast.error(apiError(error));
      toast.success("Community deleted");
      router.push("/admin/communities");
      router.refresh();
    });

  return (
    <>
      {canSuspend ? (
        <Button variant="outline" onClick={toggle} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : status === "ACTIVE" ? <Pause /> : <Play />}
          {status === "ACTIVE" ? "Suspend" : "Reactivate"}
        </Button>
      ) : null}
      {canDelete ? (
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" />}>
            <Trash2 /> Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete /c/{slug}?</DialogTitle>
              <DialogDescription>
                This permanently deletes the community, its spaces, curriculum, submissions, points and memberships. Audit log
                entries are kept. This can&rsquo;t be undone.
              </DialogDescription>
            </DialogHeader>
            <Input placeholder={`Type ${slug} to confirm`} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <DialogFooter>
              <Button variant="destructive" onClick={remove} disabled={pending || confirm !== slug}>
                {pending ? <Loader2 className="animate-spin" /> : null} Delete forever
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
