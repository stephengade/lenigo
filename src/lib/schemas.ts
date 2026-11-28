import { z } from "zod";
import { emailError, intError, isPast, textError, urlError } from "@/lib/validate";

/**
 * One zod schema per form. Forms use them through react-hook-form's zodResolver; the server
 * routes that take the same input parse with them too. The field rules wrap lib/validate, so the
 * messages are the same everywhere and the server's own checks (parseHttpsUrl, isEmail…) agree.
 *
 * Inputs are strings (that's what form fields hold); the parsed output is cleaned up: text
 * trimmed, empty optional fields as null, numbers as numbers.
 */

/** A string field checked by one of the lib/validate rules. */
const rule = (check: (v: string) => string | null) =>
  z.string().superRefine((v, ctx) => {
    const message = check(v);
    if (message) ctx.addIssue({ code: "custom", message });
  });

/* ── Fields ──────────────────────────────────────────────────────── */

export const emailField = () => rule((v) => emailError(v)).transform((v) => v.trim().toLowerCase());

/** Required text, trimmed; spaces alone don't count. */
export const textField = (label: string, { min = 1, max }: { min?: number; max: number }) =>
  rule((v) => textError(v, { label, min, max, required: true })).transform((v) => v.trim());

/** Optional text: trimmed, and null when left empty. */
export const optionalText = (label: string, max: number) => rule((v) => textError(v, { label, max })).transform((v) => v.trim() || null);

/** A complete https link (null when optional and empty). */
export const urlField = (label: string, { required = false } = {}) => rule((v) => urlError(v, { label, required })).transform((v) => v.trim() || null);

/** A whole number typed into a number field (null when optional and empty). */
export const intField = (label: string, { min, max, required = false }: { min: number; max: number; required?: boolean }) =>
  rule((v) => intError(v, { label, min, max, required })).transform((v) => (v.trim() ? Number(v) : null));

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
const slugField = () =>
  z.string().trim().refine((v) => !v || SLUG.test(v), "Use lowercase letters, numbers and single hyphens (not at the start or end).");

/* ── Sign-in and public forms ────────────────────────────────────── */

export const signInSchema = z.object({ email: emailField() });

export const COMMUNITY_SIZES = ["Under 50", "50–200", "200–1,000", "Over 1,000"] as const;

export const bringSchema = z.object({
  name: textField("your name", { min: 2, max: 80 }),
  email: emailField(),
  communityName: textField("your community's name", { min: 2, max: 120 }),
  location: optionalText("where you are", 120),
  size: z.string().refine((v) => (COMMUNITY_SIZES as readonly string[]).includes(v), "Pick a size."),
  about: textField("what you want to learn", { min: 20, max: 2000 }),
  link: urlField("link"),
  /** Honeypot: people never see it. */
  website: z.string(),
});

/* ── Global House and community admin ────────────────────────────── */

export const provisionSchema = z.object({
  name: textField("the community's name", { min: 2, max: 80 }),
  slug: slugField().refine(Boolean, "Add a URL slug."),
  description: optionalText("the description", 500),
  ownerEmail: emailField(),
});

export const createSpaceSchema = z.object({
  name: textField("the space's name", { min: 2, max: 60 }),
  slug: slugField(),
  description: optionalText("the description", 300),
  joinPolicy: z.enum(["OPEN", "INVITE"]),
});

/** Email invites need an address; link invites take an optional use limit. */
export const inviteSchema = z
  .object({ mode: z.enum(["email", "link"]), email: z.string(), maxUses: z.string(), expiresInDays: z.string() })
  .superRefine((v, ctx) => {
    const message = v.mode === "email" ? emailError(v.email) : intError(v.maxUses, { label: "max uses", min: 1, max: 1000 });
    if (message) ctx.addIssue({ code: "custom", path: [v.mode === "email" ? "email" : "maxUses"], message });
  })
  .transform((v) => ({
    email: v.mode === "email" ? v.email.trim().toLowerCase() : null,
    maxUses: v.mode === "link" && v.maxUses.trim() ? Number(v.maxUses) : null,
    expiresInDays: Number(v.expiresInDays),
  }));

