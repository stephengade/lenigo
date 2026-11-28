/**
 * End-to-end scenarios: drives the real services as every role against a throwaway Postgres.
 * Run with `pnpm test:scenarios` (tests/scenarios/run.mjs sets up the database and a fake mailer).
 * The pool is a SINGLE connection: any query that escapes its transaction would hang here.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
(globalThis as { __lenigoSql?: unknown }).__lenigoSql = postgres(url, { prepare: false, max: 1, fetch_types: false, onnotice: () => {} });

const { db } = await import("@/server/db");
const S = await import("@/server/db/schema");
const curriculum = await import("@/server/services/curriculum");
const learning = await import("@/server/services/learning");
const placement = await import("@/server/services/placement");
const review = await import("@/server/services/review");
const social = await import("@/server/services/social");
const workshops = await import("@/server/services/workshops");
const profiles = await import("@/server/services/profiles");
const { sql, eq, and } = await import("drizzle-orm");
type MemberAccess = import("@/server/auth/access").MemberAccess;

let pass = 0;
let failCount = 0;
const failures: string[] = [];
async function ok<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const r = await withTimeout(fn());
    pass++;
    console.log("  ✓", name);
    return r;
  } catch (e) {
    failCount++;
    failures.push(`${name}: ${msg(e)}`);
    console.log("  ✗", name, "→", msg(e));
  }
}
async function refuses(name: string, fn: () => Promise<unknown>, pattern: RegExp) {
  try {
    await withTimeout(fn());
    failCount++;
    failures.push(`${name}: expected refusal, got success`);
    console.log("  ✗", name, "→ expected refusal, but it succeeded");
  } catch (e) {
    if (pattern.test(msg(e))) {
      pass++;
      console.log("  ✓", name, `(refused: ${msg(e).slice(0, 80)})`);
    } else {
      failCount++;
      failures.push(`${name}: wrong error ${msg(e)}`);
      console.log("  ✗", name, "→ wrong error:", msg(e));
    }
  }
}
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log("  ✓", name);
  } else {
    failCount++;
    failures.push(`${name} ${detail}`);
    console.log("  ✗", name, detail);
  }
}
function msg(e: unknown): string {
  const x = e as { message?: string; cause?: { message?: string } };
  return x?.cause?.message ?? x?.message ?? String(e);
}
function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("TIMEOUT (query outside its transaction?)")), ms))]);
}

/* ── Seed: users, community, space, roles ───────────────────────── */
const uid = () => crypto.randomUUID();
const U = { lead: uid(), owner: uid(), manager: uid(), mentor: uid(), a: uid(), b: uid(), outsider: uid() };
await db.insert(S.users).values(
  Object.entries(U).map(([k, id]) => ({ id, email: `${k}@example.test`, name: k[0].toUpperCase() + k.slice(1), username: `user-${k}` })),
);
const [community] = await db.insert(S.communities).values({ slug: "gdg-test", name: "GDG Test", timezone: "Africa/Lagos" }).returning();
const [space] = await db.insert(S.spaces).values({ communityId: community.id, slug: "web-dev", name: "Web Development" }).returning();
const [other] = await db.insert(S.spaces).values({ communityId: community.id, slug: "data", name: "Data" }).returning();
await db.insert(S.communityMembers).values([
  { communityId: community.id, userId: U.owner, role: "OWNER" },
  ...[U.lead, U.manager, U.mentor, U.a, U.b].map((userId) => ({ communityId: community.id, userId, role: "MEMBER" as const })),
]);
await db.insert(S.spaceMembers).values([
  { spaceId: space.id, communityId: community.id, userId: U.lead, role: "LEAD" },
  { spaceId: space.id, communityId: community.id, userId: U.manager, role: "MANAGER" },
  { spaceId: space.id, communityId: community.id, userId: U.mentor, role: "MENTOR" },
  { spaceId: space.id, communityId: community.id, userId: U.a, role: "MEMBER" },
  { spaceId: space.id, communityId: community.id, userId: U.b, role: "MEMBER" },
]);
const users = Object.fromEntries((await db.select().from(S.users)).map((u) => [u.id, u]));
const as = (userId: string, role: MemberAccess["spaceRole"], membership: MemberAccess["spaceMembershipRole"] = role, sp = space): MemberAccess => ({
  user: users[userId],
  community,
  membershipRole: userId === U.owner ? "OWNER" : "MEMBER",
  role: userId === U.owner ? "OWNER" : "MEMBER",
  isOverride: false,
  space: sp,
  spaceMembershipRole: membership,
  spaceRole: role,
});
const lead = as(U.lead, "LEAD");
const owner = as(U.owner, "LEAD", null); // community Owner: Lead through the community, not a space member
const manager = as(U.manager, "MANAGER");
const mentor = as(U.mentor, "MENTOR");
const A = as(U.a, "MEMBER");
const B = as(U.b, "MEMBER");
const crossSpace = as(U.lead, "LEAD", "LEAD", other);

console.log("\nCurriculum builder");
await refuses("a Mentor can't create a track", () => curriculum.createTrack(mentor, { title: "Frontend" }), /Only Leads and Managers/);
await refuses("a learner can't create a track", () => curriculum.createTrack(A, { title: "Frontend" }), /Only Leads and Managers/);
const fe = (await ok("Lead creates Frontend (3 levels)", () => curriculum.createTrack(lead, { title: "Frontend", description: "HTML to production" })))!;
const fs = (await ok("Manager creates Fullstack", () => curriculum.createTrack(manager, { title: "Fullstack" })))!;
const ed = (await ok("track editor loads", () => curriculum.getTrackEditor(lead, fe.id)))!;
check("three levels in order", ed.levels.map((l) => l.tier).join() === "BEGINNER,INTERMEDIATE,ADVANCED");
const [lvB, lvI] = ed.levels;
await refuses("another space can't read this track", () => curriculum.getTrackEditor(crossSpace, fe.id), /not found/i);
await ok("rename a level", () => curriculum.updateLevel(lead, lvB.id, { title: "HTML, CSS & JS" }));
await refuses("can't publish a track with no published first level", () => curriculum.updateTrack(lead, fe.id, { isPublished: true }), /Publish the first level/);

const m1 = (await ok("create module 1", () => curriculum.createModule(lead, lvB.id, { title: "The web, HTML and CSS" })))!;
const m2 = (await ok("create module 2", () => curriculum.createModule(lead, lvB.id, { title: "JavaScript basics" })))!;
const v1 = (await ok("add a YouTube video (10 min)", () => curriculum.addResource(lead, m1.id, { type: "VIDEO", title: "HTML crash course", url: "https://youtu.be/dQw4w9WgXcQ", minutes: 10 })))!;
check("YouTube id stored, URL rebuilt", v1.providerId === "dQw4w9WgXcQ" && v1.url === "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
await refuses("javascript: links are refused", () => curriculum.addResource(lead, m1.id, { type: "ARTICLE", title: "Bad link", url: "javascript:alert(1)" }), /https/);
await refuses("a video needs a length", () => curriculum.addResource(lead, m1.id, { type: "VIDEO", title: "No length", url: "https://youtu.be/dQw4w9WgXcQ" }), /length/);
await ok("add an article", () => curriculum.addResource(lead, m1.id, { type: "ARTICLE", title: "MDN HTML", url: "https://developer.mozilla.org/en-US/docs/Web/HTML", minutes: 5 }));
await refuses("can't publish without a brief", () => curriculum.updateModule(lead, m1.id, { isPublished: true }), /brief/);
await ok("write the brief", () => curriculum.updateModule(lead, m1.id, { projectBriefMd: "# Build a profile page\n- semantic HTML" }));
await refuses("can't publish without a checkpoint", () => curriculum.updateModule(lead, m1.id, { isPublished: true }), /checkpoint/);
const cp1 = (await ok("add checkpoint after the video", () => curriculum.addCheckpoint(lead, m1.id, { title: "HTML basics", afterResourceId: v1.id, passThreshold: 80 })))!;
await refuses("can't publish with an empty checkpoint", () => curriculum.updateModule(lead, m1.id, { isPublished: true }), /no questions/);
await ok("add question 1", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Which tag is a heading?", options: ["<p>", "<h1>", "<div>"], correctOptionIndex: 1, explanation: "h1–h6 are headings" }));
await ok("add question 2", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Is CSS a language for styling?", options: ["Yes", "No"], correctOptionIndex: 0 }));
await refuses("duplicate options refused", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Dup?", options: ["a", "a"], correctOptionIndex: 0 }), /different/);
await ok("publish module 1", () => curriculum.updateModule(lead, m1.id, { isPublished: true }));
await ok("module 2 gets a brief + checkpoint + question and is published", async () => {
  await curriculum.updateModule(lead, m2.id, { projectBriefMd: "Build a todo app" });
  const c = await curriculum.addCheckpoint(lead, m2.id, { title: "JS" });
  await curriculum.addQuestion(lead, c.id, { prompt: "typeof 1?", options: ["number", "string"], correctOptionIndex: 0 });
  await curriculum.updateModule(lead, m2.id, { isPublished: true });
});
await ok("publish level 1 and the track", async () => {
  await curriculum.updateLevel(lead, lvB.id, { isPublished: true });
  await curriculum.updateTrack(lead, fe.id, { isPublished: true });
});
// Intermediate: core + two options
const core = (await ok("intermediate core module", () => curriculum.createModule(lead, lvI.id, { title: "Components and state" })))!;
const react = (await ok("option React + Next", () => curriculum.createBranch(lead, lvI.id, { title: "React + Next.js" })))!;
const vue = (await ok("option Vue + Nuxt", () => curriculum.createBranch(lead, lvI.id, { title: "Vue + Nuxt" })))!;
const rm = (await ok("React-only module", () => curriculum.createModule(lead, lvI.id, { title: "Next.js app router", branchId: react.id })))!;
await refuses("a branch from another level is refused", () => curriculum.createModule(lead, lvB.id, { title: "Wrong level", branchId: react.id }), /another level/);
await ok("publish intermediate modules and level", async () => {
  for (const m of [core, rm]) {
    await curriculum.updateModule(lead, m.id, { projectBriefMd: "Build it" });
    const c = await curriculum.addCheckpoint(lead, m.id, { title: "Check" });
    await curriculum.addQuestion(lead, c.id, { prompt: "Which one?", options: ["a", "b"], correctOptionIndex: 0 });
    await curriculum.updateModule(lead, m.id, { isPublished: true });
  }
  await curriculum.updateLevel(lead, lvI.id, { isPublished: true });
});
// Fullstack needs Frontend Intermediate
await ok("Fullstack requires Frontend Intermediate", () => curriculum.updateTrack(lead, fs.id, { prerequisiteTrackId: fe.id, prerequisiteTier: "INTERMEDIATE" }));
await refuses("no prerequisite cycles", () => curriculum.updateTrack(lead, fe.id, { prerequisiteTrackId: fs.id }), /already requires/);
await ok("publish Fullstack", async () => {
  const e = await curriculum.getTrackEditor(lead, fs.id);
  const m = await curriculum.createModule(lead, e.levels[0].id, { title: "Auth" });
  await curriculum.updateModule(lead, m.id, { projectBriefMd: "x" });
  const c = await curriculum.addCheckpoint(lead, m.id, { title: "Check" });
  await curriculum.addQuestion(lead, c.id, { prompt: "Which one?", options: ["a", "b"], correctOptionIndex: 0 });
  await curriculum.updateModule(lead, m.id, { isPublished: true });
  await curriculum.updateLevel(lead, e.levels[0].id, { isPublished: true });
  await curriculum.updateTrack(lead, fs.id, { isPublished: true });
});

console.log("\nOnboarding and enrolment");
await refuses("can't start with a track that has a prerequisite", () => learning.completeOnboarding(B, { goalTrackId: fs.id, experience: "Some HTML at school", links: [], hoursPerWeek: 5 }), /prerequisite/);
await refuses("intake links must be https", () => learning.completeOnboarding(A, { goalTrackId: fe.id, experience: "Built a site", links: ["http://x.com"], hoursPerWeek: 5 }), /https/);
const onA = await ok("learner A onboards into Frontend", () => learning.completeOnboarding(A, { goalTrackId: fe.id, experience: "I built a portfolio once", links: ["https://github.com/a"], hoursPerWeek: 8 }));
check("A is enrolled", !!onA?.enrolled);
await ok("learner B onboards into Frontend", () => learning.completeOnboarding(B, { goalTrackId: fe.id, experience: "I know HTML and CSS well", links: [], hoursPerWeek: 10 }));
const eA = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.userId, U.a)))[0];
const eB = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.userId, U.b)))[0];
await refuses("DB: learner can't self-enrol in a second track", () => db.insert(S.trackEnrollments).values({ trackId: fs.id, spaceId: space.id, communityId: community.id, userId: U.a }), /approval|prerequisite/);
await refuses("DB: a learner can't raise their own tier", () => db.update(S.trackEnrollments).set({ tier: "ADVANCED" }).where(eq(S.trackEnrollments.id, eA.id)), /recorded promotion/);

