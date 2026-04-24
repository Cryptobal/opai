/**
 * Catálogo de tipos de reportes on-demand del portal del cliente.
 *
 * Cada tipo define: etiqueta visible, descripción corta, icono (lucide name)
 * y si aplica a multi-instalación. `paramsSchema` valida los filtros.
 */

import { z } from "zod";

const baseParams = z.object({
  desde: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  hasta: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  installationId: z.string().uuid().optional(),
  guardiaId: z.string().uuid().optional(),
});

export const REPORTE_PARAMS_SCHEMA = baseParams;

export type ReporteParams = z.infer<typeof baseParams>;

export interface ReporteTypeDef {
  label: string;
  description: string;
  icon: string; // lucide icon name
  supportsXlsx: boolean;
  requiresInstallation: boolean;
}

export const REPORTE_TYPES = {
  cumplimiento_mensual: {
    label: "Cumplimiento mensual",
    description:
      "Compliance de rondas, asistencia, tickets e incidentes del período.",
    icon: "BarChart3",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  rondas_detalladas: {
    label: "Rondas detalladas",
    description:
      "Rondas con checkpoints, duración y Trust Score por guardia.",
    icon: "MapPin",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  asistencia: {
    label: "Asistencia",
    description: "Puntualidad, atrasos, ausencias y reemplazos.",
    icon: "UserCheck",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  marcaciones: {
    label: "Marcaciones",
    description: "Entrada y salida con verificación Face ID.",
    icon: "Fingerprint",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  incidentes_novedades: {
    label: "Incidentes y novedades",
    description: "Novedades de posta + incidentes reportados en ronda.",
    icon: "AlertTriangle",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  tickets: {
    label: "Tickets",
    description: "Tickets abiertos, cerrados y tiempo medio de resolución.",
    icon: "Ticket",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  turnos_extra: {
    label: "Turnos extra",
    description: "Cobertura de turnos extra: quién cubrió y horas.",
    icon: "Clock",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  cumplimiento_documental: {
    label: "Cumplimiento documental",
    description: "% guardias con OS-10 vigente y documentos al día.",
    icon: "ShieldCheck",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  desempeno_equipo: {
    label: "Desempeño del equipo",
    description: "Trust Score promedio y top guardias.",
    icon: "TrendingUp",
    supportsXlsx: true,
    requiresInstallation: false,
  },
  ejecutivo: {
    label: "Ejecutivo (1 página)",
    description: "Resumen ejecutivo con KPIs clave y tendencia mensual.",
    icon: "FileText",
    supportsXlsx: true,
    requiresInstallation: false,
  },
} as const satisfies Record<string, ReporteTypeDef>;

export type ReporteType = keyof typeof REPORTE_TYPES;

export function isReporteType(v: unknown): v is ReporteType {
  return typeof v === "string" && v in REPORTE_TYPES;
}

export function listReporteTypes(): Array<{ key: ReporteType; def: ReporteTypeDef }> {
  return (Object.keys(REPORTE_TYPES) as ReporteType[]).map((key) => ({
    key,
    def: REPORTE_TYPES[key],
  }));
}
