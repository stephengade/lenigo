"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copies the profile's address; uses the phone's share sheet when there is one. */
export function ShareProfile({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const url = window.location.href.split(/[?#]/)[0];
        if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
          try {
            await navigator.share({ title: `${name} on Lenigo`, url });
            return;
          } catch {
            // Closed the share sheet: fall through to copying.
          }
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("Couldn't copy. Copy the address from your browser instead.");
        }
      }}
    >
      {copied ? <Check /> : <Link2 />} {copied ? "Link copied" : "Share"}
    </Button>
  );
}