console.log("\nRoadmap and locks");
let pA = (await ok("A's progress loads", () => learning.loadTrackProgress({ trackId: fe.id, userId: U.a, enrollment: eA, preview: false })))!;
const allA = () => pA.levels.flatMap((l) => l.modules);
check("module 1 open and active", pA.activeModuleId === m1.id && !allA().find((m) => m.id === m1.id)!.locked);
check("module 2 locked", allA().find((m) => m.id === m2.id)!.locked);
check("intermediate hidden from a beginner", !pA.levels.find((l) => l.tier === "INTERMEDIATE")!.reachable && pA.levels.find((l) => l.tier === "INTERMEDIATE")!.modules.length === 0);
await refuses("A can't open module 2's checkpoint (no skipping)", async () => {
  const [c] = await db.select().from(S.checkpoints).where(eq(S.checkpoints.moduleId, m2.id));
  return learning.submitCheckpoint(A, c.id, [0]);
}, /No skipping|previous module|before this one/);
const ws = (await ok("workspace loads for A", () => learning.getModuleWorkspace(A, m1.id)))!;
check("answer keys never reach learners", ws.checkpoints.every((c) => c.questions.every((q) => !("correctOptionIndex" in q))));
const wsMentor = (await ok("mentor preview loads", () => learning.getModuleWorkspace(mentor, m1.id)))!;
check("mentor preview shows keys", wsMentor.preview && wsMentor.checkpoints[0].questions.every((q) => "correctOptionIndex" in q));
await refuses("an outsider can't open it", () => learning.getModuleWorkspace(as(U.outsider, "MEMBER"), m1.id), /Join this track/);

console.log("\nValidation rules (lib/validate)");
const V = await import("@/lib/validate");
for (const [e, ok] of [["ada@gmail.com", true], ["a.b+c@oauife.edu.ng", true], ["ada@gmail", false], ["ada@.com", false], ["ada@gmail..com", false], ["ada.@gmail.com", false], ["ada gmail.com", false], ["", false]] as const)
  check(`isEmail(${JSON.stringify(e)}) is ${ok}`, V.isEmail(e) === ok);
check("gmial.com → Did you mean gmail.com?", V.emailError("ada@gmial.com") === "Did you mean ada@gmail.com?");
for (const [u, ok] of [["https://github.com/a/b", true], ["https://my-app.vercel.app", true], ["http://github.com", false], ["https://github", false], ["https://localhost:3000", false], ["javascript:alert(1)", false], ["https://me:pw@github.com", false], ["https://git hub.com", false]] as const)
  check(`parseHttpsUrl(${JSON.stringify(u)}) ${ok ? "accepts" : "refuses"}`, !!V.parseHttpsUrl(u) === ok);
check("blank text doesn't count as filled in", V.textError("          ", { label: "feedback", min: 10 }) === "Add feedback.");
check("numbers must be whole and in range", V.intError("2.5", { label: "hours", min: 1, max: 80 }) !== null && V.intError("81", { label: "hours", min: 1, max: 80 }) !== null && V.intError("8", { label: "hours", min: 1, max: 80 }) === null);
await refuses("a blank quiz option is refused (it would shift the answer key)", () => curriculum.addQuestion(lead, cp1.id, { prompt: "Which is right?", options: ["A", "", "C"], correctOptionIndex: 2 }), /every answer option/);

