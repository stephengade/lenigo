import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  /**
   * Optional, server-only. When set, a YouTube lesson's length is read from the YouTube Data API
   * instead of trusting the curator's number (the length caps credited watch time).
   */
  YOUTUBE_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /** "true" shows "Continue with GitHub" on the sign-in page. Enable the provider in Supabase first. */
  AUTH_GITHUB_ENABLED: z
    .string()
    .optional()
    .transform((v) => v?.trim().toLowerCase() === "true"),
  /** Comma-separated emails promoted to SUPER_ADMIN on sign-in. Bootstraps the Global House. */
  SUPER_ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
});

type Env = z.infer<typeof schema>;
let cached: Env | undefined;

function load(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment. Copy .env.example to .env and fill it in:\n${missing}`);
  }
  return (cached = parsed.data);
}

/**
 * Validated environment. Checked on first read (not at import), so `next build` can run
 * without runtime secrets such as DATABASE_URL — e.g. in CI or an Amplify build container.
 */
export const env = new Proxy({} as Env, { get: (_, key) => load()[key as keyof Env] });
