import { treaty } from "@elysiajs/eden";
import type { App } from "@/server/api/app";

/** Typed client for the Elysia API. Use from Client Components; Server Components call services directly. */
export const api = treaty<App>(typeof window === "undefined" ? (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") : window.location.origin, {
  fetch: { credentials: "same-origin" },
}).api;

/** Pull a readable message out of an Eden error. */
export function apiError(error: unknown, fallback = "Something went wrong.") {
  const value = (error as { value?: unknown } | null)?.value;
  if (value && typeof value === "object" && "error" in value && typeof (value as { error: unknown }).error === "string") {
    return (value as { error: string }).error;
  }
  if (typeof value === "string" && value) return value;
  return fallback;
}