console.log("\nForm schemas (lib/schemas): required vs optional");
{
  const Z = await import("@/lib/schemas");
  type Parsed = { success: boolean; data?: unknown; error?: { issues: { path: PropertyKey[]; message: string }[] } };
  const parse = (schema: { safeParse: (v: unknown) => Parsed }, v: unknown) => schema.safeParse(v);
  /** The field paths a parse refused, e.g. ["email", "links.1"]. */
  const failed = (r: Parsed) => (r.success ? [] : r.error!.issues.map((i) => i.path.join(".")));
  const tested = new Set<string>();
  /** A schema with: one valid input, its optional fields (must pass empty, come out null) and required ones (must fail empty or blank). */
  const suite = (
    name: string,
    schema: { safeParse: (v: unknown) => Parsed },
    valid: Record<string, unknown>,
    opts: { optional?: string[]; required?: string[]; out?: (d: Record<string, unknown>) => boolean },
  ) => {
    tested.add(name);
    const ok = parse(schema, valid);
    check(`${name}: a complete valid form passes`, ok.success, JSON.stringify(ok.error?.issues ?? []));
    if (ok.success && opts.out) check(`${name}: output is cleaned up`, opts.out(ok.data as Record<string, unknown>), JSON.stringify(ok.data));
    for (const f of opts.optional ?? []) {
      const r = parse(schema, { ...valid, [f]: "" });
      check(`${name}: optional "${f}" may be left empty`, r.success, JSON.stringify(failed(r)));
      if (r.success) check(`${name}: empty "${f}" comes out as null`, (r.data as Record<string, unknown>)[f] === null, JSON.stringify((r.data as Record<string, unknown>)[f]));
    }
    for (const f of opts.required ?? []) {
      const empty = parse(schema, { ...valid, [f]: "" });
      check(`${name}: required "${f}" can't be empty`, !empty.success && failed(empty).includes(f), JSON.stringify(failed(empty)));
      const blank = parse(schema, { ...valid, [f]: "    " });
      check(`${name}: "${f}" of only spaces is refused`, !blank.success && failed(blank).includes(f), JSON.stringify(failed(blank)));
    }
  };

  suite("signInSchema", Z.signInSchema, { email: "  Ada@Gmail.com " }, { required: ["email"], out: (d) => d.email === "ada@gmail.com" });
  check("signInSchema: ada@gmail is refused", failed(parse(Z.signInSchema, { email: "ada@gmail" })).includes("email"));

  const bring = { name: "Ada", email: "ada@gmail.com", communityName: "GDG OAU", location: "Ile-Ife", size: "50–200", about: "Weekly web dev sessions on campus.", link: "https://gdg.community.dev/oau", website: "" };
  suite("bringSchema", Z.bringSchema, bring, { optional: ["location", "link"], required: ["name", "email", "communityName", "about"] });
  check("bringSchema: the honeypot may stay empty", parse(Z.bringSchema, bring).success);
  check("bringSchema: a size must be picked", failed(parse(Z.bringSchema, { ...bring, size: "" })).includes("size"));

  suite("provisionSchema", Z.provisionSchema, { name: "GDG OAU", slug: "gdg-oau", description: "GDG at OAU", ownerEmail: "lead@example.com" }, { optional: ["description"], required: ["name", "ownerEmail"] });
  check("provisionSchema: a slug is required", failed(parse(Z.provisionSchema, { name: "GDG OAU", slug: "", description: "", ownerEmail: "lead@example.com" })).includes("slug"));
  check("provisionSchema: a bad slug is refused", failed(parse(Z.provisionSchema, { name: "GDG OAU", slug: "-Bad Slug", description: "", ownerEmail: "lead@example.com" })).includes("slug"));

  const space = { name: "Web Development", slug: "web-development", description: "Build for the web", joinPolicy: "OPEN" };
  suite("createSpaceSchema", Z.createSpaceSchema, space, { optional: ["description"], required: ["name"] });
  check("createSpaceSchema: the slug may be left empty (made from the name)", parse(Z.createSpaceSchema, { ...space, slug: "" }).success);

  const inv = (v: Record<string, string>) => parse(Z.inviteSchema, { mode: "email", email: "", maxUses: "", expiresInDays: "14", ...v });
  tested.add("inviteSchema");
  check("inviteSchema: an email invite needs an address", failed(inv({})).includes("email"));
  check("inviteSchema: …a full one", failed(inv({ email: "ada@gmail" })).includes("email"));
  check("inviteSchema: a valid email invite passes", inv({ email: "ada@gmail.com" }).success);
  check("inviteSchema: a link invite needs no address and no limit", inv({ mode: "link" }).success && (inv({ mode: "link" }).data as { maxUses: unknown }).maxUses === null);
  check("inviteSchema: a link's use limit must be 1–1000", failed(inv({ mode: "link", maxUses: "0" })).includes("maxUses") && failed(inv({ mode: "link", maxUses: "2.5" })).includes("maxUses"));
  check("inviteSchema: the address isn't checked for link invites", inv({ mode: "link", email: "junk" }).success);

  const onboard = { goalTrackId: "t1", experience: "I built a portfolio site.", links: ["https://github.com/ada", "", ""], hoursPerWeek: "6" };
  suite("onboardingSchema", Z.onboardingSchema, onboard, { required: ["goalTrackId", "experience", "hoursPerWeek"], out: (d) => d.hoursPerWeek === 6 && JSON.stringify(d.links) === '["https://github.com/ada"]' });
  check("onboardingSchema: all three links may be empty", parse(Z.onboardingSchema, { ...onboard, links: ["", "", ""] }).success);
  check("onboardingSchema: a bad link is pinned to its own box", failed(parse(Z.onboardingSchema, { ...onboard, links: ["", "https://github", ""] })).includes("links.1"));

  suite("projectSchema", Z.projectSchema, { repoUrl: "https://github.com/ada/site", liveUrl: "https://ada.dev", notes: "Try it on a phone" }, { optional: ["liveUrl", "notes"], required: ["repoUrl"] });
  check("projectSchema: http:// is refused", failed(parse(Z.projectSchema, { repoUrl: "http://github.com/a/b", liveUrl: "", notes: "" })).includes("repoUrl"));

  const prof = { name: "Ada Lovelace", username: "Ada-L", bio: "Learning React", emailNotifications: false };
  suite("profileSchema", Z.profileSchema, prof, { optional: ["bio"], required: ["name", "username"], out: (d) => d.username === "ada-l" && d.emailNotifications === false });
  check("profileSchema: a bad username is refused", failed(parse(Z.profileSchema, { ...prof, username: "-x" })).includes("username"));

  suite("standupSchema", Z.standupSchema, { didToday: "Finished the flexbox lesson.", nextStep: "Start grid", blockers: "None", moduleId: "" }, { optional: ["blockers"], required: ["didToday", "nextStep"], out: (d) => d.moduleId === null });
  suite("commentSchema", Z.commentSchema, { body: "Nice work!" }, { required: ["body"] });
  suite("reviewSchema", Z.reviewSchema, { feedback: "Clean layout, add alt text.", score: "" }, { required: ["feedback"] });
  check("scoreField: required to approve, 0–100, whole", !Z.scoreField.safeParse("").success && !Z.scoreField.safeParse("101").success && !Z.scoreField.safeParse("7.5").success && Z.scoreField.safeParse("80").data === 80);
  tested.add("scoreField");
  suite("placementReviewSchema", Z.placementReviewSchema, { feedback: "Strong task, ready for Intermediate." }, { required: ["feedback"] });
  suite("promoteSchema", Z.promoteSchema, { reason: "Finished every Beginner module." }, { required: ["reason"] });
  suite("addTrackSchema", Z.addTrackSchema, { trackId: "t2", note: "Ready for backend" }, { optional: ["note"], required: ["trackId"] });

  const soon = new Date(Date.now() + 86_400_000);
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const ws = { title: "Intro to Git", kind: "WORKSHOP", type: "ONLINE_CALL", startsAt: local(soon), endsAt: "", meetingUrl: "https://meet.google.com/abc-defg-hij", venue: "", agendaMd: "" };
  suite("workshopSchema", Z.workshopSchema, ws, { optional: ["endsAt", "agendaMd"], required: ["title", "startsAt", "meetingUrl"] });
  check("workshopSchema: online needs no venue", parse(Z.workshopSchema, ws).success);
  check("workshopSchema: in person needs a venue, not a link", failed(parse(Z.workshopSchema, { ...ws, type: "PHYSICAL", meetingUrl: "" })).join() === "venue" && parse(Z.workshopSchema, { ...ws, type: "PHYSICAL", meetingUrl: "", venue: "Hall B" }).success);
  check("workshopSchema: the start can't be in the past", failed(parse(Z.workshopSchema, { ...ws, startsAt: local(new Date(Date.now() - 3_600_000)) })).includes("startsAt"));
  check("workshopSchema: the end must come after the start", failed(parse(Z.workshopSchema, { ...ws, endsAt: local(new Date(soon.getTime() - 60_000)) })).includes("endsAt"));

  suite("trackSchema", Z.trackSchema, { title: "Frontend", description: "HTML to React" }, { optional: ["description"], required: ["title"] });
  suite("trackSettingsSchema", Z.trackSettingsSchema, { title: "Frontend", description: "", prerequisiteTrackId: "", prerequisiteTier: "INTERMEDIATE", placementTaskMd: "" }, { optional: ["description", "placementTaskMd"], required: ["title"] });
  suite("nameSchema", Z.nameSchema("the level's name", 60), { title: "Beginner" }, { required: ["title"] });
  suite("addModuleSchema", Z.addModuleSchema, { title: "HTML basics", branchId: "" }, { required: ["title"], out: (d) => d.branchId === null });
  suite("moduleSchema", Z.moduleSchema, { title: "HTML basics", summary: "Tags", projectBriefMd: "Build a page", branchId: "" }, { optional: ["summary", "projectBriefMd"], required: ["title"] });

  const lesson = Z.resourceSchema((u) => !!V.parseHttpsUrl(u) && u.includes("youtube"));
  const vid = { type: "VIDEO", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "HTML crash course", sourceName: "", minutes: "12" };
  suite("resourceSchema", lesson, vid, { optional: ["sourceName"], required: ["url", "title"], out: (d) => d.minutes === 12 });
  check("resourceSchema: a video needs its length", failed(parse(lesson, { ...vid, minutes: "" })).includes("minutes"));
  check("resourceSchema: an article's reading time is optional", parse(lesson, { ...vid, type: "ARTICLE", url: "https://developer.mozilla.org/en-US/", minutes: "" }).success);

  suite("checkpointSchema", Z.checkpointSchema, { title: "Flexbox basics", afterResourceId: "", passThreshold: "80" }, { required: ["title", "passThreshold"], out: (d) => d.passThreshold === 80 && d.afterResourceId === null });
  check("checkpointSchema: pass mark stays within 50–100", failed(parse(Z.checkpointSchema, { title: "Quiz", afterResourceId: "", passThreshold: "40" })).includes("passThreshold"));

  const q = { prompt: "What does HTML stand for?", codeSnippet: "", options: ["HyperText Markup Language", "", "Home Tool", ""], correct: 0, explanation: "" };
  suite("questionSchema", Z.questionSchema, q, { optional: ["codeSnippet", "explanation"], required: ["prompt"], out: (d) => JSON.stringify(d.options) === '["HyperText Markup Language","Home Tool"]' && d.correctOptionIndex === 0 });
  check("questionSchema: blank answers are dropped and the right one remapped", (parse(Z.questionSchema, { ...q, correct: 2 }).data as { correctOptionIndex: number }).correctOptionIndex === 1);
  check("questionSchema: a blank answer can't be the correct one", failed(parse(Z.questionSchema, { ...q, correct: 1 })).includes("options"));
  check("questionSchema: at least two answers", failed(parse(Z.questionSchema, { ...q, options: ["Only one", "", "", ""] })).includes("options"));
  check("questionSchema: answers must differ", failed(parse(Z.questionSchema, { ...q, options: ["Same", "same", "", ""] })).includes("options"));

  // Guard: a schema added to lib/schemas without tests here fails the run.
  const exported = Object.entries(Z).filter(([k, v]) => (k.endsWith("Schema") || k === "scoreField") && v).map(([k]) => k);
  const untested = exported.filter((k) => !tested.has(k));
  check("every form schema is tested here", untested.length === 0, untested.join(", "));
}

console.log("\nReadable URLs and step pages");
const steps = await import("@/lib/module-steps");
check("module slug from its title", m1.slug === "the-web-html-and-css", m1.slug);
check("lesson and quiz slugs from their titles", v1.slug === "html-crash-course" && cp1.slug === "html-basics", `${v1.slug} ${cp1.slug}`);
const fsBeginner = (await curriculum.getTrackEditor(lead, fs.id)).levels[0].id;
const fsJs = (await ok("same title in another track", () => curriculum.createModule(lead, fsBeginner, { title: "JavaScript basics" })))!;
check("…keeps the plain slug (slugs are per track)", fsJs.slug === "javascript-basics" && m2.slug === "javascript-basics");
const dup = (await ok("same title twice in one track", () => curriculum.createModule(lead, lvI.id, { title: "Components and state" })))!;
check("…gets a numbered slug", dup.slug === "components-and-state-2", dup.slug);
const projLesson = (await ok("a lesson called Project", () => curriculum.addResource(lead, dup.id, { type: "ARTICLE", title: "Project", url: "https://example.com/p" })))!;
check("…never takes the capstone's 'project' URL", projLesson.slug === "project-lesson", projLesson.slug);
const sameName = (await ok("a quiz named like a lesson", () => curriculum.addCheckpoint(lead, dup.id, { title: "Project lesson" })))!;
check("…gets its own URL in the module", sameName.slug === "project-lesson-2", sameName.slug);
check("A finds a module by its URL", (await learning.moduleIdBySlug(A, "frontend", m1.slug)) === m1.id);
await refuses("a URL from another space finds nothing", () => learning.moduleIdBySlug(crossSpace, "frontend", m1.slug), /not found/i);
await refuses("an unknown URL finds nothing", () => learning.moduleIdBySlug(A, "frontend", "nope"), /not found/i);
const stA = steps.buildModuleSteps({ resources: ws.resources, checkpoints: ws.checkpoints, submissionStatus: null, preview: false });
check(
  "steps: lesson, its quiz, then the project",
  stA.map((s) => `${s.kind}:${s.path}`).join() === "lesson:html-crash-course,quiz:html-basics,project:project",
  stA.map((s) => `${s.kind}:${s.path}`).join(),
);
check("only the first step is open before anything is done", stA[0].open && !stA[1].open && !stA[2].open);
check("the module resumes at the first lesson", steps.resumeStep(stA).path === "html-crash-course");
check("staff preview opens every step", steps.buildModuleSteps({ resources: ws.resources, checkpoints: ws.checkpoints, submissionStatus: null, preview: true }).every((s) => s.open));

