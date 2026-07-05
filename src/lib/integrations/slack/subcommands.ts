/**
 * Registro declarativo de subcomandos de `/opai` (Fase 5, Bloque 7).
 *
 * Agregar un subcomando = agregar una entrada acá; `/opai ayuda` y el dispatch
 * se generan del registro. Dos clases:
 *  - `prompt`: traduce a un mensaje para el asistente (runHelpChatTurn).
 *  - `modal`: abre un modal nativo por `callbackId` (mismo del shortcut).
 */

import { BRIEF_PROMPT } from "./daily-brief";

export type SubCommand =
  | { name: string; description: string; usage?: string; kind: "prompt"; toPrompt: (rest: string) => string }
  | { name: string; description: string; usage?: string; kind: "modal"; callbackId: string };

export const SUBCOMMANDS: SubCommand[] = [
  {
    name: "acciones",
    description: "menú de acciones rápidas (tickets, rendición, operación)",
    kind: "modal",
    callbackId: "opai_acciones",
  },
  {
    name: "tickets",
    description: "tu bandeja de tickets (agrega `vencidos` para filtrar por SLA)",
    usage: "tickets [vencidos]",
    kind: "modal",
    callbackId: "opai_tickets",
  },
  {
    name: "aprobaciones",
    description: "pendientes de tu aprobación (tickets · rendiciones · turnos extra)",
    kind: "modal",
    callbackId: "opai_aprobaciones",
  },
  {
    name: "brief",
    description: "brief ejecutivo del día (tickets, aprobaciones, cotizaciones, caja)",
    kind: "prompt",
    toPrompt: () => BRIEF_PROMPT,
  },
  {
    name: "caja",
    description: "resumen ejecutivo de caja y proyección del mes",
    kind: "prompt",
    toPrompt: () => "Resumen ejecutivo de la caja actual y proyección del mes",
  },
  {
    name: "asistencia",
    description: "resumen de asistencia de hoy",
    kind: "prompt",
    toPrompt: () => "Resumen de asistencia de hoy",
  },
  {
    name: "buscar",
    description: "busca en todo el sistema",
    usage: "buscar <texto>",
    kind: "prompt",
    toPrompt: (rest) => `Busca en todo el sistema (usa la herramienta search_all) y resume: ${rest}`,
  },
  {
    name: "ticket",
    description: "crea un ticket de Operaciones",
    kind: "modal",
    callbackId: "opai_crear_ticket",
  },
  {
    name: "rendicion",
    description: "registra una rendición de gasto",
    kind: "modal",
    callbackId: "opai_nueva_rendicion",
  },
  {
    name: "rendiciones",
    description: "tus rendiciones: ver estado y crear nuevas",
    kind: "modal",
    callbackId: "opai_mis_rendiciones",
  },
  {
    name: "leads",
    description: "bandeja de leads (agrega `nuevos` para ver los sin tomar)",
    usage: "leads [nuevos]",
    kind: "modal",
    callbackId: "opai_leads",
  },
  {
    name: "pipeline",
    description: "pipeline comercial por etapa (negocios abiertos)",
    kind: "modal",
    callbackId: "opai_pipeline",
  },
  {
    name: "negocio",
    description: "busca un negocio por nombre, cuenta o instalación (incluye cerrados)",
    usage: "negocio <texto>",
    kind: "modal",
    callbackId: "opai_negocio",
  },
  {
    name: "cuenta",
    description: "busca un cliente por nombre o RUT (ficha: instalaciones, negocios, cotización, pago)",
    usage: "cuenta <texto> (alias: cliente · instalacion)",
    kind: "modal",
    callbackId: "opai_cuenta",
  },
  {
    name: "negocios",
    description: "tus negocios abiertos ordenados por riesgo (con acciones de pipeline)",
    kind: "modal",
    callbackId: "opai_mis_negocios",
  },
  {
    name: "cotizaciones",
    description: "bandeja de cotizaciones (filtra por estado)",
    usage: "cotizaciones [enviadas|borrador|aceptadas|rechazadas]",
    kind: "modal",
    callbackId: "opai_cotizaciones",
  },
  {
    name: "documentos",
    description: "documentos por vencer (vencidos · esta semana · en trámite)",
    kind: "modal",
    callbackId: "opai_documentos",
  },
];

export function buildHelpText(): string {
  const lines = [
    "*OPAI Intelligence en Slack*",
    "• `/opai <pregunta>` — pregunta libre al asistente",
  ];
  for (const c of SUBCOMMANDS) {
    lines.push(`• \`/opai ${c.usage ?? c.name}\` — ${c.description}`);
  }
  lines.push(
    "• `/opai ayuda` — esta ayuda",
    "",
    "*Ejemplos de tickets:*",
    "• `/opai tickets` — abre tu bandeja de tickets asignados",
    "• `/opai tickets vencidos` — sólo los que tienen el SLA vencido",
    "",
    "También puedes mencionarme (`@OPAI`) en un canal o escribirme por DM, y abrir la pestaña *Inicio* de OPAI en Slack para tu panel personal.",
  );
  return lines.join("\n");
}
