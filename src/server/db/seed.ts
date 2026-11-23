/**
 * Dev seed: creates the GDG OAU and Claude Ambassadors communities with their spaces.
 * Run with `pnpm db:seed` after `pnpm db:migrate`. Safe to re-run (idempotent on slugs).
 *
 * Users come from Supabase Auth, so the seed can't create them. Sign in once with an
 * address in SUPER_ADMIN_EMAILS, then re-run the seed to make that account Owner of
 * both communities.
 */
import "dotenv/config";
import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const { communities, spaces, users, communityMembers, activityLogs } = schema;

const SEED = [
  {
    slug: "gdg-oau",
    name: "GDG OAU",
    description: "Google Developer Group at Obafemi Awolowo University. Build, learn and ship together.",
    timezone: "Africa/Lagos",
    spaces: [
      { slug: "web-dev", name: "Web Development", description: "From HTML to full-stack: build and ship real web apps." },
      { slug: "data-science", name: "Data Science", description: "Python, pandas, statistics and machine learning, one project at a time." },
      { slug: "mobile", name: "Mobile Development", description: "Flutter and Android: ship apps people can install.", joinPolicy: "INVITE" as const },
    ],
  },
  {
    slug: "claude-ambassadors",
    name: "Claude Ambassadors",
    description: "Builders and educators teaching their communities to build with Claude.",
    timezone: "UTC",
    spaces: [{ slug: "general", name: "General", description: "Ambassador playbooks, projects and office hours." }],
  },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DIRECT_URL or DATABASE_URL in .env");
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  const admins = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const owners = admins.length
    ? await db.select().from(users).where(inArray(sql`lower(${users.email})`, admins))
    : [];

  for (const c of SEED) {
    let [community] = await db.select().from(communities).where(eq(communities.slug, c.slug)).limit(1);
    if (!community) {
      [community] = await db
        .insert(communities)
        .values({ slug: c.slug, name: c.name, description: c.description, timezone: c.timezone, createdById: owners[0]?.id ?? null })
        .returning();
      await db.insert(activityLogs).values({
        actorUserId: owners[0]?.id ?? null,
        actionType: "PROVISION_COMMUNITY",
        communityId: community.id,
        entityType: "community",
        entityId: community.id,
        metadata: { slug: c.slug, seeded: true },
      });
      console.log(`+ community /c/${c.slug}`);
    } else {
      console.log(`= community /c/${c.slug} exists`);
    }

    for (const [position, s] of c.spaces.entries()) {
      const [exists] = await db
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.communityId, community.id), eq(spaces.slug, s.slug)))
        .limit(1);
      if (!exists) {
        await db.insert(spaces).values({ communityId: community.id, position, joinPolicy: "OPEN", ...s });
        console.log(`  + space /c/${c.slug}/${s.slug}`);
      }
    }

    for (const owner of owners) {
      await db
        .insert(communityMembers)
        .values({ communityId: community.id, userId: owner.id, role: "OWNER" })
        .onConflictDoUpdate({ target: [communityMembers.communityId, communityMembers.userId], set: { role: "OWNER" } });
      console.log(`  ✓ ${owner.email} is Owner`);
    }
  }

  if (admins.length && !owners.length) {
    console.log("\nNo SUPER_ADMIN_EMAILS account has signed in yet. Sign in once, then run `pnpm db:seed` again to become Owner.");
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