console.log("\nCross-site writes");
const apiRoute = await import("@/app/api/[[...slugs]]/route");
const evil = await apiRoute.POST(new Request("http://localhost:3000/api/c/gdg-test/web-dev/join", { method: "POST", headers: { origin: "https://evil.example", host: "localhost:3000" } }));
check("a write from another site is refused (403)", evil.status === 403, String(evil.status));
const sibling = await apiRoute.POST(new Request("http://localhost:3000/api/c/gdg-test/web-dev/join", { method: "POST", headers: { origin: "https://other.localhost:3000", host: "localhost:3000" } }));
check("a sibling subdomain is refused too", sibling.status === 403, String(sibling.status));
const own = await apiRoute.POST(new Request("http://localhost:3000/api/c/gdg-test/web-dev/join", { method: "POST", headers: { origin: "http://localhost:3000", host: "localhost:3000" } }));
check("the app's own origin passes the guard (on to the session check)", own.status !== 403, String(own.status));

console.log("\nWatch time (server-credited)");
const back = (s: number) => db.execute(sql`update resource_progress set last_heartbeat_at = now() - make_interval(secs => ${s}) where resource_id = ${v1.id} and user_id = ${U.a}`);
await ok("first heartbeat is a baseline", () => learning.recordHeartbeat(A, v1.id, { position: 0, playing: false }));
await back(10);
const seek = await ok("seek to the end after 10 s", () => learning.recordHeartbeat(A, v1.id, { position: 590, playing: true, rate: 1 }));
check("seeking credits at most the wall-clock time", (seek?.watchedPct ?? 99) <= 2, `pct=${seek?.watchedPct}`);
await refuses("checkpoint still closed before the video is done", () => learning.submitCheckpoint(A, cp1.id, [1, 0]), /Finish "HTML crash course"/);
await ok("pause → baseline at 0", () => learning.recordHeartbeat(A, v1.id, { position: 0, playing: false }));
let last: { watchedPct: number; completed: boolean } | undefined;
for (let pos = 60; pos <= 600 && !last?.completed; pos += 60) {
  await back(60);
  last = await learning.recordHeartbeat(A, v1.id, { position: pos, playing: true, rate: 1 });
}
check("video completes after real playback", !!last?.completed, JSON.stringify(last));
await back(200);
const gap = await learning.recordHeartbeat(A, v1.id, { position: 600, playing: true });
check("completed stays completed", gap.completed);

console.log("\nCheckpoints");
const fail1 = await ok("B fails (wrong) — needs the video first? (B hasn't watched)", async () => {
  try {
    return await learning.submitCheckpoint(B, cp1.id, [0, 1]);
  } catch (e) {
    return { blocked: msg(e) };
  }
});
check("B is blocked until B watches the video", JSON.stringify(fail1).includes("Finish"));
const r1 = await ok("A answers wrong", () => learning.submitCheckpoint(A, cp1.id, [0, 1]));
check("a miss reveals which, not the answers", !!r1 && !r1.passed && r1.wrong.length === 2 && r1.explanations.length === 0);
await ok("A misses again", () => learning.submitCheckpoint(A, cp1.id, [0, 0]));
await refuses("two misses → cooldown", () => learning.submitCheckpoint(A, cp1.id, [1, 0]), /Two misses/);
// Fast-forward the cooldown (attempts are append-only; insert an old passing attempt is NOT allowed — instead move the clock by deleting nothing)
await db.execute(sql`alter table quiz_attempts disable trigger quiz_attempts_append_only`);
await db.execute(sql`update quiz_attempts set created_at = now() - interval '11 minutes' where user_id = ${U.a}`);
await db.execute(sql`alter table quiz_attempts enable trigger quiz_attempts_append_only`);
const r3 = await ok("after the cooldown A passes", () => learning.submitCheckpoint(A, cp1.id, [1, 0]));
check("a pass returns explanations", !!r3?.passed && r3.explanations[0] === "h1–h6 are headings");
await refuses("can't retake a passed checkpoint", () => learning.submitCheckpoint(A, cp1.id, [1, 0]), /already passed/);
{
  const w = await learning.getModuleWorkspace(A, m1.id);
  const st = steps.buildModuleSteps({ resources: w.resources, checkpoints: w.checkpoints, submissionStatus: null, preview: false });
  check("after the video and quiz, the project step opens", st.every((s) => s.open) && st[0].done && st[1].done && !st[2].done);
  check("…and the module resumes at the project", steps.resumeStep(st).path === "project");
}

console.log("\nCapstone and review");
await refuses("B can't submit before finishing the module", () => learning.submitProject(B, m1.id, { repoUrl: "https://github.com/b/x" }), /Watch every lesson/);
await refuses("repo must be https", () => learning.submitProject(A, m1.id, { repoUrl: "http://github.com/a/x" }), /https/);
await refuses("repo must have a real domain", () => learning.submitProject(A, m1.id, { repoUrl: "https://github" }), /complete https/);
await refuses("no user:password@ links", () => learning.submitProject(A, m1.id, { repoUrl: "https://me:pw@github.com/a/x" }), /complete https/);
const sub = (await ok("A submits the project", () => learning.submitProject(A, m1.id, { repoUrl: "https://github.com/a/profile", liveUrl: "https://a.dev" })))!;
await refuses("no double submit", () => learning.submitProject(A, m1.id, { repoUrl: "https://github.com/a/profile" }), /waiting for a mentor/);
await refuses("a learner can't review", () => review.reviewSubmission(B, sub.id, { decision: "APPROVED", score: 100, feedback: "Looks great to me!" }), /permission/);
await refuses("approve needs a score", () => review.reviewSubmission(mentor, sub.id, { decision: "APPROVED", feedback: "Good work overall" }), /Score/);
await refuses("feedback is required", () => review.reviewSubmission(mentor, sub.id, { decision: "NEEDS_REVISION", feedback: "meh" }), /feedback/);
await ok("mentor requests changes", () => review.reviewSubmission(mentor, sub.id, { decision: "NEEDS_REVISION", feedback: "Add alt text to the images please." }));
const sub2 = (await ok("A resubmits", () => learning.submitProject(A, m1.id, { repoUrl: "https://github.com/a/profile" })))!;
await ok("manager approves with 80", () => review.reviewSubmission(manager, sub2.id, { decision: "APPROVED", score: 80, feedback: "Much better, nicely done." }));
await refuses("DB: reviewer must be staff", () => db.insert(S.submissionReviews).values({ submissionId: sub2.id, spaceId: space.id, reviewerId: U.b, decision: "APPROVED", score: 100, feedback: "x" }), /Mentor or above/);
const pts = await db.execute<{ reason: string; delta: number }>(sql`select reason, delta from points_ledger where user_id = ${U.a} order by id`);
check("points: video, checkpoint, project×score", pts.map((p) => `${p.reason}:${p.delta}`).join() === "VIDEO_COMPLETED:2,CHECKPOINT_PASSED:20,PROJECT_APPROVED:80", pts.map((p) => `${p.reason}:${p.delta}`).join());
const queue = (await ok("review queue loads", () => review.getReviewQueue(mentor)))!;
check("queue is empty and turnaround counted", queue.pending.length === 0 && queue.turnaround.n === 2);

console.log("\nPromotion");
pA = await learning.loadTrackProgress({ trackId: fe.id, userId: U.a, enrollment: eA, preview: false });
check("module 2 now open", pA.activeModuleId === m2.id);
await refuses("Manager can't promote", () => learning.promoteLearner(manager, eA.id, { reason: "Finished the level, great work" }), /Only Mentors and Leads/);
await refuses("nobody promotes themselves", () => learning.promoteLearner(as(U.a, "MENTOR"), eA.id, { reason: "I deserve this one" }), /yourself/);
await refuses("a reason is required", () => learning.promoteLearner(mentor, eA.id, { reason: "ok" }), /reason/);
await ok("community Owner (Lead through the community) promotes A", () => learning.promoteLearner(owner, eA.id, { reason: "Strong first project, ready for frameworks." }));
const eA2 = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.id, eA.id)))[0];
check("A is Intermediate", eA2.tier === "INTERMEDIATE");
pA = await learning.loadTrackProgress({ trackId: fe.id, userId: U.a, enrollment: eA2, preview: false });
const inter = pA.levels.find((l) => l.tier === "INTERMEDIATE")!;
check("intermediate visible; options need a pick", inter.reachable && inter.needsBranch && inter.modules.every((m) => !m.branchId));
await refuses("B can't pick a branch above their level", () => learning.chooseBranch(B, eB.id, react.id), /reach that level/);
await refuses("B can't choose for A", () => learning.chooseBranch(B, eA.id, react.id), /Only the learner/);
await ok("A picks React", () => learning.chooseBranch(A, eA.id, react.id));
await ok("A switches to Vue before starting", () => learning.chooseBranch(A, eA.id, vue.id));
await ok("A switches back to React", () => learning.chooseBranch(A, eA.id, react.id));
const feedPromo = await db.select().from(S.feedItems).where(eq(S.feedItems.kind, "LEVEL_PROMOTED"));
check("promotion posted to the feed", feedPromo.length === 1 && feedPromo[0].meta.level === "Intermediate");

console.log("\nSecond track");
await refuses("a learner can't add themselves", () => learning.enrolLearner(A, { userId: U.a, trackId: fs.id }), /Only Mentors and Leads/);
await refuses("prerequisite still applies (B is Beginner)", () => learning.enrolLearner(mentor, { userId: U.b, trackId: fs.id }), /prerequisite/);
await ok("mentor adds A to Fullstack", () => learning.enrolLearner(mentor, { userId: U.a, trackId: fs.id, note: "Ready" }));
await refuses("not twice", () => learning.enrolLearner(mentor, { userId: U.a, trackId: fs.id }), /already/);

console.log("\nPlacement test");
await ok("track offers a test (task + 5 questions)", async () => {
  await curriculum.updateTrack(lead, fe.id, { placementTaskMd: "Build a landing page" });
  for (let i = 0; i < 6; i++) await curriculum.addPlacementQuestion(lead, fe.id, { prompt: `P${i}?`, options: ["right", "wrong"], correctOptionIndex: 0 });
});
await refuses("only Beginners can take it", () => placement.startPlacement(A, fe.id), /first level/);
const att = (await ok("B starts the test", () => placement.startPlacement(B, fe.id)))!;
await refuses("30-day rule", () => placement.startPlacement(B, fe.id), /again on/);
const view = (await ok("B sees questions without keys", () => placement.getPlacementAttempt(B, att.id)))!;
check("no keys in the served quiz", view.questions.length === 6 && view.questions.every((q) => !("correctOptionIndex" in q)));
await refuses("A can't open B's test", () => placement.getPlacementAttempt(A, att.id), /not found/);
const quiz = await ok("B passes the quiz", () => placement.submitPlacementQuiz(B, att.id, view.questions.map(() => 0)));
check("quiz 100%", quiz?.scorePct === 100 && quiz.passed);
await ok("B submits the task", () => placement.submitPlacementTask(B, att.id, { repoUrl: "https://github.com/b/landing" }));
await refuses("B can't review their own", () => placement.reviewPlacement(as(U.b, "MENTOR"), att.id, { decision: "RECOMMENDED", feedback: "Looks good to me" }), /own/);
await ok("mentor recommends", () => placement.reviewPlacement(mentor, att.id, { decision: "RECOMMENDED", feedback: "Clean, responsive, semantic." }));
const q2 = await review.getReviewQueue(mentor);
check("recommended test waits for a promotion", q2.placementsToPromote.length === 1);
await ok("mentor promotes B via the placement", () => learning.promoteLearner(mentor, eB.id, { reason: "Passed the placement test and task.", placementAttemptId: att.id }));
const eB2 = (await db.select().from(S.trackEnrollments).where(eq(S.trackEnrollments.id, eB.id)))[0];
const pB = await learning.loadTrackProgress({ trackId: fe.id, userId: U.b, enrollment: eB2, preview: false });
check("B's beginner modules are placed out and don't gate", pB.placedInto === "INTERMEDIATE" && pB.levels[0].modules.every((m) => m.placedOut && !m.locked));
check("B's next step is the intermediate core", pB.activeModuleId === core.id);