/* ── Learners ────────────────────────────────────────────────────── */

export const onboardingSchema = z.object({
  goalTrackId: z.string().trim().min(1, "Pick the track you want to start with."),
  /** The track's option (stack) slug, e.g. "python-fastapi". Required by the server when the track has options. */
  stack: z.string().trim().max(100).optional(),
  experience: textField("a little about your experience", { min: 10, max: 2000 }),
  links: z.array(urlField("link")).transform((l) => l.filter((x): x is string => !!x)),
  hoursPerWeek: intField("hours per week", { min: 1, max: 80, required: true }).transform((n) => n as number),
});

/** Capstone projects and placement tasks: code link required, live link optional. */
export const projectSchema = z.object({
  repoUrl: urlField("repository link", { required: true }).transform((v) => v as string),
  liveUrl: urlField("live link"),
  notes: optionalText("your notes", 2000),
});

export const profileSchema = z.object({
  name: textField("your name", { min: 2, max: 60 }),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Pick a username.")
    .refine((v) => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(v) && !v.includes("--"), "3–30 lowercase letters, numbers and hyphens, not starting or ending with a hyphen."),
  bio: optionalText("your bio", 280),
  emailNotifications: z.boolean(),
});

export const standupSchema = z.object({
  didToday: textField("what you did today", { min: 10, max: 1500 }),
  nextStep: textField("your next step", { min: 5, max: 600 }),
  blockers: optionalText("blockers", 600),
  moduleId: z.string().transform((v) => v || null),
});

export const commentSchema = z.object({ body: textField("a comment", { max: 1000 }) });

/* ── Mentors and leads ───────────────────────────────────────────── */

/** The score is only required when approving: the approve button checks it separately. */
export const reviewSchema = z.object({
  feedback: textField("feedback the learner can act on", { min: 10, max: 4000 }),
  score: z.string(),
});
export const scoreField = intField("the score", { min: 0, max: 100, required: true });

export const placementReviewSchema = z.object({ feedback: textField("feedback the learner can act on", { min: 10, max: 2000 }) });

export const promoteSchema = z.object({ reason: textField("a reason the learner will see", { min: 10, max: 500 }) });

export const addTrackSchema = z.object({ trackId: z.string().trim().min(1, "Pick a track."), note: optionalText("the note", 300) });

export const workshopSchema = z
  .object({
    title: textField("a title", { min: 3, max: 120 }),
    kind: z.enum(["WORKSHOP", "STANDUP_REVIEW"]),
    type: z.enum(["ONLINE_CALL", "PHYSICAL"]),
    startsAt: z.string(),
    endsAt: z.string(),
    meetingUrl: z.string(),
    venue: z.string(),
    agendaMd: optionalText("the agenda", 4000),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    const start = v.startsAt ? new Date(v.startsAt) : null;
    const end = v.endsAt ? new Date(v.endsAt) : null;
    if (!start || Number.isNaN(start.getTime())) issue("startsAt", "Pick when it starts.");
    else if (isPast(start)) issue("startsAt", "That time has already passed.");
    if (start && end && !Number.isNaN(end.getTime()) && end <= start) issue("endsAt", "The end must be after the start.");
    if (v.type === "ONLINE_CALL") {
      const m = urlError(v.meetingUrl, { required: true, label: "call link" });
      if (m) issue("meetingUrl", m);
    } else {
      const m = textError(v.venue, { label: "the venue", min: 2, max: 200 });
      if (m) issue("venue", m);
    }
  })
  .transform((v) => ({
    title: v.title,
    kind: v.kind,
    type: v.type,
    startsAt: new Date(v.startsAt).toISOString(),
    endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null,
    meetingUrl: v.type === "ONLINE_CALL" ? v.meetingUrl.trim() : null,
    venue: v.type === "PHYSICAL" ? v.venue.trim() : null,
    agendaMd: v.agendaMd,
  }));

