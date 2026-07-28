/**
 * Registro único de comandos IA de correo (Command Layer).
 * Puro: sin Prisma ni React — importable desde cliente y servidor.
 */
import type { RadarCapability, RadarVertical } from "./radar-types";
import { VERTICAL_CAPABILITY } from "./radar-types";

export type CorreoAiCommandId =
  | "analizar"
  | "crm_completo"
  | "lead"
  | "ticket_operativo"
  | "candidato"
  | "cobranza"
  | "resumen"
  | "investigar"
  | "responder_ia";

export type CorreoAiCommand = {
  id: CorreoAiCommandId;
  label: string;
  shortLabel: string;
  /** Nombre del icono lucide; el mapeo a componente vive en el .tsx */
  icon: string;
  tone: "violet" | "emerald" | "amber" | "sky";
  capability: RadarCapability | null;
  /** "panel" ejecuta endpoint y muestra propuesta; "chat" abre el asistente. */
  kind: "panel" | "chat";
  /** true = muta datos; ocultar si el usuario solo tiene view. */
  requiresEdit: boolean;
  endpoint?: (threadId: string) => string;
  prompt?: string;
  /** Verticales donde el comando aparece en el grupo prioritario. */
  primaryFor: RadarVertical[];
};

export const CORREO_AI_COMMANDS: CorreoAiCommand[] = [
  {
    id: "analizar",
    label: "Analizar y proponer plan",
    shortLabel: "Analizar",
    icon: "Sparkles",
    tone: "violet",
    capability: "radar_comercial",
    kind: "panel",
    requiresEdit: false,
    endpoint: (id) => `/api/crm/correos/${id}/extract-structure`,
    primaryFor: [
      "comercial",
      "contratos",
      "operaciones",
      "incidentes",
      "rrhh",
      "finanzas",
      "cobranza",
      "otro",
    ],
  },
  {
    id: "crm_completo",
    label: "Crear CRM completo",
    shortLabel: "CRM completo",
    icon: "Building2",
    tone: "violet",
    capability: "radar_comercial",
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract-structure`,
    primaryFor: ["comercial", "contratos"],
  },
  {
    id: "lead",
    label: "Crear lead con IA",
    shortLabel: "Lead",
    icon: "UserPlus",
    tone: "emerald",
    capability: "radar_comercial",
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract`,
    primaryFor: ["comercial", "contratos"],
  },
  {
    id: "ticket_operativo",
    label: "Abrir ticket operativo",
    shortLabel: "Ticket",
    icon: "TicketPlus",
    tone: "amber",
    capability: "radar_operaciones",
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract-operativo`,
    primaryFor: ["operaciones", "incidentes"],
  },
  {
    id: "candidato",
    label: "Crear candidato en ATS",
    shortLabel: "Candidato",
    icon: "UserRoundCheck",
    tone: "sky",
    capability: "radar_rrhh",
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract-rrhh`,
    primaryFor: ["rrhh"],
  },
  {
    id: "cobranza",
    label: "Contexto de cobranza",
    shortLabel: "Cobranza",
    icon: "Wallet",
    tone: "amber",
    capability: "radar_finanzas",
    kind: "panel",
    requiresEdit: false,
    endpoint: (id) => `/api/crm/correos/${id}/extract-cobranza`,
    primaryFor: ["finanzas", "cobranza"],
  },
  {
    id: "resumen",
    label: "Resumir hilo",
    shortLabel: "Resumen",
    icon: "FileText",
    tone: "violet",
    capability: null,
    kind: "chat",
    requiresEdit: false,
    prompt:
      "Resumí este hilo de correo: puntos clave, compromisos, próximos pasos y si hay señal comercial u operativa.",
    primaryFor: ["otro"],
  },
  {
    id: "investigar",
    label: "Investigar a fondo",
    shortLabel: "Investigar",
    icon: "Search",
    tone: "violet",
    capability: null,
    kind: "chat",
    requiresEdit: false,
    prompt:
      "Investigá a fondo este correo: extraé entidades, riesgos, cobertura/dotación si aplica y proponé un plan de acciones CRM.",
    primaryFor: [],
  },
  {
    id: "responder_ia",
    label: "Responder con IA",
    shortLabel: "Responder IA",
    icon: "MessageSquare",
    tone: "violet",
    capability: null,
    kind: "chat",
    requiresEdit: false,
    prompt:
      "Redactá una respuesta profesional a este correo, en tono cortés y concreto, lista para enviar.",
    primaryFor: [],
  },
];

