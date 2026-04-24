/**
 * Registry de generadores por tipo. Mantiene el mapping tipo -> generador.
 *
 * Estado actual de la Fase 1:
 *  - cumplimiento_documental: implementado (XLSX · PDF pendiente).
 *  - Otros tipos: stub que devuelve XLSX con mensaje "próximamente".
 *
 * Cada nuevo generador sólo necesita agregar su archivo y mapearlo aquí.
 */

import type { ReporteType } from "../catalog";
import type { GenerateParams, GenerateResult } from "../types";
import { toXlsx } from "../xlsx";

import { generate as genCumplimientoDocumental } from "./cumplimiento-documental";

type GeneratorFn = (params: GenerateParams) => Promise<GenerateResult>;

async function stub(params: GenerateParams, label: string): Promise<GenerateResult> {
  const xlsxBuffer = await toXlsx([
    {
      name: "Próximamente",
      columns: [
        { header: "Reporte", key: "reporte", width: 36 },
        { header: "Estado", key: "estado", width: 28 },
        { header: "Período", key: "periodo", width: 28 },
      ],
      rows: [
        {
          reporte: label,
          estado:
            "Generador en preparación · entrará en vigencia próximamente",
          periodo: `${params.desde.toISOString().slice(0, 10)} → ${params.hasta.toISOString().slice(0, 10)}`,
        },
      ],
    },
  ]);
  return {
    data: { pendiente: true, tipo: label },
    pdfBuffer: null,
    xlsxBuffer,
  };
}

export function getGenerator(type: ReporteType): GeneratorFn {
  switch (type) {
    case "cumplimiento_documental":
      return genCumplimientoDocumental;
    case "cumplimiento_mensual":
      return (p) => stub(p, "Cumplimiento mensual");
    case "rondas_detalladas":
      return (p) => stub(p, "Rondas detalladas");
    case "asistencia":
      return (p) => stub(p, "Asistencia");
    case "marcaciones":
      return (p) => stub(p, "Marcaciones");
    case "incidentes_novedades":
      return (p) => stub(p, "Incidentes y novedades");
    case "tickets":
      return (p) => stub(p, "Tickets");
    case "turnos_extra":
      return (p) => stub(p, "Turnos extra");
    case "desempeno_equipo":
      return (p) => stub(p, "Desempeño del equipo");
    case "ejecutivo":
      return (p) => stub(p, "Ejecutivo (1 página)");
    default: {
      const _exhaustive: never = type;
      throw new Error(`Tipo de reporte desconocido: ${String(_exhaustive)}`);
    }
  }
}
