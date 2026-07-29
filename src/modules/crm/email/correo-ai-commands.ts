/**
 * Registro único de comandos IA de correo (Command Layer).
 * Puro: sin Prisma ni React — importable desde cliente y servidor.
 */
import {
  canView,
  hasCapability,
  hasModuleAccess,
  type ModuleKey,
  type RolePermissions,
} from "@/lib/permissions";

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
  /**
   * Módulo/submódulo destino a validar.
   * null = solo requiere capability `copiloto_correos`.
   * Nota: la clave real del módulo Finanzas es `finance` (no `finanzas`).
   */
  requiresModule: { module: ModuleKey; submodule?: string } | null;
  /** "panel" ejecuta endpoint y muestra propuesta; "chat" abre el asistente. */
  kind: "panel" | "chat";
  /** true = muta datos; ocultar si el usuario solo tiene view. */
  requiresEdit: boolean;
  endpoint?: (threadId: string) => string;
  prompt?: string;
};

export const CORREO_AI_COMMANDS: CorreoAiCommand[] = [
  {
    id: "analizar",
    label: "Analizar y proponer plan",
    shortLabel: "Analizar",
    icon: "Sparkles",
    tone: "violet",
    requiresModule: null,
    kind: "panel",
    requiresEdit: false,
    endpoint: (id) => `/api/crm/correos/${id}/extract-structure`,
  },
  {
    id: "crm_completo",
    label: "Crear CRM completo",
    shortLabel: "CRM completo",
    icon: "Building2",
    tone: "violet",
    requiresModule: null,
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract-structure`,
  },
  {
    id: "lead",
    label: "Crear lead con IA",
    shortLabel: "Lead",
    icon: "UserPlus",
    tone: "emerald",
    requiresModule: null,
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract`,
  },
  {
    id: "ticket_operativo",
    label: "Abrir ticket operativo",
    shortLabel: "Ticket",
    icon: "TicketPlus",
    tone: "amber",
    requiresModule: { module: "ops", submodule: "tickets" },
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract-operativo`,
  },
  {
    id: "candidato",
    label: "Crear candidato en ATS",
    shortLabel: "Candidato",
    icon: "UserRoundCheck",
    tone: "sky",
    requiresModule: { module: "ops", submodule: "ats" },
    kind: "panel",
    requiresEdit: true,
    endpoint: (id) => `/api/crm/correos/${id}/extract-rrhh`,
  },
  {
    id: "cobranza",
    label: "Contexto de cobranza",
    shortLabel: "Cobranza",
    icon: "Wallet",
    tone: "amber",
    // Clave canónica del módulo: `finance` (ruta UI /finanzas).
    requiresModule: { module: "finance" },
    kind: "panel",
    requiresEdit: false,
    endpoint: (id) => `/api/crm/correos/${id}/extract-cobranza`,
  },
  {
    id: "resumen",
    label: "Resumir hilo",
    shortLabel: "Resumen",
    icon: "FileText",
    tone: "violet",
    requiresModule: null,
    kind: "chat",
    requiresEdit: false,
    prompt:
      "Resumí este hilo de correo: puntos clave, compromisos, próximos pasos y si hay señal comercial u operativa.",
  },
  {
    id: "investigar",
    label: "Investigar a fondo",
    shortLabel: "Investigar",
    icon: "Search",
    tone: "violet",
    requiresModule: null,
    kind: "chat",
    requiresEdit: false,
    prompt:
      "Investigá a fondo este correo: extraé entidades, riesgos, cobertura/dotación si aplica y proponé un plan de acciones CRM.",
  },
  {
    id: "responder_ia",
    label: "Responder con IA",
    shortLabel: "Responder IA",
    icon: "MessageSquare",
    tone: "violet",
    requiresModule: null,
    kind: "chat",
    requiresEdit: false,
    prompt:
      "Redactá una respuesta profesional a este correo, en tono cortés y concreto, lista para enviar.",
  },
];

const BY_ID = Object.fromEntries(CORREO_AI_COMMANDS.map((c) => [c.id, c])) as Record<
  CorreoAiCommandId,
  CorreoAiCommand
>;

export function getCorreoAiCommand(id: CorreoAiCommandId): CorreoAiCommand {
  return BY_ID[id];
}

function moduleAllowed(
  cmd: CorreoAiCommand,
  perms: RolePermissions,
): boolean {
  if (!cmd.requiresModule) return true;
  const { module, submodule } = cmd.requiresModule;
  if (submodule) return canView(perms, module, submodule);
  return hasModuleAccess(perms, module);
}

function isAllowed(
  cmd: CorreoAiCommand,
  perms: RolePermissions,
  canEditCorreos: boolean,
): boolean {
  if (cmd.requiresEdit && !canEditCorreos) return false;
  if (!moduleAllowed(cmd, perms)) return false;
  return true;
}

/**
 * Devuelve { primary, more } según copiloto_correos y acceso a módulos destino.
 * Orden fijo de primary: analizar → resumen → crm_completo. Máximo 3.
 */
export function resolveCorreoAiCommands(
  perms: RolePermissions,
  opts?: { canEditCorreos?: boolean },
): { primary: CorreoAiCommand[]; more: CorreoAiCommand[] } {
  const canEdit = opts?.canEditCorreos !== false;

  if (!hasCapability(perms, "copiloto_correos")) {
    return { primary: [], more: [] };
  }

  const visible = CORREO_AI_COMMANDS.filter((c) => isAllowed(c, perms, canEdit));
  if (visible.length === 0) return { primary: [], more: [] };

  const primaryIds: CorreoAiCommandId[] = ["analizar", "resumen", "crm_completo"];
  const primary = primaryIds
    .map((id) => visible.find((c) => c.id === id))
    .filter((c): c is CorreoAiCommand => Boolean(c))
    .slice(0, 3);

  const primarySet = new Set(primary.map((c) => c.id));
  const more = visible.filter((c) => !primarySet.has(c.id));

  return { primary, more };
}

/**
 * Comando principal sugerido según la categoría del clasificador.
 * Puro: no filtra por permisos — usar `resolvePrimaryCorreoAiCommand`.
 */
export function primaryCommandForCategory(
  aiCategory: string | null | undefined,
  _aiVertical?: string | null,
): CorreoAiCommandId {
  switch (aiCategory) {
    case "licitacion":
    case "cotizacion":
      return "analizar";
    case "consulta_comercial":
      return "lead";
    case "operacional":
      return "ticket_operativo";
    case "facturacion":
      return "cobranza";
    default:
      return "analizar";
  }
}

const PRIMARY_LABEL: Partial<Record<CorreoAiCommandId, { title: string; subtitle: string }>> = {
  analizar: {
    title: "Analizar con IA",
    subtitle: "Extrae estructura, cobertura y plan de acciones",
  },
  lead: {
    title: "Crear lead",
    subtitle: "Propone un lead comercial desde el hilo",
  },
  ticket_operativo: {
    title: "Abrir ticket operativo",
    subtitle: "Borrador de ticket para operaciones",
  },
  cobranza: {
    title: "Ver contexto de cobranza",
    subtitle: "Resume señales financieras del hilo",
  },
  crm_completo: {
    title: "Crear CRM completo",
    subtitle: "Cuenta, contacto, negocio e instalaciones",
  },
  candidato: {
    title: "Crear candidato en ATS",
    subtitle: "Extrae datos de postulación",
  },
};

/** Etiqueta de la acción principal según categoría (UI). */
export function primaryActionCopy(
  aiCategory: string | null | undefined,
  commandId: CorreoAiCommandId,
): { title: string; subtitle: string } {
  if (commandId === "analizar") {
    if (aiCategory === "licitacion") {
      return {
        title: "Armar la licitación",
        subtitle: "Cuenta, negocio, cobertura, dotación y plazo en agenda",
      };
    }
    if (aiCategory === "cotizacion") {
      return {
        title: "Preparar la cotización",
        subtitle: "Estructura comercial y plan de acciones",
      };
    }
  }
  return (
    PRIMARY_LABEL[commandId] ?? {
      title: getCorreoAiCommand(commandId).label,
      subtitle: getCorreoAiCommand(commandId).shortLabel,
    }
  );
}

/**
 * Resuelve el comando principal visible: mapeo por categoría filtrado por
 * permisos. Si el preferido no está disponible, cae al primero de
 * `resolveCorreoAiCommands.primary`; si no hay ninguno, null.
 */
export function resolvePrimaryCorreoAiCommand(
  aiCategory: string | null | undefined,
  perms: RolePermissions,
  opts?: { canEditCorreos?: boolean },
): CorreoAiCommand | null {
  const { primary, more } = resolveCorreoAiCommands(perms, opts);
  const available = [...primary, ...more];
  if (available.length === 0) return null;

  const preferredId = primaryCommandForCategory(aiCategory);
  const preferred = available.find((c) => c.id === preferredId);
  if (preferred) return preferred;

  return available[0] ?? null;
}
