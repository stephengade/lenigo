"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, apiError } from "@/lib/api";

export function JoinSpaceButton({
  communitySlug,
  spaceSlug,
  spaceName,
  size,
  className,
}: {
  communitySlug: string;
  spaceSlug: string;
  spaceName: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Button
      size={size}
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { error } = await api.c({ community: communitySlug })({ space: spaceSlug }).join.post();
          if (error) return void toast.error(apiError(error));
          toast.success(`Welcome to ${spaceName}`);
          router.push(`/c/${communitySlug}/${spaceSlug}`);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : null} Join space
    </Button>
  );
}
