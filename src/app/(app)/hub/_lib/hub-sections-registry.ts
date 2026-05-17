import type { LucideIcon } from "lucide-react";
import {
  TrendingUp,
  FileSignature,
  Activity,
  Building2,
  ClipboardCheck,
  Ticket,
  Users,
  Briefcase,
  Wallet,
  Banknote,
  History,
  BarChart3,
} from "lucide-react";
import type {
  HubPerms,
  ClosingHubData,
  FinanceMetrics,
  OpsMetrics,
  TicketMetrics,
  SupervisionMetrics,
  AtsMetrics,
  PayrollMetrics,
  PersonasMetrics,
} from "./hub-types";

/**
 * Section keys estables. NO cambiar el valor de una key existente —
 * romperá los `hubOrder` ya guardados por usuarios. Para renombrar
 * visualmente, cambiar solo `label`. Para retirar una sección,
 * agregar `deprecated: true` y filtrar en el wrapper.
 */
export const HUB_SECTION_KEYS = [
  "executive_kpis",
  "crm",
  "contratos_cliente",
  "ops",
  "installation_health",
  "supervision",
  "tickets",
  "personas",
  "ats",
  "payroll",
  "finanzas",
  "activity",
] as const;

export type HubSectionKey = (typeof HUB_SECTION_KEYS)[number];

export interface HubSectionDataBag {
  closingData: ClosingHubData | null;
  opsMetrics: OpsMetrics | null;
  financeMetrics: FinanceMetrics | null;
  ticketMetrics: TicketMetrics;
  supervisionMetrics: SupervisionMetrics | null;
  atsMetrics: AtsMetrics | null;
  payrollMetrics: PayrollMetrics | null;
  personasMetrics: PersonasMetrics | null;
}

export interface HubSectionMeta {
  key: HubSectionKey;
  label: string;
  icon: LucideIcon;
  /** Predicado de visibilidad: si retorna false, la sección no se renderiza
   *  ni siquiera en modo edición. Si retorna true, se renderiza (salvo que
   *  el usuario la haya ocultado). */
  isAvailable: (perms: HubPerms, data: HubSectionDataBag) => boolean;
}

export const HUB_SECTIONS: HubSectionMeta[] = [
  {
    key: "executive_kpis",
    label: "Pulso del negocio",
    icon: BarChart3,
    isAvailable: () => true,
  },
  {
    key: "crm",
    label: "Pipeline comercial",
    icon: TrendingUp,
    isAvailable: (perms, data) => perms.hasCrm && !!data.closingData,
  },
  {
    key: "contratos_cliente",
    label: "Contratos cliente",
    icon: FileSignature,
    isAvailable: (perms) => perms.hasCrm,
  },
  {
    key: "ops",
    label: "Operaciones",
    icon: Activity,
    isAvailable: (perms, data) => perms.hasOps && !!data.opsMetrics,
  },
  {
    key: "installation_health",
    label: "Salud por instalación",
    icon: Building2,
    isAvailable: (perms) => perms.hasSupervision,
  },
  {
    key: "supervision",
    label: "Supervisión",
    icon: ClipboardCheck,
    isAvailable: (perms, data) => perms.hasSupervision && !!data.supervisionMetrics,
  },
  {
    key: "tickets",
    label: "Tickets",
    icon: Ticket,
    isAvailable: () => true,
  },
  {
    key: "personas",
    label: "Personas",
    icon: Users,
    isAvailable: (perms, data) => perms.hasPersonas && !!data.personasMetrics,
  },
  {
    key: "ats",
    label: "ATS — Reclutamiento",
    icon: Briefcase,
    isAvailable: (perms, data) => perms.hasAts && !!data.atsMetrics,
  },
  {
    key: "payroll",
    label: "Payroll",
    icon: Wallet,
    isAvailable: (perms, data) => perms.hasPayroll && !!data.payrollMetrics,
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: Banknote,
    isAvailable: (perms, data) => perms.hasFinance && !!data.financeMetrics,
  },
  {
    key: "activity",
    label: "Actividad reciente",
    icon: History,
    isAvailable: () => true,
  },
];

export const DEFAULT_HUB_ORDER: HubSectionKey[] = HUB_SECTIONS.map((s) => s.key);

/**
 * Resuelve el orden efectivo de secciones a renderizar para un usuario.
 *
 * Algoritmo:
 *  1. Filtrar `HUB_SECTIONS` por `isAvailable(perms, data)` → secciones que
 *     el usuario PUEDE ver dadas sus capabilities y los datos disponibles.
 *  2. Excluir las que están en `hubHidden`.
 *  3. Aplicar `hubOrder` del usuario:
 *     - Primero, las keys de `hubOrder` que estén en el conjunto disponible
 *       (ignora keys huérfanas tras refactors).
 *     - Después, las disponibles que NO estaban en `hubOrder` (típicamente
 *       secciones nuevas tras un upgrade), en su orden default.
 *
 * Retorna: array ordenado de `HubSectionMeta` lista para renderizar.
 */
export function resolveHubOrder(
  perms: HubPerms,
  data: HubSectionDataBag,
  prefs: { hubOrder: HubSectionKey[]; hubHidden: HubSectionKey[] },
): HubSectionMeta[] {
  const available = HUB_SECTIONS.filter(
    (s) => s.isAvailable(perms, data) && !prefs.hubHidden.includes(s.key),
  );
  const availableByKey = new Map(available.map((s) => [s.key, s]));

  const ordered: HubSectionMeta[] = [];
  const seen = new Set<HubSectionKey>();

  for (const key of prefs.hubOrder) {
    const section = availableByKey.get(key);
    if (section && !seen.has(key)) {
      ordered.push(section);
      seen.add(key);
    }
  }

  for (const section of available) {
    if (!seen.has(section.key)) {
      ordered.push(section);
    }
  }

  return ordered;
}

/**
 * Resuelve qué secciones están ocultas por el usuario pero seguirían
 * disponibles si las reactivara. Usado en modo edición para listarlas
 * con un toggle "mostrar de nuevo".
 */
export function resolveHiddenSections(
  perms: HubPerms,
  data: HubSectionDataBag,
  prefs: { hubHidden: HubSectionKey[] },
): HubSectionMeta[] {
  return HUB_SECTIONS.filter(
    (s) => s.isAvailable(perms, data) && prefs.hubHidden.includes(s.key),
  );
}

/** Type guard runtime: ¿este string es una HubSectionKey válida? */
export function isHubSectionKey(s: string): s is HubSectionKey {
  return (HUB_SECTION_KEYS as readonly string[]).includes(s);
}
