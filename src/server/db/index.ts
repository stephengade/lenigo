import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

declare global {
  var __lenigoSql: ReturnType<typeof postgres> | undefined;
}

// Supabase's transaction pooler (port 6543) does not support prepared statements.
const client =
  globalThis.__lenigoSql ??
  postgres(env.DATABASE_URL, { prepare: false, max: env.NODE_ENV === "production" ? 10 : 3 });

if (env.NODE_ENV !== "production") globalThis.__lenigoSql = client;

export const db = drizzle(client, { schema, casing: undefined });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
