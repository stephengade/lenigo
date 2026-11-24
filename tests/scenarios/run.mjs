/**
 * Runs the scenario tests (tests/scenarios/flows.mts) against a throwaway database:
 *   pnpm test:scenarios
 *
 * - Postgres is PGlite (Postgres 17 in WASM, in memory) with every migration in drizzle/ applied,
 *   served over the wire protocol on a local port. Nothing touches your real database.
 * - Email goes to a fake ZeptoMail on localhost that only records what was sent, so nothing is
 *   delivered. flows.mts reads it back from MAIL_SINK_URL.
 * - Supabase points at a closed local port, so any accidental Supabase call fails fast.
 * Your .env is not read.
 */
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import net from "node:net";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ── Database ─────────────────────────────────────────────────────── */
const pg = await PGlite.create();
const migrations = join(root, "drizzle");
for (const f of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
  for (const stmt of readFileSync(join(migrations, f), "utf8").split("--> statement-breakpoint")) if (stmt.trim()) await pg.exec(stmt);
}

// PGlite is single-threaded: run one protocol batch at a time. Extended-protocol messages are
// buffered until Sync/Query/Flush, as a real backend would see them, so postgres-js works.
let chain = Promise.resolve();
const run = (bytes) => (chain = chain.then(() => pg.execProtocolRaw(bytes, { syncToFs: false })));
const dbServer = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  let started = false;
  let pending = [];
  let local = Promise.resolve();
  sock.on("error", () => {});
  sock.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    local = local
      .then(async () => {
        for (;;) {
          if (!started) {
            if (buf.length < 8) return;
            const len = buf.readInt32BE(0);
            if (buf.readInt32BE(4) === 80877103) {
              sock.write("N"); // no SSL
              buf = buf.subarray(8);
              continue;
            }
            if (buf.length < len) return;
            const msg = buf.subarray(0, len);
            buf = buf.subarray(len);
            started = true;
            sock.write(Buffer.from(await run(new Uint8Array(msg))));
            continue;
          }
          if (buf.length < 5) return;
          const type = String.fromCharCode(buf[0]);
          const len = buf.readInt32BE(1);
          if (buf.length < 1 + len) return;
          const msg = buf.subarray(0, 1 + len);
          buf = buf.subarray(1 + len);
          if (type === "X") return void sock.end();
          pending.push(msg);
          if (type === "S" || type === "Q" || type === "H") {
            const out = await run(new Uint8Array(Buffer.concat(pending)));
            pending = [];
            if (out.length) sock.write(Buffer.from(out));
          }
        }
      })
      .catch((e) => {
        console.error("db server error", e);
        sock.destroy();
      });
  });
});
await new Promise((r) => dbServer.listen(0, "127.0.0.1", r));
const dbPort = dbServer.address().port;

/* ── Fake ZeptoMail ───────────────────────────────────────────────── */
const sent = [];
let down = false; // PUT /mode "down" makes sends fail, to test retries
const mail = createHttpServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/v1.1/email") {
      if (req.headers.authorization !== "Zoho-enczapikey test-token") return res.writeHead(401).end("{}");
      if (down) return res.writeHead(503).end(JSON.stringify({ error: { message: "Service unavailable" } }));
      sent.push(JSON.parse(body));
      return res.writeHead(201).end(JSON.stringify({ data: [{ code: "EM_104", message: "Email request received" }] }));
    }
    if (req.method === "GET" && req.url === "/sent") return res.end(JSON.stringify(sent));
    if (req.method === "PUT" && req.url === "/mode") return (down = body.trim() === "down"), res.end("{}");
    if (req.method === "DELETE" && req.url === "/sent") return (sent.length = 0), res.end("[]");
    res.writeHead(404).end("{}");
  });
});
await new Promise((r) => mail.listen(0, "127.0.0.1", r));
const mailUrl = `http://127.0.0.1:${mail.address().port}`;

/* ── Run the scenarios ────────────────────────────────────────────── */
const env = {
  PATH: process.env.PATH,
  Path: process.env.Path,
  SystemRoot: process.env.SystemRoot,
  TEMP: process.env.TEMP,
  TMP: process.env.TMP,
  HOME: process.env.HOME,
  USERPROFILE: process.env.USERPROFILE,
  APPDATA: process.env.APPDATA,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  NODE_ENV: "test",
  NODE_OPTIONS: `--import=${pathToFileURL(join(root, "tests", "scenarios", "preload.mjs")).href}`,
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${dbPort}/postgres`,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  ZEPTOMAIL_PASSWORD: "test-token",
  ZEPTOMAIL_API_URL: `${mailUrl}/v1.1/email`,
  EMAIL_FROM: "Lenigo <noreply@example.test>",
  SUPER_ADMIN_EMAILS: "root@example.test",
  MAIL_SINK_URL: `${mailUrl}/sent`,
};
for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];

const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const child = spawn(process.execPath, [tsx, "--tsconfig", join(root, "tsconfig.json"), join(root, "tests", "scenarios", "flows.mts")], {
  cwd: root,
  env,
  stdio: "inherit",
});
const code = await new Promise((r) => child.on("exit", (c) => r(c ?? 1)));
dbServer.close();
mail.close();
await pg.close();
process.exit(code);
