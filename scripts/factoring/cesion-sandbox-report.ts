/**
 * Sandbox cesión — generación del veredicto y reporte final (Bloque 0).
 *
 * Mapea el ESTADO_ENVIO oficial del SII (PDF v1.2 ws_consulta_estado_aec.pdf)
 * a uno de tres veredictos accionables:
 *
 *   ÉXITO       → exit 0 — sandbox aprobado, proceder con bloques 1-10
 *   EN PROCESO  → exit 0 — el flujo está bien, SII está validando
 *   RECHAZADO   → exit 2 — revisar AEC y re-intentar
 *   DESCONOCIDO → exit 2 — escalar al equipo
 *
 * El reporte incluye solo los archivos efectivamente generados según
 * el modo:
 *   - FULL: 01-04 (SimpleAPI) + 05-06 (SOAP) + DTE info
 *   - CHECK-ONLY: solo 05-06 (SOAP)
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxArgs } from "./cesion-sandbox-args";
import type { DteSummary } from "./cesion-sandbox-steps";
import type { EstEnvioResult } from "./sii-soap-helpers";

export interface FinalReport {
  args: SandboxArgs;
  /** En CHECK-ONLY no hay DTE asociado en disco. */
  dte: DteSummary | null;
  trackId: string;
  estResult: EstEnvioResult;
  veredicto: string;
  exitCode: 0 | 2;
  mode: "FULL" | "CHECK_ONLY";
}

const ACEPTADOS = ["EOK", "EPR"] as const;
const EN_PROCESO = ["UPL", "RCP", "SOK", "FSO", "COK", "VDC", "VCS"] as const;
const RECHAZADOS = ["RSC", "RFS", "RCR", "RDC", "RCS", "EAN"] as const;

export function buildVeredicto(
  est: EstEnvioResult,
  trackId: string,
): { veredicto: string; exitCode: 0 | 2 } {
  const ee = est.estadoEnvio ?? "";
  if ((ACEPTADOS as readonly string[]).includes(ee)) {
    return {
      veredicto: "✅ ÉXITO TOTAL — SII anotó la cesión (EOK)",
      exitCode: 0,
    };
  }
  if ((EN_PROCESO as readonly string[]).includes(ee)) {
    return {
      veredicto:
        `🟡 EN PROCESO — SII está validando (${ee}). Reintenta en 1-5 min ` +
        `consultando el TrackId ${trackId} en el portal SII o re-ejecutando el sandbox.`,
      exitCode: 0,
    };
  }
  if ((RECHAZADOS as readonly string[]).includes(ee)) {
    return {
      veredicto:
        `❌ RECHAZADO POR SII — Estado: ${ee}. Glosa: ${est.descEstado ?? "—"}. ` +
        `Revisar AEC en 02-aec.xml y reenviar.`,
      exitCode: 2,
    };
  }
  return {
    veredicto: `⚠️  ESTADO DESCONOCIDO: "${ee}". Reportar al equipo.`,
    exitCode: 2,
  };
}

function buildInputsSection(report: FinalReport): string {
  if (report.mode === "CHECK_ONLY") {
    return [
      `- Modo: CHECK-ONLY (solo consulta SOAP, no se emitió nada)`,
      `- Ambiente: ${report.args.ambiente}`,
      `- TrackId consultado: ${report.trackId}`,
      `- Cert titular: ${report.args.rutTitular}`,
    ].join("\n");
  }
  const dte = report.dte;
  return [
    `- Modo: FULL (generar AEC + enviar + consultar)`,
    `- Ambiente: ${report.args.ambiente}`,
    `- DTE: tipo ${dte?.tipoDte ?? "—"} folio ${dte?.folio ?? "—"}`,
    `- Cedente: ${report.args.razonEmisor} (${report.args.rutEmisor})`,
    `- Cesionario: ${report.args.razonCesionario} (${report.args.rutCesionario})`,
    `- Monto cesión: $${report.args.montoCesion.toLocaleString("es-CL")}`,
  ].join("\n");
}

function buildResultadoSection(report: FinalReport): string {
  if (report.mode === "CHECK_ONLY") {
    return [
      `- ✅ Auth SOAP con cert OK`,
      `- ✅ Consulta SOAP getEstEnvio OK`,
      `- TrackId consultado: **${report.trackId}**`,
      `- Estado actual SII: **${report.estResult.estadoEnvio ?? "—"}** (${report.estResult.descEstado ?? "—"})`,
    ].join("\n");
  }
  return [
    `- ✅ AEC generado y firmado`,
    `- ✅ Envío al SII OK, TrackId: **${report.trackId}**`,
    `- Estado actual SII: **${report.estResult.estadoEnvio ?? "—"}** (${report.estResult.descEstado ?? "—"})`,
  ].join("\n");
}

function buildArchivosSection(mode: FinalReport["mode"]): string {
  const fullFiles = [
    "- 01-generar-request.json: payload enviado a SimpleAPI",
    "- 01-generar-response.bin: response cruda de SimpleAPI",
    "- 02-aec.xml: AEC firmado por SimpleAPI",
    "- 03-enviar-request.json: payload de envío",
    "- 04-enviar-response.json: response con TrackId",
  ];
  const soapFiles = [
    "- 05-signed-seed.xml: semilla firmada con cert",
    "- 06-est-envio-response.xml: response SOAP getEstEnvio",
  ];
  return (mode === "CHECK_ONLY" ? soapFiles : [...fullFiles, ...soapFiles]).join("\n");
}

export function writeFinalReport(report: FinalReport): void {
  const md = `# Sandbox Cesión — Reporte
Fecha: ${new Date().toISOString()}

## Inputs
${buildInputsSection(report)}

## Resultado
${buildResultadoSection(report)}

## Veredicto
${report.veredicto}

## Archivos
${buildArchivosSection(report.mode)}

## Próximo paso
- Si veredicto es ÉXITO → proceder con bloques 1-10 del plan factoring v3
- Si es EN PROCESO → reintentar después; el flujo está bien, solo SII tarda
- Si es RECHAZADO → revisar el AEC en 02-aec.xml según el código de error
`;
  writeFileSync(join(report.args.outDir, "REPORT.md"), md);
}
