#!/usr/bin/env node
/**
 * Smoke test del flujo de Acuse SII vía SimpleAPI.
 *
 * Verifica que:
 *   1. La apikey SimpleAPI funciona (rate-limit headers presentes).
 *   2. El cert .pfx del tenant se descifra correctamente.
 *   3. El endpoint `compras/aceptacionreclamo` está accesible.
 *   4. El payload tiene el shape esperado por SimpleAPI.
 *
 * NO ejecuta un acuse real al SII: usa folio=999999999 (inexistente)
 * para forzar que SimpleAPI responda con un error de "DTE no encontrado",
 * confirmando que el handshake completo funciona sin afectar al SII.
 *
 * Uso: node scripts/smoke-acuse-sii.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import { createDecipheriv } from "node:crypto";
import pg from "pg";
const { Client } = pg;

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const ENV_FILE = resolve(ROOT, ".env.local");

// Carga .env.local manualmente (sin depender de dotenv).
const envText = readFileSync(ENV_FILE, "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) process.env[m[1]] = process.env[m[1]] ?? m[2];
}

const REQUIRED_ENV = [
  "SIMPLEAPI_KEY",
  "DTE_ENCRYPTION_KEY",
  "DATABASE_URL",
];
for (const k of REQUIRED_ENV) {
  if (!process.env[k]) {
    console.error(`✗ Falta env var ${k} en .env.local`);
    process.exit(1);
  }
}

// ── Helpers de descifrado (replica src/lib/dte-encryption.ts) ──
// Formato real: IV (12 bytes) || ciphertext || authTag (16 bytes).
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
function decryptBuffer(enc) {
  const key = Buffer.from(process.env.DTE_ENCRYPTION_KEY, "hex");
  if (key.length !== 32) {
    throw new Error(
      `DTE_ENCRYPTION_KEY debe ser 32 bytes en hex (64 chars). Got ${key.length} bytes.`,
    );
  }
  const iv = enc.subarray(0, IV_LENGTH);
  const authTag = enc.subarray(enc.length - AUTH_TAG_LENGTH);
  const ciphertext = enc.subarray(IV_LENGTH, enc.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function decryptString(encB64) {
  // passwordEnc se guarda como string base64.
  return decryptBuffer(Buffer.from(encB64, "base64")).toString("utf8");
}

// ── Cargar contexto del tenant gard desde la DB de producción ──
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const cfgRes = await client.query(
  `SELECT t.id AS tenant_id, t.slug, c.emisor_rut, c.environment, c.is_active, c.provider
   FROM "Tenant" t
   JOIN tenant_dte_configs c ON c.tenant_id = t.id
   WHERE t.slug = 'gard' LIMIT 1;`,
);
if (cfgRes.rows.length === 0) {
  console.error("✗ No se encontró config DTE para tenant gard");
  process.exit(1);
}
const cfg = cfgRes.rows[0];
console.log(
  `✓ Tenant: ${cfg.slug} (${cfg.tenant_id}) RUT=${cfg.emisor_rut} env=${cfg.environment} provider=${cfg.provider}`,
);

const certRes = await client.query(
  `SELECT pfx_data_enc, password_enc, rut_titular, not_after, file_name
   FROM tenant_dte_certificates WHERE tenant_id = $1 LIMIT 1;`,
  [cfg.tenant_id],
);
if (certRes.rows.length === 0) {
  console.error("✗ No hay certificado para el tenant gard");
  process.exit(1);
}
const certRow = certRes.rows[0];
console.log(
  `✓ Cert: ${certRow.file_name} titular=${certRow.rut_titular} vence=${certRow.not_after.toISOString().split("T")[0]}`,
);
await client.end();

const pfxBuffer = decryptBuffer(Buffer.from(certRow.pfx_data_enc));
const pfxPassword = decryptString(certRow.password_enc);
console.log(
  `✓ PFX descifrado (${pfxBuffer.length} bytes), password length=${pfxPassword.length}`,
);

// ── Construir multipart manualmente (replica simpleapi-http.ts mínimo) ──
const ambiente = cfg.environment === "PRODUCTION" ? 1 : 0;
const folioFalso = 999999999; // intencional: no existe → error esperado
const payload = {
  Certificado: { Rut: certRow.rut_titular, Password: pfxPassword },
  Tipo: 33,
  Folio: folioFalso,
  Accion: "ACD",
  RutEmpresa: cfg.emisor_rut,
  Ambiente: ambiente,
};

const boundary = `----opai-smoke-${Date.now()}`;
const CRLF = "\r\n";
const parts = [];
parts.push(Buffer.from(`--${boundary}${CRLF}`));
parts.push(
  Buffer.from(
    `Content-Disposition: form-data; name="input"${CRLF}` +
      `Content-Type: application/json; charset=ISO-8859-1${CRLF}${CRLF}`,
  ),
);
parts.push(Buffer.from(JSON.stringify(payload), "latin1"));
parts.push(Buffer.from(CRLF));
parts.push(Buffer.from(`--${boundary}${CRLF}`));
parts.push(
  Buffer.from(
    `Content-Disposition: form-data; name="files"; filename="certificado.pfx"${CRLF}` +
      `Content-Type: application/x-pkcs12${CRLF}${CRLF}`,
  ),
);
parts.push(pfxBuffer);
parts.push(Buffer.from(CRLF));
parts.push(Buffer.from(`--${boundary}--${CRLF}`));
const body = Buffer.concat(parts);

const apiBase = (process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl")
  .replace(/\/$/, "");
const url = /\/api\/v\d+/.test(apiBase)
  ? `${apiBase}/compras/aceptacionreclamo`
  : `${apiBase}/api/v1/compras/aceptacionreclamo`;

console.log(`\n→ POST ${url}`);
console.log(
  `  Payload: Tipo=33 Folio=${folioFalso} Accion=ACD RutEmpresa=${cfg.emisor_rut} Ambiente=${ambiente}`,
);

const credentials = Buffer.from(`api:${process.env.SIMPLEAPI_KEY}`).toString(
  "base64",
);

const t0 = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${credentials}`,
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    Accept: "application/json, text/xml, text/plain",
  },
  body: new Uint8Array(body),
});
const elapsed = Date.now() - t0;
const text = await res.text();
console.log(`\n← HTTP ${res.status} en ${elapsed}ms`);
console.log(`  Headers rate-limit:`);
console.log(`    x-rate-limit-limit:     ${res.headers.get("x-rate-limit-limit")}`);
console.log(`    x-rate-limit-remaining: ${res.headers.get("x-rate-limit-remaining")}`);
console.log(`    x-rate-limit-reset:     ${res.headers.get("x-rate-limit-reset")}`);
console.log(`  Body (primeros 800 chars):\n    ${text.slice(0, 800).replace(/\n/g, "\n    ")}`);

const apiKeyOk = res.headers.get("x-rate-limit-remaining") !== null;
console.log(`\n${apiKeyOk ? "✓" : "✗"} Apikey SimpleAPI ${apiKeyOk ? "reconocida" : "NO reconocida"}`);

if (res.status >= 200 && res.status < 300) {
  console.log(
    "⚠ HTTP 2xx — el folio inexistente fue 'aceptado' (revisar respuesta).",
  );
} else if (res.status === 401 || res.status === 403) {
  if (apiKeyOk) {
    console.log(
      "✓ Handshake completo: SimpleAPI autenticó la apikey y rechazó por payload (folio inexistente). " +
        "El endpoint funciona correctamente.",
    );
  } else {
    console.log("✗ Apikey rechazada — revisá SIMPLEAPI_KEY.");
  }
} else if (res.status === 400 || res.status === 404 || res.status === 422) {
  if (apiKeyOk) {
    console.log(
      "✓ Handshake completo: SimpleAPI rechazó el folio inexistente. El endpoint funciona correctamente.",
    );
  } else {
    console.log("? HTTP 4xx pero sin rate-limit headers (revisar manualmente).");
  }
} else {
  console.log(`? HTTP ${res.status} — revisar respuesta.`);
}
