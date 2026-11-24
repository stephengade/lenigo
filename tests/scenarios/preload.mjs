/**
 * Lets the scenario run import server modules outside Next.js. `server-only` throws unless the
 * "react-server" condition is on, but that condition also swaps in builds of React that can't
 * render emails. So resolve `server-only` to an empty module instead (ESM and CJS).
 */
import { register, createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const empty = new URL("./empty.cjs", import.meta.url);

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, next) {
        if (s === "server-only") return { url: ${JSON.stringify(empty.href)}, shortCircuit: true };
        return next(s, c);
      }`,
    ),
);

const Module = createRequire(import.meta.url)("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return fileURLToPath(empty);
  return original.call(this, request, ...rest);
};
