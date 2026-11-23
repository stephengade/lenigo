import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations run over Supabase's direct (session) connection, not the transaction pooler.
// `drizzle-kit generate` works offline; migrate/push/studio need a real URL.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://missing-DIRECT_URL-in-.env";

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  // Only manage our tables; leave Supabase's auth/storage schemas alone.
  schemaFilter: ["public"],
  strict: true,
  verbose: true,
});
