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
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxArgs } from "./cesion-sandbox-args";
import type { DteSummary } from "./cesion-sandbox-steps";
import type { EstEnvioResult } from "./sii-soap-helpers";

export interface FinalReport {
  args: SandboxArgs;
  dte: DteSummary;
  trackId: string;
  estResult: EstEnvioResult;
  veredicto: string;
  exitCode: 0 | 2;
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

export function writeFinalReport(report: FinalReport): void {
  const md = `# Sandbox Cesión — Reporte
Fecha: ${new Date().toISOString()}

## Inputs
- Ambiente: ${report.args.ambiente}
- DTE: tipo ${report.dte.tipoDte} folio ${report.dte.folio}
- Cedente: ${report.args.razonEmisor} (${report.args.rutEmisor})
- Cesionario: ${report.args.razonCesionario} (${report.args.rutCesionario})
- Monto cesión: $${report.args.montoCesion.toLocaleString("es-CL")}

## Resultado
- ✅ AEC generado y firmado
- ✅ Envío al SII OK, TrackId: **${report.trackId}**
- Estado actual SII: **${report.estResult.estadoEnvio ?? "—"}** (${report.estResult.descEstado ?? "—"})

## Veredicto
${report.veredicto}

## Archivos
- 01-generar-request.json: payload enviado a SimpleAPI
- 01-generar-response.bin: response cruda de SimpleAPI
- 02-aec.xml: AEC firmado por SimpleAPI
- 03-enviar-request.json: payload de envío
- 04-enviar-response.json: response con TrackId
- 05-signed-seed.xml: semilla firmada con cert
- 06-est-envio-response.xml: response SOAP getEstEnvio

## Próximo paso
- Si veredicto es ÉXITO → proceder con bloques 1-10 del plan factoring v3
- Si es EN PROCESO → reintentar después; el flujo está bien, solo SII tarda
- Si es RECHAZADO → revisar el AEC en 02-aec.xml según el código de error
`;
  writeFileSync(join(report.args.outDir, "REPORT.md"), md);
}
