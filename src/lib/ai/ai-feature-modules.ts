/**
 * AI por Módulo
 *
 * El ruteo de IA se organiza por los MÓDULOS reales de la app (los mismos de
 * la navegación / `nav/registry.ts`), para que cada tenant pueda elegir
 * proveedor + modelo por módulo — cubriendo TODOS los módulos y submódulos,
 * incluidos los que aún no tienen IA (payroll, documentos, reportes DT,
 * cumplimiento), de modo que quede listo cuando se les agregue.
 *
 * Regla: cada `feature` (el string registrado en `logAiUsage`) pertenece a un
 * módulo. Un feature no mapeado cae al módulo "general" vía heurística, así el
 * sistema nunca falla por un feature nuevo.
 */

export type AiModuleId =
  | "general"
  | "crm"
  | "finance"
  | "ops"
  | "personas"
  | "payroll"
  | "docs"
  | "reportes_dt"
  | "portales"
  | "compliance"
  | "config";

export type AiModule = {
  id: AiModuleId;
  label: string;
  description: string;
  /** Submódulos donde HOY corre IA (informativo). Vacío = sin IA aún. */
  aiSubmodules: string[];
};

/**
 * Módulos en orden de navegación. "General" primero como override catch-all
 * para features no ligados a un módulo específico.
 */
export const AI_MODULES: AiModule[] = [
  {
    id: "general",
    label: "General (otros)",
    description: "Features no ligados a un módulo específico.",
    aiSubmodules: [],
  },
  {
    id: "crm",
    label: "Comercial (CRM)",
    description: "Leads, cuentas, negocios, correos, cotizaciones.",
    aiSubmodules: [
      "Correos: sugerir respuesta, resumen de hilo, email→lead, extractores bajo demanda",
      "Correos: búsqueda semántica (embeddings)",
      "Cuentas: notas/enriquecimiento de empresa; inferencia de costo de lead",
      "Cotizaciones: cuerpos de email y detalle de servicio (CPQ)",
    ],
  },
  {
    id: "finance",
    label: "Finanzas",
    description: "Facturación DTE, rendiciones, banca, cesiones.",
    aiSubmodules: ["Factoring: extracción de simulaciones desde PDF"],
  },
  {
    id: "ops",
    label: "Operaciones",
    description: "Pautas, rondas, supervisión, tickets, inventario.",
    aiSubmodules: [
      "Rondas: Centro IA (recomendaciones)",
      "Supervisión / control nocturno: resumen ejecutivo",
      "Guardias: borrador de amonestaciones",
      "Informes de vulnerabilidad (VRA): visión y secciones",
      "Instalaciones: protocolos y exámenes",
    ],
  },
  {
    id: "personas",
    label: "Personas",
    description: "Guardias, conocimiento, onboarding, psicolaboral.",
    aiSubmodules: [
      "Psicolaboral: análisis de respuestas abiertas",
      "Conocimiento: embeddings de la base",
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    description: "Liquidaciones, períodos, anticipos, simulador.",
    aiSubmodules: [],
  },
  {
    id: "docs",
    label: "Documentos",
    description: "Gestión documental, operativos, templates.",
    aiSubmodules: [],
  },
  {
    id: "reportes_dt",
    label: "Reportes DT",
    description: "Reportes de la Dirección del Trabajo.",
    aiSubmodules: [],
  },
  {
    id: "portales",
    label: "Portales",
    description: "Guardia, cliente, rondas, marcación, control de acceso.",
    aiSubmodules: ["Control de acceso: OCR de cédula (MRZ) y patente"],
  },
  {
    id: "compliance",
    label: "Cumplimiento",
    description: "Solicitudes ARCO y cumplimiento (Ley 21.719).",
    aiSubmodules: [],
  },
  {
    id: "config",
    label: "Configuración / Asistente",
    description: "Asistente IA (help-chat), transcripción de voz.",
    aiSubmodules: [
      "Asistente IA (help-chat) y su transcripción de voz",
      "Chatbot del sitio de marketing (costo de plataforma)",
    ],
  },
];

export const DEFAULT_AI_MODULE: AiModuleId = "general";

/** Mapeo explícito feature → módulo (features registrados en logAiUsage). */
const FEATURE_MODULE: Record<string, AiModuleId> = {
  // CRM
  "correo-radar-next-step": "crm", // feature id histórico de suggestNextStepTask
  "correo-suggest-reply": "crm",
  "correo-email-to-lead": "crm",
  "correo-link-suggest": "crm",
  "correo-thread-summary": "crm",
  "correo-summary-since-read": "crm",
  "correo-embeddings": "crm",
  "correo-semantic-query": "crm",
  "correo-extract-operativo": "ops",
  "correo-extract-rrhh": "ops",
  "correo-extract-cobranza": "finance",
  "cpq-service-description": "crm",
  "proposal-content": "crm",
  // Operaciones
  vra_vision: "ops",
  vra_section: "ops",
  vra_section_regenerate: "ops",
  // Configuración / Asistente
  help_chat: "config",
  help_chat_slack: "config",
  marketing_chat: "config",
  voice_transcription: "config",
};

/**
 * Resuelve el módulo de un feature. Match exacto y, si no, heurística por
 * substrings para tolerar features nuevos sin romper el ruteo.
 */
export function moduleForFeature(feature?: string | null): AiModuleId {
  if (!feature) return DEFAULT_AI_MODULE;
  const exact = FEATURE_MODULE[feature];
  if (exact) return exact;

  const f = feature.toLowerCase();
  if (/(correo|crm|lead|quote|cotiz|cpq|propuesta|proposal|deal|negocio|account|cuenta|contact)/.test(f)) return "crm";
  if (/(vra|ronda|guard|nocturno|ops|protocol|exam|supervis|ticket|inventar|pauta)/.test(f)) return "ops";
  if (/(psych|psico|conocimiento|knowledge|persona|onboarding)/.test(f)) return "personas";
  if (/(payroll|sueldo|liquidac|anticipo|remunerac)/.test(f)) return "payroll";
  if (/(factoring|finanz|dte|rendicion|banca|cesion)/.test(f)) return "finance";
  if (/(ocr|mrz|plate|patente|acceso|portal|marcacion)/.test(f)) return "portales";
  if (/(reportes_dt|_dt_|jornada|asistencia-diaria)/.test(f)) return "reportes_dt";
  if (/(compliance|arco|cumplimiento)/.test(f)) return "compliance";
  if (/(help_chat|asistente|marketing|voice|transcri|chat)/.test(f)) return "config";
  if (/(doc|template|plantilla)/.test(f)) return "docs";
  return DEFAULT_AI_MODULE;
}

export function isValidAiModule(id: string): id is AiModuleId {
  return AI_MODULES.some((m) => m.id === id);
}
