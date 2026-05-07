#!/usr/bin/env node
/**
 * Prueba REAL del flujo de Acuse SII vía SimpleAPI.
 *
 * ⚠ ATENCIÓN: este script ejecuta un acuse REAL al SII (ACD + ERM).
 * El cambio queda firme en el SII y NO es reversible desde OPAI.
 * Solo correrlo cuando el operador del tenant lo autorice explícitamente.
 *
 * Replica el flujo de `dte-received-acuse.service.ts → applyAcuse(action="ACCEPT")`:
 *   1. Carga config + cert del tenant gard.
 *   2. Llama POST compras/aceptacionreclamo con Accion=ACD.
 *   3. Si ACD OK, llama de nuevo con Accion=ERM (habilita crédito IVA).
 *   4. Si todo OK, UPDATE en DB: receptionStatus=ACCEPTED, audit trail.
 *
 * Uso:
 *   DTE_ID=950f7f37-ee70-498d-a892-994615bfaebc \
 *   FOLIO=2871084 TIPO=34 \
 *     node scripts/prove-acuse-sii.mjs
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Buffer } from "node:buffer";
import { createDecipheriv } from "node:crypto";
import pg from "pg";
const { Client } = pg;

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const ENV_FILE = resolve(ROOT, ".env.local");

const envText = readFileSync(ENV_FILE, "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"]*)"?\s*$/);
  if (m) process.env[m[1]] = process.env[m[1]] ?? m[2];
}

const DTE_ID = process.env.DTE_ID;
const FOLIO = Number(process.env.FOLIO ?? 0);
const TIPO = Number(process.env.TIPO ?? 0);
if (!DTE_ID || !FOLIO || !TIPO) {
  console.error("Falta env DTE_ID, FOLIO o TIPO");
  process.exit(1);
}

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
function decryptBuffer(enc) {
  const key = Buffer.from(process.env.DTE_ENCRYPTION_KEY, "hex");
  const iv = enc.subarray(0, IV_LENGTH);
  const authTag = enc.subarray(enc.length - AUTH_TAG_LENGTH);
  const ciphertext = enc.subarray(IV_LENGTH, enc.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
function decryptString(b64) {
  return decryptBuffer(Buffer.from(b64, "base64")).toString("utf8");
}

// ── Cargar contexto + DTE desde DB ──
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const dteRes = await client.query(
  `SELECT id, dte_type, folio, issuer_rut, issuer_name, total_amount,
          reception_status, tenant_id
     FROM finance.finance_dtes
    WHERE id = $1 AND direction = 'RECEIVED' LIMIT 1;`,
  [DTE_ID],
);
if (dteRes.rows.length === 0) {
  console.error("✗ DTE no encontrado");
  await client.end();
  process.exit(1);
}
const dte = dteRes.rows[0];
console.log(
  `✓ DTE: ${dte.issuer_name} (${dte.issuer_rut}) tipo=${dte.dte_type} folio=${dte.folio} $${dte.total_amount} estado=${dte.reception_status}`,
);
if (dte.reception_status !== "PENDING_REVIEW") {
  console.error(`✗ DTE no está en PENDING_REVIEW (está ${dte.reception_status}). Abortando.`);
  await client.end();
  process.exit(1);
}
if (dte.dte_type !== TIPO || dte.folio !== FOLIO) {
  console.error(`✗ Mismatch entre env y DB. ENV: tipo=${TIPO} folio=${FOLIO}, DB: tipo=${dte.dte_type} folio=${dte.folio}`);
  await client.end();
  process.exit(1);
}

const cfgRes = await client.query(
  `SELECT emisor_rut, environment, is_active, provider FROM tenant_dte_configs WHERE tenant_id = $1 LIMIT 1;`,
  [dte.tenant_id],
);
const cfg = cfgRes.rows[0];

const certRes = await client.query(
  `SELECT pfx_data_enc, password_enc, rut_titular, not_after FROM tenant_dte_certificates WHERE tenant_id = $1 LIMIT 1;`,
  [dte.tenant_id],
);
const cert = certRes.rows[0];
console.log(
  `✓ Tenant cfg: rut=${cfg.emisor_rut} env=${cfg.environment} | Cert titular=${cert.rut_titular} vence=${cert.not_after.toISOString().split("T")[0]}`,
);

const pfxBuffer = decryptBuffer(Buffer.from(cert.pfx_data_enc));
const pfxPassword = decryptString(cert.password_enc);

// ── Helper para llamar SimpleAPI ──
const apiBase = (process.env.SIMPLEAPI_BASE_URL ?? "https://api.simpleapi.cl")
  .replace(/\/$/, "");
const url = /\/api\/v\d+/.test(apiBase)
  ? `${apiBase}/compras/aceptacionreclamo`
  : `${apiBase}/api/v1/compras/aceptacionreclamo`;
const credentials = Buffer.from(`api:${process.env.SIMPLEAPI_KEY}`).toString("base64");

async function callAcuse(accion) {
  const ambiente = cfg.environment === "PRODUCTION" ? 1 : 0;
  // RutEmpresa = RUT del PROVEEDOR que emitió el DTE (no del receptor).
  // Doc oficial Postman SimpleAPI: "Rut de la empresa proveedora que
  // emitió el documento a aceptar/rechazar".
  const payload = {
    Certificado: { Rut: cert.rut_titular, Password: pfxPassword },
    Tipo: dte.dte_type,
    Folio: dte.folio,
    Accion: accion,
    RutEmpresa: dte.issuer_rut,
    Ambiente: ambiente,
  };

  // El JSON se codifica en UTF-8 (no ISO-8859-1) porque la respuesta del
  // endpoint y el ejemplo Postman así lo muestran. El cron RCV usa latin1
  // pero ese es para XMLs SII; este endpoint admite payload JSON UTF-8.
  const boundary = `----opai-prove-${Date.now()}`;
  const CRLF = "\r\n";
  const parts = [];
  parts.push(Buffer.from(`--${boundary}${CRLF}`));
  parts.push(
    Buffer.from(
      `Content-Disposition: form-data; name="input"${CRLF}` +
        `Content-Type: application/json${CRLF}${CRLF}`,
    ),
  );
  parts.push(Buffer.from(JSON.stringify(payload), "utf8"));
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

  console.log(`\n→ POST ${accion} (Tipo=${dte.dte_type} Folio=${dte.folio} RutEmpresa=${payload.RutEmpresa})`);
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
  const text = await res.text();
  const elapsed = Date.now() - t0;
  console.log(`← HTTP ${res.status} en ${elapsed}ms`);
  console.log(`  Headers:`);
  res.headers.forEach((v, k) => console.log(`    ${k}: ${v}`));
  console.log(`  Body (${text.length} chars):\n    ${text.slice(0, 1500).replace(/\n/g, "\n    ") || "(vacío)"}`);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, text, json };
}

// ── Paso 1: ACD ──
const acd = await callAcuse("ACD");
if (!acd.ok) {
  console.error(`\n✗ ACD falló (HTTP ${acd.status}). NO se ejecuta ERM ni se actualiza DB.`);
  await client.end();
  process.exit(1);
}
console.log(`\n✓ ACD aceptado por SII.`);

// SimpleAPI rate-limit es 1/seg → esperar 1.5s entre llamadas.
await new Promise((r) => setTimeout(r, 1500));

// ── Paso 2: ERM ──
const erm = await callAcuse("ERM");
if (!erm.ok) {
  console.error(`\n⚠ ACD OK pero ERM falló (HTTP ${erm.status}). El DTE quedó aceptado en SII pero sin habilitar crédito IVA.`);
  // Igual actualizamos la DB con ACCEPTED — el SII ya tiene la aceptación de contenido.
}
if (erm.ok) console.log(`\n✓ ERM aceptado por SII (crédito IVA habilitado).`);

const trackId = erm.json?.TrackId ?? erm.json?.trackId ?? acd.json?.TrackId ?? acd.json?.trackId;

// ── Paso 3: actualizar DB ──
const decidedAt = new Date();
const auditLine =
  `[${decidedAt.toISOString()}] SII ACD+ERM por system:manual-test` +
  (trackId ? ` (TrackId: ${trackId})` : "") +
  (erm.ok ? "" : " — WARN: ERM falló, solo ACD OK");

console.log(`\n→ UPDATE finance.finance_dtes SET reception_status='ACCEPTED', ...`);
const upd = await client.query(
  `UPDATE finance.finance_dtes
      SET reception_status = 'ACCEPTED',
          reception_decided_at = $1,
          reception_decided_by = 'system:manual-test',
          claim_type = NULL,
          notes = COALESCE(notes || E'\n', '') || $2,
          updated_at = NOW()
    WHERE id = $3
    RETURNING reception_status, reception_decided_at, reception_decided_by, notes;`,
  [decidedAt, auditLine, dte.id],
);
console.log(`← OK. Nuevo estado:`);
console.log(JSON.stringify(upd.rows[0], null, 2));

await client.end();
console.log(`\n${erm.ok ? "✓✓ ÉXITO COMPLETO" : "✓⚠ ÉXITO PARCIAL (solo ACD)"}: la próxima vez que SimpleAPI sincronice el RCV, el SII reflejará ACCEPTED.`);