/* ── Curriculum editor ───────────────────────────────────────────── */

export const trackSchema = z.object({
  title: textField("the track's name", { min: 2, max: 80 }),
  description: optionalText("the description", 500),
});

export const trackSettingsSchema = trackSchema.extend({
  prerequisiteTrackId: z.string(),
  prerequisiteTier: z.string(),
  placementTaskMd: optionalText("the practical task", 8000),
});

export const nameSchema = (label: string, max: number) => z.object({ title: textField(label, { min: 2, max }) });

export const moduleSchema = z.object({
  title: textField("the module's name", { min: 2, max: 100 }),
  summary: optionalText("the summary", 500),
  projectBriefMd: optionalText("the project brief", 10000),
  branchId: z.string().transform((v) => v || null),
});

/** A video needs a YouTube/Drive/https link and a length; a learn-more link only an https link. */
export const resourceSchema = (isVideoSource: (url: string) => boolean) =>
  z
    .object({
      type: z.enum(["VIDEO", "ARTICLE"]),
      url: z.string(),
      title: textField("a title", { min: 2, max: 160 }),
      sourceName: optionalText("the creator", 80),
      minutes: z.string(),
    })
    .superRefine((v, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!(v.type === "VIDEO" && isVideoSource(v.url))) {
        const m = urlError(v.url, { required: true, label: "link" });
        if (m) issue("url", m);
      }
      const mins = Number(v.minutes);
      if (v.type === "VIDEO" && !v.minutes.trim()) issue("minutes", "Enter the video's length in minutes.");
      else if (v.minutes.trim() && (!Number.isFinite(mins) || mins <= 0 || mins > 600)) issue("minutes", "Enter a length between 0.5 and 600 minutes.");
    })
    .transform((v) => ({ type: v.type, url: v.url.trim(), title: v.title, sourceName: v.sourceName, minutes: v.minutes.trim() ? Number(v.minutes) : null }));

export const checkpointSchema = z.object({
  title: textField("the checkpoint's name", { min: 2, max: 120 }),
  afterResourceId: z.string().transform((v) => v || null),
  passThreshold: intField("the pass mark", { min: 50, max: 100, required: true }).transform((n) => n as number),
});

/** Blank answers are dropped and the correct index remapped; the correct one must be filled in. */
export const questionSchema = z
  .object({
    prompt: textField("the question", { min: 3, max: 1000 }),
    codeSnippet: optionalText("the code", 4000),
    options: z.array(z.string().max(300, "Keep each answer under 300 characters.")),
    correct: z.number().int(),
    explanation: optionalText("the explanation", 1000),
  })
  .superRefine((v, ctx) => {
    const kept = v.options.map((o) => o.trim()).filter(Boolean);
    const message =
      kept.length < 2
        ? "Fill in at least two answers."
        : new Set(kept.map((o) => o.toLowerCase())).size !== kept.length
          ? "Each answer must be different."
          : !v.options[v.correct]?.trim()
            ? "The answer marked correct is empty. Pick a filled-in one."
            : null;
    if (message) ctx.addIssue({ code: "custom", path: ["options"], message });
  })
  .transform((v) => {
    const filled = v.options.map((o) => o.trim());
    const kept = filled.filter(Boolean);
    return { prompt: v.prompt, codeSnippet: v.codeSnippet, options: kept, correctOptionIndex: kept.indexOf(filled[v.correct]), explanation: v.explanation };
  });

/** A new module: its name, and which option it belongs to ("" = core, everyone). */
export const addModuleSchema = z.object({
  title: textField("the module's name", { min: 2, max: 100 }),
  branchId: z.string().transform((v) => v || null),
});