console.log("\nStandups, streaks, feed");
const su = await ok("A posts a standup", () => social.postStandup(A, { didToday: "Finished the HTML module today", nextStep: "Start React", blockers: "Stuck on flexbox" }));
check("streak starts at 1", su?.streak === 1);
await refuses("one per day", () => social.postStandup(A, { didToday: "Second post same day", nextStep: "Keep going" }), /already posted/);
await db.execute(sql`update streaks set last_active_date = (current_date - 1), current = 2 where user_id = ${U.b}`); // no row yet → no-op
await db.insert(S.streaks).values({ spaceId: space.id, userId: U.b, current: 2, longest: 2, lastActiveDate: sql`(now() at time zone 'Africa/Lagos')::date - 1` as unknown as string });
const su2 = await ok("B continues a 2-day streak", () => social.postStandup(B, { didToday: "Built the components module", nextStep: "Props and state" }));
check("milestone at 3 days", su2?.streak === 3 && su2.milestone === 3);
const feed = (await ok("feed loads", () => social.listFeed(A)))!;
check("feed has standups, milestone, promotions, project", ["STANDUP", "STREAK_MILESTONE", "LEVEL_PROMOTED", "PROJECT_APPROVED"].every((k) => feed.items.some((i) => i.kind === k)));
const help = await social.listFeed(A, { helpOnly: true });
check("help filter finds the blocker", help.items.length === 1 && help.items[0].helpNeeded);
const proj = feed.items.find((i) => i.kind === "PROJECT_APPROVED")!;
check("project posts don't leak the score", !JSON.stringify(proj).includes('"score"'));
await ok("B reacts 🔥", () => social.toggleReaction(B, proj.id, "🔥"));
const again = await social.toggleReaction(B, proj.id, "🔥");
check("reacting twice toggles off", again.on === false);
await refuses("unknown emoji refused", () => social.toggleReaction(B, proj.id, "💩"), /Unknown/);
const cm = (await ok("B comments", () => social.addComment(B, proj.id, "Congrats!")))!;
await refuses("A can't delete B's comment", () => social.deleteComment(A, cm.id), /permission/);
await ok("Manager (moderator) can", () => social.deleteComment(manager, cm.id));
await refuses("another space can't react", () => social.toggleReaction(crossSpace, proj.id, "🔥"), /not found/i);

console.log("\nLeaderboard");
const before = await social.getLeaderboard(space.id);
check("no board before the first snapshot", before.rows.length === 0);
await db.execute(sql`select lenigo_snapshot_leaderboards()`);
const board = await social.getLeaderboard(space.id);
check("board ranks learners only", board.rows.length === 2 && board.rows.every((r) => [U.a, U.b].includes(r.user.id)));
const standing = await social.getStanding(space.id, U.a);
check("A's standing from the snapshot", standing?.rank === 1 && standing.points >= 102, JSON.stringify(standing));

console.log("\nWorkshops");
await refuses("a learner can't schedule", () => workshops.createWorkshop(A, { title: "Hack night", kind: "WORKSHOP", type: "PHYSICAL", startsAt: new Date(Date.now() + 3600e3).toISOString(), venue: "Lab" }), /Mentors and above/);
await refuses("online needs a link", () => workshops.createWorkshop(mentor, { title: "Git 101", kind: "WORKSHOP", type: "ONLINE_CALL", startsAt: new Date(Date.now() + 3600e3).toISOString() }), /call link/);
const w = (await ok("mentor schedules a standup review", () => workshops.createWorkshop(mentor, { title: "Friday demos", kind: "STANDUP_REVIEW", type: "ONLINE_CALL", startsAt: new Date(Date.now() + 3600e3).toISOString(), meetingUrl: "https://meet.google.com/abc-defg-hij" })))!;
const beforeRsvp = await workshops.listWorkshops(B);
check("call link hidden until you RSVP", beforeRsvp.upcoming[0].meetingUrl === null);
await refuses("present only your own project", () => workshops.rsvp(B, w.id, { going: true, submissionId: sub2.id }), /your own/);
await ok("A RSVPs to present the project", () => workshops.rsvp(A, w.id, { going: true, submissionId: sub2.id }));
const afterRsvp = await workshops.listWorkshops(A);
check("call link shown after RSVP; presenting queue", afterRsvp.upcoming[0].meetingUrl !== null && afterRsvp.upcoming[0].attendees.some((x) => x.presenting));
await refuses("attendance only after it starts", () => workshops.markAttendance(mentor, w.id, U.a), /has started/);
await db.update(S.workshops).set({ startsAt: new Date(Date.now() - 600e3) }).where(eq(S.workshops.id, w.id));
await refuses("learners can't mark attendance", () => workshops.markAttendance(B, w.id, U.a), /permission/);
await refuses("nobody marks themselves", () => workshops.markAttendance(mentor, w.id, U.mentor), /Someone else/);
await ok("mentor marks A attended", () => workshops.markAttendance(mentor, w.id, U.a));
await ok("marking twice is harmless (points once)", () => workshops.markAttendance(mentor, w.id, U.a));
const wp = await db.execute<{ n: number }>(sql`select count(*)::int n from points_ledger where user_id = ${U.a} and reason = 'REVIEW_SESSION_ATTENDED'`);
check("attendance points once", wp[0].n === 1);
await refuses("DB: attendance can't be unmarked", () => db.update(S.workshopRsvps).set({ attended: false }).where(and(eq(S.workshopRsvps.workshopId, w.id), eq(S.workshopRsvps.userId, U.a))), /unmarked|Mentor or above/);
await refuses("can't un-RSVP after attending", () => workshops.rsvp(A, w.id, { going: false }), /already recorded/);
await refuses("can't cancel a started session", () => workshops.cancelWorkshop(mentor, w.id), /started/);

console.log("\nLearners overview and profiles");
const ls = (await ok("learners overview", () => review.listLearners(mentor)))!;
const la = ls.learners.find((l) => l.id === U.a)!;
check("A shows two tracks with levels", la.enrollments.length === 2 && la.enrollments.some((e) => e.tier === "INTERMEDIATE"));
await refuses("learners can't see the overview", () => review.listLearners(A), /permission/);
await ok("A sets a username and bio", () => profiles.updateProfile(users[U.a], { username: "ada-builds", bio: "Learning React" }));
await refuses("username taken", () => profiles.updateProfile(users[U.b], { username: "ada-builds" }), /taken/);
await refuses("reserved username", () => profiles.updateProfile(users[U.b], { username: "admin" }), /reserved/);
const prof = await profiles.getPublicProfile("ADA-builds");
check("public profile: levels and approved project, no email", !!prof && prof.projects.length === 1 && prof.levels.length === 2 && !JSON.stringify(prof).includes("@example.test"));

console.log("\nCurriculum safety");
await refuses("can't delete a module with progress", () => curriculum.deleteModule(lead, m1.id), /progress/);
await refuses("can't delete a track with learners", () => curriculum.deleteTrack(lead, fe.id), /Unpublish/);
await refuses("can't delete a watched video", () => curriculum.deleteResource(lead, v1.id), /watched/);
await refuses("can't delete a chosen option", () => curriculum.deleteBranch(lead, react.id), /picked/);
await ok("reorder modules", () => curriculum.moveModule(lead, m2.id, "up"));

console.log("\nGlobal House health (Phase 1 subquery fix)");
const { listCommunityHealth } = await import("@/server/services/communities");
const health = (await listCommunityHealth()).find((r) => r.slug === "gdg-test") as Record<string, unknown> | undefined;
check("health counts spaces, members, shipped, owner", health?.spaces === 2 && health?.members === 6 && health?.shipped === 1 && health?.owner === "Owner", JSON.stringify(health));

const admin = await import("@/server/services/admin");
const days = await admin.activityByDay(7);
check("activity chart query runs", Array.isArray(days) && days.length === 7, JSON.stringify(days).slice(0, 120));
const totals = await (await import("@/server/services/communities")).getGlobalTotals();
check("global totals", totals.communities === 1 && totals.users === 7, JSON.stringify(totals));

/* ── Phase 1: provisioning, invites, roles and people management ── */
type Mail = { to: { email_address: { address: string } }[]; subject: string; htmlbody: string; textbody: string };
const mails = async () => (await (await fetch(process.env.MAIL_SINK_URL!)).json()) as Mail[];
const clearMail = () => fetch(process.env.MAIL_SINK_URL!, { method: "DELETE" });
const mailsTo = async (email: string) => (await mails()).filter((m) => m.to.some((t) => t.email_address.address === email));
const tokenOf = (url: string) => new URL(url).pathname.split("/").pop()!;
const statusOf = async (p: Promise<unknown>) => p.then(() => 200, (e: { status?: number }) => e?.status ?? 500);

const C = await import("@/server/services/communities");
const I = await import("@/server/services/invites");
const Acc = await import("@/server/auth/access");
const Adm = await import("@/server/services/admin");
const Perm = await import("@/lib/permissions");

console.log("\nPhase 1: provisioning");
await clearMail();
const P = { root: uid(), owner: uid(), lead: uid(), mgr: uid(), mentor: uid(), member: uid(), other: uid() };
await db.insert(S.users).values(
  Object.entries(P).map(([k, id]) => ({
    id,
    email: k === "root" ? "root@example.test" : `p1-${k}@example.test`,
    name: `P1 ${k}`,
    username: `p1-${k}`,
    globalRole: k === "root" ? ("SUPER_ADMIN" as const) : ("USER" as const),
  })),
);
const pu = async (id: string) => (await db.select().from(S.users).where(eq(S.users.id, id)))[0];
const root = await pu(P.root);
const [pOwner, pLead, pMgr, pMentor, pMember, pOther] = await Promise.all([P.owner, P.lead, P.mgr, P.mentor, P.member, P.other].map(pu));

