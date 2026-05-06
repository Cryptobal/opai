#!/usr/bin/env node
/**
 * Diagnóstico end-to-end de SimpleAPI usando la apikey de .env.local.
 *
 * Hace 1 request al endpoint folios/get/33 (el que más info devuelve) y
 * pasa la respuesta por la misma lógica `detectApiKeyBlocked` que usa
 * el código de producción. Lo que ves en consola es el mismo mensaje
 * que vería el usuario en el toast del UI.
 *
 * Ejecutar: node scripts/diagnose-simpleapi.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
}

function detectApiKeyBlocked(status, bodyText) {
  const body = bodyText.toLowerCase();
  if (
    status === 429 ||
    body.includes("rate limit") ||
    body.includes("too many requests")
  ) {
    return {
      reason: "RATE_LIMIT",
      message:
        "SimpleAPI rate limit (máx 1/sec, 5/min, 100/hora). Esperá unos minutos y reintentá.",
    };
  }
  if (
    body.includes("vencida") ||
    body.includes("vencido") ||
    body.includes("expirada") ||
    body.includes("expirado") ||
    body.includes("expired")
  ) {
    return {
      reason: "EXPIRED",
      message:
        "La apikey de SimpleAPI está VENCIDA (plan/contrato expirado). Andá a https://panel.simpleapi.cl/ → tu cuenta, renová el plan y actualizá SIMPLEAPI_KEY en Vercel si te dieron una nueva. Sin esto NO podés emitir DTEs.",
    };
  }
  if (
    (status === 401 || status === 402 || status === 403) &&
    (body.includes("límite mensual") ||
      body.includes("limit mensual") ||
      body.includes("cupo") ||
      body.includes("bloqueada") ||
      body.includes("blocked"))
  ) {
    return {
      reason: "QUOTA",
      message:
        "Apikey de SimpleAPI bloqueada (cupo mensual excedido). Desbloqueá inmediatamente en https://panel.simpleapi.cl/ contratando Peticiones de Respaldo, o subí de plan.",
    };
  }
  return null;
}

const env = loadEnvLocal();
const apiKey = env.SIMPLEAPI_KEY;
if (!apiKey) {
  console.error("❌ SIMPLEAPI_KEY ausente en .env.local");
  process.exit(1);
}

const auth = "Basic " + Buffer.from("api:" + apiKey).toString("base64");
const url = "https://servicios.simpleapi.cl/api/folios/get/33";

const boundary = `----diag-${Date.now()}`;
const body = Buffer.from(
  `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="input"\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `{}\r\n` +
    `--${boundary}--\r\n`,
);

console.log(`→ POST ${url}\n→ Authorization: Basic <base64(api:${apiKey.slice(0, 4)}...)>\n`);

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: auth,
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
  },
  body,
});

const text = await res.text();
const rlRemaining = res.headers.get("x-rate-limit-remaining");
const apiKeyAuthenticated = rlRemaining !== null;

console.log("← HTTP", res.status);
console.log("← Body:", text.slice(0, 500) || "(vacío)");
console.log("← x-rate-limit-remaining:", rlRemaining);
console.log("← apikey reconocida:", apiKeyAuthenticated);

const blocked = detectApiKeyBlocked(res.status, text);

console.log("\n──────── DIAGNÓSTICO (lo que vería el usuario) ────────");
if (blocked) {
  console.log(`❌ ${blocked.reason}: ${blocked.message}`);
} else if (res.ok) {
  console.log("✅ Conexión exitosa con SimpleAPI.");
} else if (apiKeyAuthenticated) {
  console.log(
    `❌ HTTP ${res.status} con apikey reconocida — el provider rechazó el cert/payload.`,
  );
} else {
  console.log(`❌ HTTP ${res.status} sin pista clara: ${text.slice(0, 200)}`);
}
console.log("───────────────────────────────────────────────────────");

process.exit(res.ok ? 0 : 2);
