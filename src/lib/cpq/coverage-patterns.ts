import { SERVICE_TEMPLATES, type ServiceTemplate, type ServiceTemplatePosition } from "./service-templates";
import type { CpqCoveragePattern } from "@/types/cpq";

export interface CoveragePatternMeta {
  id: CpqCoveragePattern;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  /** Plantilla de shifts a generar al crear el grupo. Null = custom. */
  template: ServiceTemplate | null;
}

const SERVICE_TEMPLATE_BY_ID: Record<string, ServiceTemplate> = Object.fromEntries(
  SERVICE_TEMPLATES.map((t) => [t.id, t])
);

/** Catálogo único, ordenado, consumido por wizard y mobile FAB. */
export const COVERAGE_PATTERNS: CoveragePatternMeta[] = [
  {
    id: "24-7",
    label: "24/7 continuo",
    shortLabel: "24/7",
    description: "Cobertura las 24 horas, los 7 días. Genera turno día + turno noche, 4x4.",
    icon: "ShieldCheck",
    template: SERVICE_TEMPLATE_BY_ID["24-7"] ?? null,
  },
  {
    id: "12-7-dia",
    label: "12/7 Día",
    shortLabel: "12/7 Día",
    description: "Turno diurno 08:00–20:00, todos los días, 4x4.",
    icon: "Sun",
    template: SERVICE_TEMPLATE_BY_ID["12-7-dia"] ?? null,
  },
  {
    id: "12-7-noche",
    label: "12/7 Noche",
    shortLabel: "12/7 Noche",
    description: "Turno nocturno 20:00–08:00, todos los días, 4x4.",
    icon: "Moon",
    template: SERVICE_TEMPLATE_BY_ID["12-7-noche"] ?? null,
  },
  {
    id: "12-7-finde",
    label: "12/7 + Fin de semana",
    shortLabel: "12/7+FDS",
    description: "Nocturno todos los días + diurno Lun-Vie (3 guardias).",
    icon: "CalendarClock",
    template: SERVICE_TEMPLATE_BY_ID["12-7-finde"] ?? null,
  },
  {
    id: "5x2-dia",
    label: "5x2 Día (Lun-Vie)",
    shortLabel: "5x2",
    description: "1 puesto diurno, Lun a Vie, 1 guardia.",
    icon: "Calendar",
    template: {
      id: "5x2-dia",
      label: "5x2 Día Lun-Vie",
      shortLabel: "5x2",
      description: "1 puesto diurno Lun-Vie",
      icon: "Calendar",
      totalGuards: 1,
      positions: [
        {
          name: "Recepcionista / Control de Acceso Diurno",
          shiftStart: "08:00",
          shiftEnd: "18:00",
          shiftPattern: "5x2",
          daysOfWeek: ["Lun", "Mar", "Mié", "Jue", "Vie"],
          guardsCount: 1,
          baseSalary: 500000,
        },
      ],
    },
  },
  {
    id: "custom",
    label: "Personalizado",
    shortLabel: "Custom",
    description: "Crear el servicio vacío y agregar turnos manualmente.",
    icon: "Settings2",
    template: null,
  },
];

export function getCoveragePatternMeta(
  id: CpqCoveragePattern | string | null | undefined
): CoveragePatternMeta {
  return COVERAGE_PATTERNS.find((p) => p.id === id) ?? COVERAGE_PATTERNS[COVERAGE_PATTERNS.length - 1];
}

/** Helpers usados por agrupador automático de positions legacy. */
export function inferCoveragePatternFromPositions(
  positions: { startTime: string; weekdays: string[] }[]
): CpqCoveragePattern {
  if (positions.length === 0) return "custom";
  const days = new Set(positions.flatMap((p) => p.weekdays));
  const hasDay = positions.some((p) => {
    const h = parseInt(p.startTime.slice(0, 2), 10);
    return h >= 6 && h < 18;
  });
  const hasNight = positions.some((p) => {
    const h = parseInt(p.startTime.slice(0, 2), 10);
    return h >= 18 || h < 6;
  });
  const allDays = days.size === 7;
  if (hasDay && hasNight && allDays) return "24-7";
  if (hasDay && !hasNight && allDays) return "12-7-dia";
  if (!hasDay && hasNight && allDays) return "12-7-noche";
  if (hasDay && !hasNight && days.size === 5) return "5x2-dia";
  return "custom";
}

export type { ServiceTemplate, ServiceTemplatePosition };