await refuses("a regular user can't provision", () => C.provisionCommunity(pOwner, { name: "X", slug: "x-club", ownerEmail: "x@example.test", spaces: [] }), /permission/);
const prov = (await ok("Super Admin provisions gdg-oau (Web Development + Data Science)", () =>
  C.provisionCommunity(root, { name: "GDG OAU", slug: "gdg-oau", ownerEmail: "P1-Owner@example.test", spaces: ["Web Development", "Data Science"], timezone: "Africa/Lagos" }),
))!;
check("two spaces; existing owner made Owner; invite emailed", prov.spaces.length === 2 && prov.ownerAlreadyMember && prov.ownerInvite.emailed);
const ownerMail = await mailsTo("p1-owner@example.test");
check("owner got one branded invite email", ownerMail.length === 1 && ownerMail[0].subject === "You're invited to GDG OAU on Lenigo");
check("existing account: no one-click key in the email", !ownerMail[0].htmlbody.includes("?k="));
await refuses("slug can't be reused", () => C.provisionCommunity(root, { name: "Again", slug: "gdg-oau", ownerEmail: "y@example.test", spaces: [] }), /taken/);

const ownerC = await Acc.getCommunityAccess(pOwner, "gdg-oau");
check("owner is Community Lead (OWNER)", ownerC.role === "OWNER");
const ownerWeb = await Acc.getSpaceAccess(pOwner, "gdg-oau", "web-development");
const ownerData = await Acc.getSpaceAccess(pOwner, "gdg-oau", "data-science");
check("owner is LEAD in both spaces", ownerWeb.spaceRole === "LEAD" && ownerData.spaceRole === "LEAD");

console.log("\nPhase 1: space invites and role limits");
await clearMail();
const leadInv = (await ok("owner invites a Lead to web-development by email", () => I.createSpaceInvite(ownerWeb, "LEAD", { email: "p1-lead@example.test" })))!;
check("invite emailed", leadInv.emailed && (await mailsTo("p1-lead@example.test")).length === 1);
await refuses("a different account can't accept an email invite", () => I.redeemInvite(pOther, tokenOf(leadInv.url)), /sent to p1/);
await ok("lead accepts", () => I.redeemInvite(pLead, tokenOf(leadInv.url)));
await ok("accepting again is harmless", () => I.redeemInvite(pLead, tokenOf(leadInv.url)));
const leadWeb = await Acc.getSpaceAccess(pLead, "gdg-oau", "web-development");
check("lead is LEAD of web-development and a community MEMBER", leadWeb.spaceRole === "LEAD" && leadWeb.role === "MEMBER");
check("lead has no role in data-science", (await Acc.getSpaceAccess(pLead, "gdg-oau", "data-science")).spaceRole === null);
const mgrInv = (await ok("lead invites a Manager", () => I.createSpaceInvite(leadWeb, "MANAGER", { email: "p1-mgr@example.test" })))!;
const mentorInv = (await ok("lead invites a Mentor", () => I.createSpaceInvite(leadWeb, "MENTOR", { email: "p1-mentor@example.test" })))!;
await ok("manager and mentor accept", async () => {
  await I.redeemInvite(pMgr, tokenOf(mgrInv.url));
  await I.redeemInvite(pMentor, tokenOf(mentorInv.url));
});
const mgrWeb = await Acc.getSpaceAccess(pMgr, "gdg-oau", "web-development");
const mentorWeb = await Acc.getSpaceAccess(pMentor, "gdg-oau", "web-development");
check("manager's invite picker has no Lead/Manager", Perm.space.invitableRoles(mgrWeb.spaceRole).join() === "MENTOR,MEMBER");
check("API refuses a Manager inviting a Lead (403)", (await statusOf(I.createSpaceInvite(mgrWeb, "LEAD", { email: "z@example.test" }))) === 403);
check("API refuses a Manager inviting a Manager (403)", (await statusOf(I.createSpaceInvite(mgrWeb, "MANAGER", { email: "z@example.test" }))) === 403);
await ok("manager invites a Mentor", () => I.createSpaceInvite(mgrWeb, "MENTOR", { email: "z1@example.test", sendEmail: false }));
check(
  "mentor: no /team or /curriculum, yes /review",
  !Perm.space.canViewTeam(mentorWeb.spaceRole) && !Perm.space.canEditCurriculum(mentorWeb.spaceRole) && Perm.space.canReview(mentorWeb.spaceRole),
);
check("API refuses a Mentor inviting anyone (403)", (await statusOf(I.createSpaceInvite(mentorWeb, "MEMBER", { email: "z@example.test" }))) === 403);
await refuses("a Manager can't promote a Mentor to Lead", () => C.changeSpaceRole(mgrWeb, P.mentor, "LEAD"), /permission/);
await refuses("nobody changes their own role", () => C.changeSpaceRole(leadWeb, P.lead, "MEMBER"), /own role/);

console.log("\nPhase 1: joining spaces");
const design = (await ok("owner adds an OPEN space", () => C.createSpace(ownerC, { name: "Design", joinPolicy: "OPEN" })))!;
await ok("owner adds an INVITE space", () => C.createSpace(ownerC, { name: "Core Team", joinPolicy: "INVITE" }));
const link = (await ok("owner makes a single-use member link", () => I.createCommunityInvite(ownerC, "MEMBER", { maxUses: 1 })))!;
await ok("member joins with the link", () => I.redeemInvite(pMember, tokenOf(link.url)));
await refuses("a single-use link can't be used twice", () => I.redeemInvite(pOther, tokenOf(link.url)), /already been used/);
const memberDesign = await Acc.getSpaceAccess(pMember, "gdg-oau", design.slug);
check("member sees the OPEN space without a role yet", memberDesign.spaceRole === null);
await ok("member self-joins the OPEN space", () => C.joinOpenSpace(memberDesign));
check("member is now a MEMBER there", (await Acc.getSpaceAccess(pMember, "gdg-oau", design.slug)).spaceRole === "MEMBER");
await refuses("member can't see the INVITE space", () => Acc.getSpaceAccess(pMember, "gdg-oau", "core-team"), /not found/i);
await refuses("an outsider can't see the community", () => Acc.getCommunityAccess(pOther, "gdg-oau"), /not found/i);
check("Super Admin opens any space as Lead (override)", (await Acc.getSpaceAccess(root, "gdg-oau", "core-team")).spaceRole === "LEAD");

console.log("\nPhase 1: suspension");
await refuses("a community Owner can't suspend", () => C.setCommunityStatus(pOwner, prov.community.id, "SUSPENDED"), /permission/);
await ok("Super Admin suspends gdg-oau", () => C.setCommunityStatus(root, prov.community.id, "SUSPENDED"));
check("members are blocked (410)", (await statusOf(Acc.getCommunityAccess(pMember, "gdg-oau"))) === 410);
check("the owner is blocked too (410)", (await statusOf(Acc.getSpaceAccess(pOwner, "gdg-oau", "web-development"))) === 410);
await ok("Super Admin still gets in", () => Acc.getCommunityAccess(root, "gdg-oau"));
const lateInv = await I.createSpaceInvite(await Acc.getSpaceAccess(root, "gdg-oau", "web-development"), "MEMBER", { email: "late@example.test", sendEmail: false });
const pv = await I.previewInvite(tokenOf(lateInv.url));
check("invites say the community is suspended", !pv.ok && /suspended/.test(pv.reason));
await ok("Super Admin reactivates", () => C.setCommunityStatus(root, prov.community.id, "ACTIVE"));
check("members are back in", (await statusOf(Acc.getCommunityAccess(pMember, "gdg-oau"))) === 200);

console.log("\nPhase 1: database rules");
await refuses("DB: points_ledger is append-only (UPDATE)", () => db.execute(sql`update points_ledger set delta = 999`), /append-only/);
await refuses("DB: points_ledger is append-only (DELETE)", () => db.execute(sql`delete from points_ledger`), /append-only/);
await refuses("DB: activity_logs is append-only", () => db.execute(sql`update activity_logs set action_type = 'LOGIN'`), /append-only/);

console.log("\nPeople management: hand over the Community Lead");
const rootC = await Acc.getCommunityAccess(root, "gdg-oau");
await refuses("only the Community Lead hands over", () => C.handOverLead({ ...ownerC, role: "ADMIN" }, P.lead), /permission/);
await refuses("hand over to someone outside the community", () => C.handOverLead(ownerC, P.other), /member of the community/);
await ok("owner hands over to the web lead", () => C.handOverLead(ownerC, P.lead));
const roleIn = async (id: string) =>
  (await db.select({ r: S.communityMembers.role }).from(S.communityMembers).where(and(eq(S.communityMembers.communityId, prov.community.id), eq(S.communityMembers.userId, id))))[0]?.r;
check("new Lead is OWNER, old Lead is ADMIN", (await roleIn(P.lead)) === "OWNER" && (await roleIn(P.owner)) === "ADMIN");
await refuses("demoting the last Community Lead fails", () => C.changeCommunityRole(rootC, P.lead, "ADMIN"), /at least one Community Lead/);
await refuses("removing the last Community Lead fails", () => C.removeCommunityMember(rootC, P.lead), /at least one Community Lead/);
await refuses("an Admin can't demote the Lead", () => C.changeCommunityRole({ ...ownerC, role: "ADMIN", membershipRole: "ADMIN" }, P.lead, "MEMBER"), /permission/);
const newLeadC = await Acc.getCommunityAccess(pLead, "gdg-oau");

console.log("\nPeople management: remove and invite back");
await db.insert(S.pointsLedger).values({ spaceId: design.id, communityId: prov.community.id, userId: P.member, delta: 5, reason: "STANDUP", dedupeKey: "standup:test" });
await ok("member also has a pending Mentor invite to data-science", async () =>
  I.createSpaceInvite(await Acc.getSpaceAccess(pLead, "gdg-oau", "data-science"), "MENTOR", { email: "p1-member@example.test", sendEmail: false }),
);
await refuses("you can't remove yourself", () => C.removeCommunityMember(newLeadC, P.lead), /yourself/);
await ok("Lead removes the member", () => C.removeCommunityMember(newLeadC, P.member));
const left = await db.select().from(S.spaceMembers).where(and(eq(S.spaceMembers.communityId, prov.community.id), eq(S.spaceMembers.userId, P.member)));
check("gone from every space", left.length === 0);
check("can't open the community any more (404)", (await statusOf(Acc.getCommunityAccess(pMember, "gdg-oau"))) === 404);
const stillPending = await db
  .select()
  .from(S.invites)
  .where(and(eq(S.invites.communityId, prov.community.id), eq(S.invites.email, "p1-member@example.test"), sql`${S.invites.revokedAt} is null`));