const BY_ID = Object.fromEntries(CORREO_AI_COMMANDS.map((c) => [c.id, c])) as Record<
  CorreoAiCommandId,
  CorreoAiCommand
>;

export function getCorreoAiCommand(id: CorreoAiCommandId): CorreoAiCommand {
  return BY_ID[id];
}

const VERTICAL_LABEL: Record<RadarVertical, string> = {
  comercial: "Comercial",
  contratos: "Contratos",
  operaciones: "Operaciones",
  incidentes: "Incidentes",
  rrhh: "RRHH",
  finanzas: "Finanzas",
  cobranza: "Cobranza",
  otro: "Otro",
};

/** Etiqueta legible para el header del menú (Radar: Comercial). */
export function radarVerticalLabel(aiVertical: string | null): string {
  if (!aiVertical) return "sin señal";
  const v = aiVertical as RadarVertical;
  return VERTICAL_LABEL[v] ?? aiVertical;
}

function parseVertical(aiVertical: string | null): RadarVertical | null {
  if (!aiVertical) return null;
  if (aiVertical in VERTICAL_CAPABILITY) return aiVertical as RadarVertical;
  return null;
}

function isAllowed(
  cmd: CorreoAiCommand,
  caps: Set<RadarCapability>,
  canEditCorreos: boolean,
): boolean {
  if (cmd.requiresEdit && !canEditCorreos) return false;
  if (cmd.capability && !caps.has(cmd.capability)) return false;
  return true;
}

/**
 * Devuelve { primary, more } según la vertical del hilo y las capabilities.
 * `analizar` siempre primero en primary cuando es visible. Máximo 3 en primary.
 */
export function resolveCorreoAiCommands(
  aiVertical: string | null,
  caps: Set<RadarCapability>,
  opts?: { canEditCorreos?: boolean },
): { primary: CorreoAiCommand[]; more: CorreoAiCommand[] } {
  const canEdit = opts?.canEditCorreos !== false;
  const vertical = parseVertical(aiVertical);

  // Sin ninguna capability de radar el grupo IA no existe (menú queda como hoy).
  if (caps.size === 0) return { primary: [], more: [] };

  const visible = CORREO_AI_COMMANDS.filter((c) => isAllowed(c, caps, canEdit));
  if (visible.length === 0) return { primary: [], more: [] };

  // Vertical null/otro: priorizar analizar + resumen.
  const primaryIds: CorreoAiCommandId[] = [];
  const pushUnique = (id: CorreoAiCommandId) => {
    if (!primaryIds.includes(id) && visible.some((c) => c.id === id)) {
      primaryIds.push(id);
    }
  };

  pushUnique("analizar");

  if (vertical === "comercial" || vertical === "contratos") {
    pushUnique("crm_completo");
    pushUnique("lead");
  } else if (vertical === "operaciones" || vertical === "incidentes") {
    pushUnique("ticket_operativo");
  } else if (vertical === "rrhh") {
    pushUnique("candidato");
  } else if (vertical === "finanzas" || vertical === "cobranza") {
    pushUnique("cobranza");
  } else {
    // otro / null
    pushUnique("resumen");
  }

  const primary = primaryIds
    .slice(0, 3)
    .map((id) => visible.find((c) => c.id === id)!)
    .filter(Boolean);

  const primarySet = new Set(primary.map((c) => c.id));
  const more = visible.filter((c) => !primarySet.has(c.id));

  return { primary, more };
}

/** Capability del Radar asociada a la vertical del hilo (null si no aplica). */
export function capabilityForThreadVertical(
  aiVertical: string | null,
): RadarCapability | null {
  const v = parseVertical(aiVertical);
  if (!v) return null;
  return VERTICAL_CAPABILITY[v];
}
