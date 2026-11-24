"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";

type Result<T> = { data: T | null; error: unknown };

/**
 * Runs an Eden API call with a pending state: errors become a toast, success can toast,
 * call back and (by default) refresh the server components on the page.
 */
export function useApiAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  function run<T>(
    call: () => Promise<Result<T>>,
    opts: { success?: string | ((data: T) => string); onDone?: (data: T) => void; refresh?: boolean } = {},
  ) {
    start(async () => {
      const { data, error } = await call();
      if (error) return void toast.error(apiError(error));
      const value = data as T;
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(value) : opts.success);
      opts.onDone?.(value);
      if (opts.refresh !== false) router.refresh();
    });
  }
  return { pending, run };
}

/** The typed API for one space: /api/c/:community/:space/… */
export const spaceApi = (community: string, space: string) => api.c({ community })({ space });
