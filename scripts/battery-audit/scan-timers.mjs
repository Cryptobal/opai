#!/usr/bin/env node
/**
 * Static scan: setInterval / setTimeout / visibilityState usage in source files.
 * Usage: node scripts/battery-audit/scan-timers.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "coverage",
  "ios",
  "android",
  "public",
]);
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const PATTERNS = [
  { name: "setInterval", re: /\bsetInterval\s*\(/g },
  { name: "setTimeout", re: /\bsetTimeout\s*\(/g },
  { name: "visibilityState", re: /\bvisibilityState\b/g },
  { name: "visibilitychange", re: /visibilitychange/g },
  { name: "requestAnimationFrame", re: /\brequestAnimationFrame\s*\(/g },
  { name: "watchPosition", re: /\.watchPosition\s*\(/g },
  { name: "replayIntegration", re: /\breplayIntegration\s*\(/g },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".env.example") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(full, out);
    } else if (EXT.has(path.extname(ent.name))) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(ROOT);
const summary = Object.fromEntries(PATTERNS.map((p) => [p.name, { files: 0, hits: 0 }]));
const byFile = [];

for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const rel = path.relative(ROOT, file);
  const row = { file: rel, matches: {} };
  let any = false;
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0;
    const n = (text.match(re) || []).length;
    if (n > 0) {
      row.matches[name] = n;
      summary[name].files += 1;
      summary[name].hits += n;
      any = true;
    }
  }
  if (any) byFile.push(row);
}

const setIntervalFiles = byFile
  .filter((r) => r.matches.setInterval)
  .map((r) => ({
    file: r.file,
    setInterval: r.matches.setInterval,
    visibilityAware: Boolean(r.matches.visibilityState || r.matches.visibilitychange),
  }));

console.log(JSON.stringify({
  scannedFiles: files.length,
  summary,
  setIntervalWithoutVisibility: setIntervalFiles.filter((f) => !f.visibilityAware),
  setIntervalWithVisibility: setIntervalFiles.filter((f) => f.visibilityAware),
}, null, 2));
