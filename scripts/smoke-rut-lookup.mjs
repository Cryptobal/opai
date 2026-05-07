#!/usr/bin/env node
/**
 * Smoke test del endpoint SimpleAPI de consulta RUT.
 *
 * Uso:  RUT=12345678-9 node scripts/smoke-rut-lookup.mjs
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";

const ENV = resolve(new URL(".", import.meta.url).pathname, "..", ".env.local");
for (const line of readFileSync(ENV, "utf8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) process.env[m[1]] = process.env[m[1]] ?? m[2];
}

if (!process.env.RUT) {
  console.error("Falta RUT en env. Uso: RUT=12345678-9 node scripts/smoke-rut-lookup.mjs");
  process.exit(1);
}
const rut = process.env.RUT.replace(/[^\dKk-]/g, "").toUpperCase();
const apikey = process.env.SIMPLEAPI_KEY;
if (!apikey) {
  console.error("Falta SIMPLEAPI_KEY en .env.local");
  process.exit(1);
}

const url = `https://rut.simpleapi.cl/v2/${rut}`;
const auth = "Basic " + Buffer.from(`api:${apikey}`).toString("base64");

console.log(`→ GET ${url}`);
const t0 = Date.now();
const res = await fetch(url, {
  method: "GET",
  headers: { Authorization: auth, Accept: "application/json" },
});
const text = await res.text();
const ms = Date.now() - t0;
console.log(`← HTTP ${res.status} en ${ms}ms`);
console.log(`  rate-limit-remaining: ${res.headers.get("x-rate-limit-remaining")}`);
console.log(`  Body (${text.length} chars):`);

if (res.ok) {
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text.slice(0, 2000));
  }
} else {
  console.log(`  ${text.slice(0, 600)}`);
}
