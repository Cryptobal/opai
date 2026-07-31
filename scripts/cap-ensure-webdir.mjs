/**
 * Ensures Capacitor's `webDir` ("out/") exists with a minimal index.html.
 *
 * The mobile apps load production via `server.url`, so a real static export
 * is not required for `cap add` / `cap sync`. Capacitor CLI still aborts if
 * the folder is missing — this helper creates a stub without overwriting an
 * existing build.
 *
 * Usage (via npm scripts):
 *   node scripts/cap-ensure-webdir.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "out");
const INDEX = join(OUT_DIR, "index.html");

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

if (!existsSync(INDEX)) {
  writeFileSync(
    INDEX,
    `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Opai</title>
  </head>
  <body>
    <p>Opai — Capacitor webDir stub. La app carga desde server.url en producción.</p>
  </body>
</html>
`,
    "utf8",
  );
  console.log("[cap-ensure-webdir] created out/index.html");
} else {
  console.log("[cap-ensure-webdir] out/ already present — left untouched");
}
