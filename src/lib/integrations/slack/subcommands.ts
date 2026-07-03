/**
 * Registro declarativo de subcomandos de `/opai` (Fase 5, Bloque 7).
 *
 * Agregar un subcomando = agregar una entrada acá; `/opai ayuda` y el dispatch
 * se generan del registro. Dos clases:
 *  - `prompt`: traduce a un mensaje para el asistente (runHelpChatTurn).
 *  - `modal`: abre un modal nativo por `callbackId` (mismo del shortcut).
 */

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
    "También puedes mencionarme (`@OPAI`) en un canal o escribirme por DM.",
  );
  return lines.join("\n");
}
