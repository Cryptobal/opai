#!/usr/bin/env tsx
/**
 * Sandbox de validación de cesión electrónica end-to-end.
 *
 * Bloque 0 del plan factoring v3 — PRE-REQUISITO obligatorio antes de
 * ejecutar los bloques 1-10. Soporta dos modos:
 *
 *   FULL (default) — flujo end-to-end:
 *     1. POST  /api/v1/dte/cesion/generar   → AEC firmado
 *     2. Validar AEC (DocumentoAEC, Signature, declaración jurada)
 *     3. POST  /api/v1/cesion/enviar        → TrackId
 *     4. SOAP  CrSeed → firma → GetTokenFromSeed con cert
 *     5. SOAP  wsRPETCConsulta.getEstEnvio  → estado oficial SII
 *
 *   CHECK-ONLY (--check-only) — solo consulta SOAP:
 *     1. SOAP  CrSeed → firma → GetTokenFromSeed con cert
 *     2. SOAP  wsRPETCConsulta.getEstEnvio  → estado oficial SII
 *
 *   Read-only, no modifica nada en SII. Útil para validar la integración
 *   contra una cesión real ya anotada (ver README.md).
 *
 * Códigos de salida:
 *   0 = éxito (ESTADO_ENVIO ∈ {EOK, EPR, UPL, RCP, SOK, FSO, COK, VDC, VCS})
 *   1 = error sistémico (cert, payload, network, etc.)
 *   2 = SII rechazó (ESTADO_ENVIO ∈ {RSC, RFS, RCR, RDC, RCS, EAN})
 */

import { mkdirSync, readFileSync } from "node:fs";
import { parseArguments, type SandboxArgs } from "./cesion-sandbox-args";
import { stepSoapAndReport } from "./cesion-sandbox-soap";
import {
  type DteSummary,
  extractDteSummary,
  step1Generar,
  step2Enviar,
} from "./cesion-sandbox-steps";
import {
  type CertMaterial,
  extractCertFromPfx,
  type SiiEnvironment,
} from "./sii-soap-helpers";

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function loadCert(args: SandboxArgs): { pfxBuffer: Buffer; certMaterial: CertMaterial } {
  const pfxBuffer = readFileSync(args.cert);
  console.log(`✅ Cert: ${pfxBuffer.length} bytes`);
  try {
    const certMaterial = extractCertFromPfx(pfxBuffer, args.certPwd);
    console.log("✅ Cert parseado OK\n");
    return { pfxBuffer, certMaterial };
  } catch (err) {
    die(`No se pudo abrir el .pfx: ${(err as Error).message}`);
  }
}

async function runFullMode(
  args: SandboxArgs,
  certMaterial: CertMaterial,
  pfxBuffer: Buffer,
  env: SiiEnvironment,
): Promise<{ trackId: string; dte: DteSummary }> {
  const dteXmlBuffer = readFileSync(args.dteXml);
  console.log(`✅ DTE: ${dteXmlBuffer.length} bytes\n`);

  const dte = extractDteSummary(dteXmlBuffer.toString("latin1"));
  console.log(
    `📄 DTE: tipo=${dte.tipoDte} folio=${dte.folio} fecha=${dte.fechaEmision} ` +
      `receptor=${dte.rutReceptor} monto=${dte.montoTotal}\n`,
  );

  const aecXmlBuffer = await step1Generar(args, pfxBuffer, dteXmlBuffer, dte);
  const trackId = await step2Enviar(args, aecXmlBuffer, dte.folio);
  return { trackId, dte };
}

async function main(): Promise<void> {
  const args = parseArguments();
  mkdirSync(args.outDir, { recursive: true });

  const modeLabel = args.checkOnly ? "CHECK-ONLY (read-only SOAP)" : "FULL (end-to-end)";
  console.log("🔧 Sandbox cesión SimpleAPI + SII RPETC");
  console.log(`   Modo: ${modeLabel}`);
  console.log(`   Out dir: ${args.outDir}`);
  console.log(`   Ambiente: ${args.ambiente}\n`);

  const { pfxBuffer, certMaterial } = loadCert(args);
  const env: SiiEnvironment =
    args.ambiente === "production" ? "PRODUCTION" : "CERTIFICATION";

  let trackId: string;
  let dte: DteSummary | null = null;
  if (args.checkOnly) {
    trackId = args.trackId;
    console.log(`📌 TrackId a consultar: ${trackId}\n`);
  } else {
    const result = await runFullMode(args, certMaterial, pfxBuffer, env);
    trackId = result.trackId;
    dte = result.dte;
  }

  const exitCode = await stepSoapAndReport({
    args,
    certMaterial,
    env,
    trackId,
    dte,
    mode: args.checkOnly ? "CHECK_ONLY" : "FULL",
  });
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
