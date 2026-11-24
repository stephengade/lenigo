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
  /**
   * ZeptoMail send-mail token (the SMTP password). When set together with EMAIL_FROM, Lenigo sends
   * its own emails (invites); otherwise invites fall back to a Supabase sign-in code email.
   */
  ZEPTOMAIL_PASSWORD: z
    .string()
    .optional()
    .transform((v) => v?.trim().replace(/^Zoho-enczapikey\s+/i, "") || undefined),
  ZEPTOMAIL_API_URL: z.string().url().default("https://cpaas.zoho.com/v1.1/email"),
  /** Sender, e.g. `Lenigo <hello@example.com>`. The domain must be verified in ZeptoMail. */
  EMAIL_FROM: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /**
   * Supabase secret key (sb_secret_…, never NEXT_PUBLIC_). Optional: it lets the button in an invite
   * email sign the invitee in and accept in one press. Without it they confirm with a code instead.
   */
  SUPABASE_SECRET_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /**
   * Optional, server-only. A scheduler calls /cron/workshop-reminders with
   * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends exactly this). Unset → the route is off.
   */
  CRON_SECRET: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine((v) => !v || v.length >= 24, "CRON_SECRET should be at least 24 characters"),
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
