/**
 * Validation rules shared by the forms (instant, friendly messages) and the server (the real
 * gate: anything a form lets through is checked again there). The browser's own checks are too
 * loose: type="email" accepts "ada@gmail", type="url" accepts "https://x", and minLength
 * counts spaces.
 */

/* ── Email ───────────────────────────────────────────────────────── */

/** something@domain.tld, with a real top-level domain (two or more letters). */
export const EMAIL_PATTERN = /^[A-Za-z0-9._+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function isEmail(value: string): boolean {
  const v = value.trim();
  return v.length <= 254 && EMAIL_PATTERN.test(v) && !v.includes("..") && !/^\.|\.@|@[.-]|-\.|\.-/.test(v);
}

/** Common misspellings of the domains most learners use. */
const TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.om": "gmail.com",
  "yahoo.co": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "icloud.co": "icloud.com",
};

/** "ada@gmail.com" for an obvious domain typo like ada@gmial.com, otherwise null. */
export function emailSuggestion(value: string): string | null {
  const v = value.trim().toLowerCase();
  const at = v.lastIndexOf("@");
  if (at < 1) return null;
  const fix = TYPOS[v.slice(at + 1)];
  return fix ? `${v.slice(0, at)}@${fix}` : null;
}

/** The form message for an email field, or null when it's fine. */
export function emailError(value: string, { required = true } = {}): string | null {
  const v = value.trim();
  if (!v) return required ? "Enter your email address." : null;
  if (!isEmail(v)) return "Enter a full email address, like ada@gmail.com.";
  const fix = emailSuggestion(v);
  return fix ? `Did you mean ${fix}?` : null;
}

/* ── Links ───────────────────────────────────────────────────────── */

/**
 * A normalised https URL, or null. Needs a real domain (a dot and a letter TLD, so "https://x"
 * and "https://localhost" fail), no user:password@ part, and at most 2000 characters.
 */
export function parseHttpsUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v || v.length > 2000 || /\s/.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i.test(u.hostname)) return null;
  return u.toString();
}

/** The form message for a link field, or null when it's fine. */
export function urlError(value: string, { required = false, label = "link" } = {}): string | null {
  const v = value.trim();
  if (!v) return required ? `Add the ${label}.` : null;
  if (/^http:\/\//i.test(v)) return `Use the https:// version of the ${label}.`;
  if (!/^https:\/\//i.test(v)) return `The ${label} must start with https://`;
  return parseHttpsUrl(v) ? null : `That doesn't look like a complete ${label}. Check it opens in your browser.`;
}

/* ── Text and numbers ────────────────────────────────────────────── */

/** Length rules on trimmed text, so a field of spaces doesn't count as filled in. */
export function textError(value: string, { label, min = 0, max, required = min > 0 }: { label: string; min?: number; max?: number; required?: boolean }): string | null {
  const v = value.trim();
  if (!v) return required ? `Add ${label}.` : null;
  if (v.length < min) return `Write at least ${min} characters for ${label}.`;
  if (max && v.length > max) return `Keep ${label} under ${max} characters.`;
  return null;
}

/** Whole-number rules for a number field (empty is allowed unless required). */
export function intError(value: string, { label, min, max, required = false }: { label: string; min: number; max: number; required?: boolean }): string | null {
  const v = value.trim();
  if (!v) return required ? `Enter ${label}.` : null;
  const n = Number(v);
  if (!Number.isInteger(n)) return `${label[0].toUpperCase()}${label.slice(1)} must be a whole number.`;
  if (n < min || n > max) return `${label[0].toUpperCase()}${label.slice(1)} must be between ${min} and ${max}.`;
  return null;
}

/** True when no rule failed. */
export const allValid = (errors: Record<string, string | null>) => Object.values(errors).every((e) => !e);

/* ── Times ───────────────────────────────────────────────────────── */

/** True when `when` is already past (a few minutes' grace, as the server allows). Call it in event handlers. */
export const isPast = (when: Date, graceMs = 5 * 60_000) => when.getTime() < Date.now() - graceMs;
