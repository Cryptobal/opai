#!/usr/bin/env tsx
/**
 * Sandbox de validación de cesión electrónica end-to-end.
 *
 * Bloque 0 del plan factoring v3 — PRE-REQUISITO obligatorio antes de
 * ejecutar los bloques 1-10. Si este sandbox no llega a un ESTADO_ENVIO
 * aceptado o en proceso, el resto del plan se bloquea hasta resolverlo.
 *
 * Flujo (ver README.md):
 *   1. POST  /api/v1/dte/cesion/generar   → AEC firmado
 *   2. Validar AEC (DocumentoAEC, Signature, declaración jurada)
 *   3. POST  /api/v1/cesion/enviar        → TrackId
 *   4. SOAP  CrSeed → firma → GetTokenFromSeed con cert
 *   5. SOAP  wsRPETCConsulta.getEstEnvio  → estado oficial SII
 *
 * Códigos de salida:
 *   0 = éxito (ESTADO_ENVIO ∈ {EOK, EPR, UPL, RCP, SOK, FSO, COK, VDC, VCS})
 *   1 = error sistémico (cert, payload, network, etc.)
 *   2 = SII rechazó (ESTADO_ENVIO ∈ {RSC, RFS, RCR, RDC, RCS, EAN})
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArguments } from "./cesion-sandbox-args";
import { buildVeredicto, writeFinalReport } from "./cesion-sandbox-report";
import {
  extractDteSummary,
  step1Generar,
  step2Enviar,
} from "./cesion-sandbox-steps";
import {
  extractCertFromPfx,
  getEstEnvioAec,
  getSiiSeed,
  getSiiToken,
  signSeedXml,
  type SiiEnvironment,
} from "./sii-soap-helpers";

function die(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = parseArguments();
  mkdirSync(args.outDir, { recursive: true });

  console.log("🔧 Sandbox cesión SimpleAPI + SII RPETC end-to-end");
  console.log(`   Out dir: ${args.outDir}`);
  console.log(`   Ambiente: ${args.ambiente}\n`);

  const pfxBuffer = readFileSync(args.cert);
  const dteXmlBuffer = readFileSync(args.dteXml);
  console.log(`✅ Cert: ${pfxBuffer.length} bytes`);
  console.log(`✅ DTE: ${dteXmlBuffer.length} bytes\n`);

  let certMaterial: ReturnType<typeof extractCertFromPfx>;
  try {
    certMaterial = extractCertFromPfx(pfxBuffer, args.certPwd);
    console.log("✅ Cert parseado OK\n");
  } catch (err) {
    die(`No se pudo abrir el .pfx: ${(err as Error).message}`);
  }

  const dte = extractDteSummary(dteXmlBuffer.toString("latin1"));
  console.log(
    `📄 DTE: tipo=${dte.tipoDte} folio=${dte.folio} fecha=${dte.fechaEmision} ` +
      `receptor=${dte.rutReceptor} monto=${dte.montoTotal}\n`,
  );

  const aecXmlBuffer = await step1Generar(args, pfxBuffer, dteXmlBuffer, dte);
  const trackId = await step2Enviar(args, aecXmlBuffer, dte.folio);

  console.log("─".repeat(60));
  console.log("PASO 3: Autenticación SOAP con cert digital");
  console.log("─".repeat(60));

  const env: SiiEnvironment =
    args.ambiente === "production" ? "PRODUCTION" : "CERTIFICATION";
  let token: string;
  try {
    const seed = await getSiiSeed(env);
    console.log(`✅ Semilla obtenida: ${seed}`);
    const signedXml = signSeedXml(seed, certMaterial);
    writeFileSync(join(args.outDir, "05-signed-seed.xml"), signedXml);
    token = await getSiiToken(env, signedXml);
    console.log(`✅ Token obtenido: ${token.slice(0, 20)}...\n`);
  } catch (err) {
    console.error(`❌ Auth SOAP falló: ${(err as Error).message}`);
    console.error(
      "   Esto suele ser por: cert vencido, cert no autorizado en SII, o RUT del titular incorrecto.",
    );
    process.exit(1);
  }

  console.log("─".repeat(60));
  console.log("PASO 4: SOAP wsRPETCConsulta.getEstEnvio");
  console.log("─".repeat(60));
  console.log("   Esperando 5s para que SII procese el envío...");
  await new Promise((r) => setTimeout(r, 5000));

  let estResult: Awaited<ReturnType<typeof getEstEnvioAec>>;
  try {
    estResult = await getEstEnvioAec(env, token, trackId);
    writeFileSync(join(args.outDir, "06-est-envio-response.xml"), estResult.rawXml);
    console.log(
      `📥 ESTADO HDR: ${estResult.estado} ${estResult.glosa ? `(${estResult.glosa})` : ""}`,
    );
    console.log(`   ESTADO_ENVIO: ${estResult.estadoEnvio ?? "—"}`);
    console.log(`   DESC_ESTADO: ${estResult.descEstado ?? "—"}\n`);
  } catch (err) {
    die(`getEstEnvio falló: ${(err as Error).message}`);
  }

  console.log("═".repeat(60));
  const { veredicto, exitCode } = buildVeredicto(estResult, trackId);
  console.log(veredicto);
  console.log("═".repeat(60));

  writeFinalReport({ args, dte, trackId, estResult, veredicto, exitCode });
  console.log(`\n📝 Reporte: ${join(args.outDir, "REPORT.md")}`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("❌ FATAL:", err);
  process.exit(1);
});
