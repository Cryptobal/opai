/** Perfiles de agente por módulo (puro, sin Prisma — usable en client). */

export const AI_AGENT_MODULES = [
  "global",
  "comercial",
  "operaciones",
  "finanzas",
  "payroll",
  "personas",
  "documentos",
] as const;

export type AiAgentModule = (typeof AI_AGENT_MODULES)[number];

export type AiAgentProfile = {
  enabled: boolean;
  instructions: string;
};

export const AGENT_INSTRUCTIONS_MAX = 2000;

const AI_AGENT_MODULE_SET = new Set<string>(AI_AGENT_MODULES);

export function sanitizeAgents(
  raw: unknown,
): Partial<Record<AiAgentModule, AiAgentProfile>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const out: Partial<Record<AiAgentModule, AiAgentProfile>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!AI_AGENT_MODULE_SET.has(key)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const profile = value as Record<string, unknown>;
    const instructions =
      typeof profile.instructions === "string"
        ? profile.instructions.trim().slice(0, AGENT_INSTRUCTIONS_MAX)
        : "";
    if (!instructions && typeof profile.enabled !== "boolean") continue;
    const enabled =
      typeof profile.enabled === "boolean" ? profile.enabled : instructions.length > 0;
    out[key as AiAgentModule] = { enabled, instructions };
  }
  return out;
}

/**
 * Prefijos alineados con `describeModule` en help-chat/stream.
 * `global` no se resuelve por pathname (siempre aplica aparte).
 */
export function resolveAgentModule(pathname: string): AiAgentModule | null {
  const p = pathname.toLowerCase();
  if (p.startsWith("/crm") || p.startsWith("/cpq")) return "comercial";
  if (p.startsWith("/ops")) return "operaciones";
  if (p.startsWith("/finanzas")) return "finanzas";
  if (p.startsWith("/payroll")) return "payroll";
  if (p.startsWith("/personas")) return "personas";
  if (p.startsWith("/opai/documentos") || p.startsWith("/docs")) return "documentos";
  return null;
}

/** Extrae instrucciones activas para el system prompt (solo enabled + texto). */
export function pickAgentInstructionsForPrompt(
  agents: Partial<Record<AiAgentModule, AiAgentProfile>>,
  pathname?: string | null,
): { global?: string; module?: { key: string; text: string } } | undefined {
  const global =
    agents.global?.enabled && agents.global.instructions
      ? agents.global.instructions
      : undefined;
  const modKey = pathname ? resolveAgentModule(pathname) : null;
  const modProfile = modKey ? agents[modKey] : undefined;
  const module =
    modKey && modProfile?.enabled && modProfile.instructions
      ? { key: modKey, text: modProfile.instructions }
      : undefined;
  if (!global && !module) return undefined;
  return { global, module };
}
