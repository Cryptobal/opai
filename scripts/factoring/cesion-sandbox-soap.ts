/**
 * Sandbox cesión — pasos SOAP + reporte (Bloque 0).
 *
 * Estos pasos son comunes a los modos FULL y CHECK-ONLY:
 *
 *   - PASO 3: autenticación SOAP con cert digital
 *             (CrSeed → firma → GetTokenFromSeed)
 *   - PASO 4: SOAP wsRPETCConsulta.getEstEnvio (Token, TrackId)
 *   - PASO 5: veredicto + REPORT.md
 *
 * `stepSoapAndReport` retorna el exit code (0 | 2) que el orquestador
 * usa para terminar el proceso.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxArgs } from "./cesion-sandbox-args";
import { buildVeredicto, writeFinalReport } from "./cesion-sandbox-report";
import type { DteSummary } from "./cesion-sandbox-steps";
import {
  type CertMaterial,
  getEstEnvioAec,
  getSiiSeed,
  getSiiToken,
  signSeedXml,
  type SiiEnvironment,
} from "./sii-soap-helpers";

export interface SoapAndReportInput {
  args: SandboxArgs;
  certMaterial: CertMaterial;
  env: SiiEnvironment;
  trackId: string;
  /** En modo FULL viene del DTE original; en CHECK-ONLY es null. */
  dte: DteSummary | null;
  mode: "FULL" | "CHECK_ONLY";
}

/**
 * Corre los pasos 3+4+reporte y retorna el exit code apropiado.
 *
 * Side effects: escribe artefactos `05-signed-seed.xml`,
 * `06-est-envio-response.xml` y `REPORT.md` en `args.outDir`.
 */
export async function stepSoapAndReport(input: SoapAndReportInput): Promise<0 | 2> {
  const { args, certMaterial, env, trackId, dte, mode } = input;

  console.log("─".repeat(60));
  console.log("PASO 3: Autenticación SOAP con cert digital");
  console.log("─".repeat(60));

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

  // En modo FULL esperamos 5s para que SII procese el envío recién hecho.
  // En CHECK-ONLY es read-only, no hay nada que esperar.
  if (mode === "FULL") {
    console.log("   Esperando 5s para que SII procese el envío...");
    await new Promise((r) => setTimeout(r, 5000));
  }

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
    console.error(`❌ getEstEnvio falló: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log("═".repeat(60));
  const { veredicto, exitCode } = buildVeredicto(estResult, trackId);
  console.log(veredicto);
  console.log("═".repeat(60));

  writeFinalReport({ args, dte, trackId, estResult, veredicto, exitCode, mode });
  console.log(`\n📝 Reporte: ${join(args.outDir, "REPORT.md")}`);

  return exitCode;
}
