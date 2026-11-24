import "server-only";
import { render, toPlainText } from "react-email";
import { env } from "@/server/env";

/** True when Lenigo can send its own email through ZeptoMail. */
export const canSendEmail = () => Boolean(env.ZEPTOMAIL_PASSWORD && env.EMAIL_FROM);

/** "Lenigo <hi@x.com>" or "hi@x.com" → ZeptoMail's { address, name }. */
function parseFrom(from: string) {
  const m = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { address: m[2].trim(), name: m[1].replace(/^"|"$/g, "") || "Lenigo" } : { address: from.trim(), name: "Lenigo" };
}

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * Sends one transactional email through the ZeptoMail API. Renders the React Email template to
 * HTML plus a plain-text part. Never throws: callers decide what a failed send means.
 */
export async function sendEmail(opts: {
  to: string;
  toName?: string | null;
  subject: string;
  react: React.ReactElement;
  /** Replies go here instead of the sender (e.g. the person who filled in a form). */
  replyTo?: { address: string; name?: string | null };
}): Promise<SendResult> {
  if (!canSendEmail()) return { ok: false, error: "Email sending isn't set up (ZEPTOMAIL_PASSWORD and EMAIL_FROM)." };
  try {
    const html = await render(opts.react);
    const text = toPlainText(html);
    const res = await fetch(env.ZEPTOMAIL_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Zoho-enczapikey ${env.ZEPTOMAIL_PASSWORD}`,
      },
      body: JSON.stringify({
        from: parseFrom(env.EMAIL_FROM!),
        to: [{ email_address: { address: opts.to, ...(opts.toName ? { name: opts.toName } : {}) } }],
        subject: opts.subject,
        ...(opts.replyTo ? { reply_to: [{ address: opts.replyTo.address, ...(opts.replyTo.name ? { name: opts.replyTo.name } : {}) }] } : {}),
        htmlbody: html,
        textbody: text,
        track_clicks: false, // click tracking rewrites links, which would break one-time invite links
        track_opens: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { error?: { message?: string; details?: { message?: string }[] } } | null;
    const detail = body?.error?.details?.[0]?.message ?? body?.error?.message ?? res.statusText;
    console.error(`[email] ZeptoMail refused the send (${res.status}): ${detail}`);
    return { ok: false, error: `The email service refused the message (${detail}).` };
  } catch (e) {
    console.error("[email] send failed", e);
    return { ok: false, error: "Couldn't reach the email service. Try again in a moment." };
  }
}