check("their pending invites are cancelled", stillPending.length === 0);
const invitedBack = (await ok("invited back", () => I.createCommunityInvite(newLeadC, "MEMBER", { email: "p1-member@example.test", sendEmail: false })))!;
await ok("member accepts again", () => I.redeemInvite(pMember, tokenOf(invitedBack.url)));
const kept = await db.select().from(S.pointsLedger).where(and(eq(S.pointsLedger.userId, P.member), eq(S.pointsLedger.communityId, prov.community.id)));
check("their history (points) is still there", kept.length === 1);

console.log("\nPeople management: resend an email invite");
await clearMail();
const toOther = (await ok("invite p1-other by email", () => I.createCommunityInvite(newLeadC, "MEMBER", { email: "p1-other@example.test" })))!;
const scope = { communityId: prov.community.id, spaceId: null };
const canInvite = (r: string) => Perm.community.invitableRoles(newLeadC.role).includes(r as never);
check("resend within 2 minutes is refused (429)", (await statusOf(I.resendInvite(pLead, scope, toOther.id, canInvite))) === 429);
await db.update(S.invites).set({ lastSentAt: new Date(Date.now() - 3 * 60_000) }).where(eq(S.invites.id, toOther.id));
const resent = (await ok("resend after the cooldown", () => I.resendInvite(pLead, scope, toOther.id, canInvite)))!;
check("a second email went out with a new link", resent.emailed && (await mailsTo("p1-other@example.test")).length === 2 && resent.url !== toOther.url);
const oldPv = await I.previewInvite(tokenOf(toOther.url));
check("the old link says invalid", !oldPv.ok && /isn't valid/.test(oldPv.reason));
await ok("the new link works", () => I.redeemInvite(pOther, tokenOf(resent.url)));
check("an accepted invite can't be resent (410)", (await statusOf(I.resendInvite(pLead, scope, toOther.id, canInvite))) === 410);
const shareable = await I.createCommunityInvite(newLeadC, "MEMBER", { maxUses: 5 });
check("only email invites can be resent (400)", (await statusOf(I.resendInvite(pLead, scope, shareable.id, canInvite))) === 400);

console.log("\nPeople management: deactivate");
await refuses("only a Super Admin deactivates", () => Adm.setUserActive(pLead, P.other, false), /permission/);
await refuses("not yourself", () => Adm.setUserActive(root, P.root, false), /yourself/);
await ok("Super Admin deactivates p1-other", () => Adm.setUserActive(root, P.other, false));
check("account marked deactivated", !!(await pu(P.other)).deactivatedAt);
await ok("reactivate", () => Adm.setUserActive(root, P.other, true));
check("account active again, memberships kept", !(await pu(P.other)).deactivatedAt && (await roleIn(P.other)) === "MEMBER");
await db.update(S.users).set({ globalRole: "SUPER_ADMIN" }).where(eq(S.users.id, P.mgr));
await refuses("a Super Admin can't be deactivated", () => Adm.setUserActive(root, P.mgr, false), /Super Admins/);
await db.update(S.users).set({ globalRole: "USER" }).where(eq(S.users.id, P.mgr));

console.log("\nLearning emails");
const N = await import("@/server/services/notifications");
await clearMail();
await ok("project approved email", () => N.notifyProjectReviewed(sub2.id));
const approvedMail = await mailsTo("a@example.test");
check("A gets 'Approved: The web, HTML and CSS'", approvedMail.length === 1 && approvedMail[0].subject === "Approved: The web, HTML and CSS", JSON.stringify(approvedMail.map((m) => m.subject)));
check("it quotes the mentor's feedback", approvedMail[0]?.textbody.includes("Much better, nicely done."));
check("no score or points in it", !/\bscore\b|\bpoints?\b|\b80\b/i.test(approvedMail[0]?.textbody ?? "x"), approvedMail[0]?.textbody);
check("links to the roadmap and the opt-out", approvedMail[0]?.htmlbody.includes("/c/gdg-test/web-dev/roadmap") && approvedMail[0]?.htmlbody.includes("/u/ada-builds"));
await clearMail();
await ok("changes-requested email", () => N.notifyProjectReviewed(sub.id));
const revMail = await mailsTo("a@example.test");
check("subject says changes requested, links to the module", revMail[0]?.subject === "Changes requested: The web, HTML and CSS" && revMail[0].htmlbody.includes(`/modules/${m1.id}`));
await clearMail();
const [promo] = await db.select().from(S.levelPromotions).where(eq(S.levelPromotions.userId, U.a));
await ok("promotion email", () => N.notifyPromoted(promo.id));
const promoMail = await mailsTo("a@example.test");
check("A gets 'You're now Intermediate in Frontend' with the reason", promoMail[0]?.subject === "You're now Intermediate in Frontend" && promoMail[0].textbody.includes("Strong first project"), promoMail[0]?.subject);
await clearMail();
await ok("placement email", () => N.notifyPlacementReviewed(att.id));
check("B hears the placement was recommended", (await mailsTo("b@example.test"))[0]?.textbody.includes("recommended you move up"));

await clearMail();
await db.update(S.users).set({ emailNotifications: false }).where(eq(S.users.id, U.a));
await N.notifyProjectReviewed(sub2.id);
check("opted out: no learning email", (await mailsTo("a@example.test")).length === 0);
await db.update(S.users).set({ emailNotifications: true }).where(eq(S.users.id, U.a));
await db.update(S.users).set({ deactivatedAt: new Date() }).where(eq(S.users.id, U.b));
await N.notifyPlacementReviewed(att.id);
check("deactivated: no learning email", (await mailsTo("b@example.test")).length === 0);
await db.update(S.users).set({ deactivatedAt: null }).where(eq(S.users.id, U.b));

console.log("\nLearning emails from the real actions");
await clearMail();
const m3 = (await ok("a third module for a fresh review", async () => {
  const m = await curriculum.createModule(lead, lvI.id, { title: "Testing components" });
  await curriculum.updateModule(lead, m.id, { projectBriefMd: "Write tests" });
  const c = await curriculum.addCheckpoint(lead, m.id, { title: "Check" });
  await curriculum.addQuestion(lead, c.id, { prompt: "Which one?", options: ["a", "b"], correctOptionIndex: 0 });
  await curriculum.updateModule(lead, m.id, { isPublished: true });
  return m;
}))!;
const [sub3] = await db
  .insert(S.submissions)
  .values({ moduleId: m3.id, spaceId: space.id, communityId: community.id, userId: U.b, repoUrl: "https://github.com/b/tests" })
  .returning();
await ok("mentor requests changes through the service", () => review.reviewSubmission(mentor, sub3.id, { decision: "NEEDS_REVISION", feedback: "Cover the error states too." }));
check("the review action emailed B", (await mailsTo("b@example.test")).some((m) => m.subject === "Changes requested: Testing components"));

console.log("\nSession reminders and cancellations");
await clearMail();
const soon = (await ok("mentor schedules a session in 30 hours", () =>
  workshops.createWorkshop(mentor, { title: "Git clinic", kind: "WORKSHOP", type: "PHYSICAL", startsAt: new Date(Date.now() + 30 * 3600e3).toISOString(), venue: "Lab 2" }),
))!;
const later = (await ok("and one in 3 days", () =>
  workshops.createWorkshop(mentor, { title: "Career talk", kind: "WORKSHOP", type: "PHYSICAL", startsAt: new Date(Date.now() + 72 * 3600e3).toISOString(), venue: "Hall" }),
))!;
await ok("A and B RSVP to both", async () => {
  for (const w of [soon, later]) for (const who of [A, B]) await workshops.rsvp(who, w.id, { going: true });
});
await db.update(S.workshops).set({ startsAt: new Date(Date.now() + 2 * 3600e3) }).where(eq(S.workshops.id, soon.id)); // now 2 hours away
const n1 = await N.sendWorkshopReminders();
check("reminders go to both RSVPs of the session starting soon", n1 === 2, String(n1));
const n2 = await N.sendWorkshopReminders();
check("running again sends nothing", n2 === 0, String(n2));
const rem = await mailsTo("a@example.test");
check("one reminder each, with time and venue", rem.length === 1 && rem[0].subject === "Reminder: Git clinic" && rem[0].textbody.includes("Lab 2") && rem[0].textbody.includes("Africa/Lagos"));
await ok("A cancels and RSVPs again", async () => {
  await workshops.rsvp(A, soon.id, { going: false });
  await workshops.rsvp(A, soon.id, { going: true });
});
check("no second reminder after re-RSVPing inside the window", (await N.sendWorkshopReminders()) === 0);

const odd = (await ok("a session in a community with an unknown timezone", async () => {
  await db.update(S.communities).set({ timezone: "Not/AZone" }).where(eq(S.communities.id, community.id));
  const w = await workshops.createWorkshop(mentor, { title: "Odd zone", kind: "WORKSHOP", type: "PHYSICAL", startsAt: new Date(Date.now() + 30 * 3600e3).toISOString(), venue: "Lab 3" });
  await workshops.rsvp(B, w.id, { going: true });
  await db.update(S.workshops).set({ startsAt: new Date(Date.now() + 3600e3) }).where(eq(S.workshops.id, w.id));
  return w;
}))!;
await clearMail();
check("still reminded, time shown in UTC", (await N.sendWorkshopReminders()) === 1 && (await mailsTo("b@example.test"))[0]?.textbody.includes("(UTC)"));
await db.update(S.communities).set({ timezone: "Africa/Lagos" }).where(eq(S.communities.id, community.id));

await ok("B re-RSVPs far ahead; the mailer is down at reminder time", async () => {
  const w = await workshops.createWorkshop(mentor, { title: "Mailer down", kind: "WORKSHOP", type: "PHYSICAL", startsAt: new Date(Date.now() + 30 * 3600e3).toISOString(), venue: "Lab 4" });
  await workshops.rsvp(B, w.id, { going: true });
  await db.update(S.workshops).set({ startsAt: new Date(Date.now() + 3600e3) }).where(eq(S.workshops.id, w.id));
});
const mailMode = (m: "up" | "down") => fetch(process.env.MAIL_SINK_URL!.replace(/\/sent$/, "/mode"), { method: "PUT", body: m });
await mailMode("down");
check("a failed send isn't counted", (await N.sendWorkshopReminders()) === 0);
await mailMode("up");
check("and is retried on the next run", (await N.sendWorkshopReminders()) === 1);
void odd;

await clearMail();
await ok("mentor cancels the later session", () => workshops.cancelWorkshop(mentor, later.id));
check("everyone who RSVP'd hears it was cancelled", (await mailsTo("a@example.test"))[0]?.subject === "Cancelled: Career talk" && (await mailsTo("b@example.test")).length === 1);

console.log("\nCron route");
const cronRoute = await import("@/app/cron/workshop-reminders/route");
const { NextRequest } = await import("next/server");
const cronRes = await cronRoute.GET(new NextRequest("http://localhost:3000/cron/workshop-reminders"));
check("off without CRON_SECRET (404)", cronRes.status === 404);

console.log("\nAdmin → Users paging");
await db.insert(S.users).values(Array.from({ length: 60 }, (_, i) => ({ id: uid(), email: `bulk${String(i).padStart(2, "0")}@example.test`, name: `Bulk ${i}`, username: `bulk-${i}` })));
const pg1 = await Adm.pageUsers({});
check("first page holds 50, total counts everyone", pg1.rows.length === 50 && pg1.total === pg1.all && pg1.all >= 74, `${pg1.rows.length}/${pg1.total}`);
check("Super Admins come first", pg1.rows[0].globalRole === "SUPER_ADMIN");
const pg2 = await Adm.pageUsers({ page: 2 });
check("page 2 has the rest, no overlap", pg2.rows.length === pg1.all - 50 && !pg2.rows.some((r) => pg1.rows.some((x) => x.id === r.id)));
const bulk = await Adm.pageUsers({ q: "bulk0" });
check("search narrows (bulk00–bulk09)", bulk.total === 10 && bulk.rows.length === 10);
check("LIKE wildcards are literal", (await Adm.pageUsers({ q: "bulk_" })).total === 0);
check("filter by role", (await Adm.pageUsers({ role: "SUPER_ADMIN" })).rows.every((r) => r.globalRole === "SUPER_ADMIN"));
await db.update(S.users).set({ deactivatedAt: new Date() }).where(eq(S.users.email, "bulk00@example.test"));
const off = await Adm.pageUsers({ role: "DEACTIVATED" });
check("Deactivated filter and count", off.total === 1 && off.counts.DEACTIVATED === 1 && off.rows[0].email === "bulk00@example.test");
const p1row = (await Adm.pageUsers({ q: "p1-lead" })).rows[0];
check("communities column lists the right community", JSON.stringify(p1row?.communities) === '["gdg-oau"]', JSON.stringify(p1row?.communities));

console.log("\nBring your community (public form)");
const R = await import("@/server/services/community-requests");
await clearMail();
const goodReq = { name: "Ada", email: "Ada@Example.test", communityName: "GDG Ibadan", size: "200–1,000", location: "Ibadan", about: "Weekly web study jams; we want mentors to review projects.", link: "https://gdg.example.test" };
await ok("a request is accepted", () => R.submitCommunityRequest(goodReq, "203.0.113.7"));
const stored = await db.select().from(S.communityRequests);
check("stored with a hashed IP, not the IP", stored.length === 1 && !!stored[0].ipHash && stored[0].ipHash !== "203.0.113.7" && stored[0].email === "ada@example.test");
const teamMail = await mailsTo("root@example.test");
check("the team is emailed, reply-to the sender", teamMail.length === 1 && teamMail[0].subject === "New community request: GDG Ibadan" && JSON.stringify(teamMail[0]).includes('"reply_to":[{"address":"ada@example.test"'));
check("the sender gets no email (the form can't spam strangers)", (await mailsTo("ada@example.test")).length === 0);
await ok("honeypot: pretend success, store nothing", () => R.submitCommunityRequest({ ...goodReq, email: "bot@example.test", website: "http://spam" }, "203.0.113.8"));
check("bot request not stored", (await db.select().from(S.communityRequests)).length === 1);
await refuses("about must say something", () => R.submitCommunityRequest({ ...goodReq, about: "hi" }, "203.0.113.9"), /a little about/);
await refuses("size must be one of the options", () => R.submitCommunityRequest({ ...goodReq, size: "lots" }, "203.0.113.9"), /Pick a size/);
await refuses("links must be https", () => R.submitCommunityRequest({ ...goodReq, link: "javascript:alert(1)" }, "203.0.113.9"), /https/);
await refuses("emails can't carry mailto extras", () => R.submitCommunityRequest({ ...goodReq, email: "a@x.io?bcc=evil@x.io" }, "203.0.113.9"), /email we can reply/);
await refuses("an email needs a real domain (ada@gmail)", () => R.submitCommunityRequest({ ...goodReq, email: "ada@gmail" }, "203.0.113.9"), /email we can reply/);
await ok("same email, second request today", () => R.submitCommunityRequest({ ...goodReq, communityName: "GDG Ibadan 2" }, "203.0.113.10"));
await refuses("third from the same email today is refused", () => R.submitCommunityRequest({ ...goodReq, communityName: "GDG Ibadan 3" }, "203.0.113.11"), /already got/);
for (let i = 0; i < 3; i++) await R.submitCommunityRequest({ ...goodReq, email: `ip${i}@example.test` }, "198.51.100.1");
await refuses("fourth from one IP within an hour is refused", () => R.submitCommunityRequest({ ...goodReq, email: "ip9@example.test" }, "198.51.100.1"), /already got/);
for (let i = 0; i < 3; i++) await R.submitCommunityRequest({ ...goodReq, email: `noip${i}@example.test` }, null);
await refuses("senders with no known IP share one limit", () => R.submitCommunityRequest({ ...goodReq, email: "noip9@example.test" }, null), /already got/);
await refuses("only Super Admins/Admins list requests", () => R.listCommunityRequests(pLead), /permission/);
const listed = await R.listCommunityRequests(root);
check("open requests listed newest first", listed.rows.length === 8 && listed.counts.NEW === 8, String(listed.rows.length));
await ok("mark one contacted", () => R.setCommunityRequestStatus(root, listed.rows[0].r.id, "CONTACTED"));
check("status and handler recorded", (await R.listCommunityRequests(root, "CONTACTED")).rows[0]?.handledBy === "P1 root");
await refuses("a regular user can't change status", () => R.setCommunityRequestStatus(pLead, listed.rows[0].r.id, "DECLINED"), /permission/);

console.log("\nInvite-only sign-in");
const E = await import("@/server/auth/eligibility");
const Sess = await import("@/server/auth/session");
check("an existing account may sign in", await E.canSignIn(users[U.a].email));
check("…in any letter case", await E.canSignIn(users[U.a].email.toUpperCase()));
check("a stranger may not", !(await E.canSignIn("stranger@example.test")));
check("a Super Admin bootstrap address may", await E.canSignIn("root@example.test"));
const emailInv = (await ok("invite a new person by email", () => I.createSpaceInvite(ownerWeb, "MEMBER", { email: "newbie@example.test", sendEmail: false })))!;
check("a pending email invite lets that address in", await E.canSignIn("newbie@example.test"));
check("…but its link doesn't work for another address", !(await E.canSignIn("other@example.test", tokenOf(emailInv.url))));
const linkInv = (await ok("create a shareable invite link", () => I.createSpaceInvite(ownerWeb, "MEMBER", { maxUses: 2 })))!;
check("a link invite lets any address in", await E.canSignIn("linkjoiner@example.test", tokenOf(linkInv.url)));
check("a made-up token lets no one in", !(await E.canSignIn("linkjoiner@example.test", "x".repeat(32))));
await ok("revoke the email invite", () => I.revokeInvite(pOwner, { communityId: ownerWeb.community.id, spaceId: ownerWeb.space.id }, emailInv.id, () => true));
check("a revoked invite no longer counts", !(await E.canSignIn("newbie@example.test")));
const fakeAuth = (email: string) => ({ id: uid(), email, app_metadata: { provider: "email" }, user_metadata: {}, aud: "authenticated", created_at: new Date().toISOString() }) as never;
await refuses("a new uninvited account isn't created at sign-in", () => Sess.syncUserFromAuth(fakeAuth("sneaky@example.test")), /No Lenigo account or invite/);
check("…and no user row appears", (await db.select().from(S.users).where(eq(S.users.email, "sneaky@example.test"))).length === 0);
const joined = await ok("a link invite creates the account at sign-in", () => Sess.syncUserFromAuth(fakeAuth("linkjoiner@example.test"), { invite: tokenOf(linkInv.url) }));
check("…with a user row", !!joined?.id);

console.log("\nSign-in code rate limits");
for (let i = 0; i < 5; i++) await E.throttleSignIn("limit@example.test", "192.0.2.50");
check("6th code for one address in 15 min is refused", /Too many codes/.test((await E.throttleSignIn("limit@example.test", "192.0.2.50")) ?? ""));
for (let i = 0; i < 20; i++) await E.throttleSignIn(`ip${i}@example.test`, "192.0.2.60");
check("21st request from one network is refused", /from this network/.test((await E.throttleSignIn("ipx@example.test", "192.0.2.60")) ?? ""));
for (let i = 0; i < 8; i++) await E.recordMiss("192.0.2.70");
check("unknown-address guessing is capped per network", await E.missLimited("192.0.2.70"));
check("…other networks aren't affected", !(await E.missLimited("192.0.2.71")));
const keys = await db.select({ key: S.signInRequests.key }).from(S.signInRequests).limit(5);
check("only hashes are stored, never addresses or IPs", keys.every((k) => /^[0-9a-f]{64}$/.test(k.key)));

console.log("\nSign-in code route (/auth/otp)");
const otpRoute = await import("@/app/auth/otp/route");
const otp = (body: unknown, origin = "http://localhost:3000", ip = "192.0.2.80") =>
  otpRoute.POST(new NextRequest("http://localhost:3000/auth/otp", { method: "POST", headers: { origin, "content-type": "application/json", "x-real-ip": ip }, body: JSON.stringify(body) }));
check("another site can't trigger codes (403)", (await otp({ email: users[U.a].email }, "https://evil.example")).status === 403);
check("ada@gmail is refused before anything is sent (400)", (await otp({ email: "ada@gmail" })).status === 400);
const unknown = await otp({ email: "nobody@example.test" });
check("an unknown address is told plainly (404)", unknown.status === 404 && /don't have an account/.test(((await unknown.json()) as { error: string }).error));

console.log(`\n${pass} passed, ${failCount} failed`);
if (failures.length) console.log("FAILURES:\n- " + failures.join("\n- "));
process.exit(failCount ? 1 : 0);
