import { prisma } from "@/lib/prisma";

export const AI_HELP_CHAT_DEFAULT_ROLES = ["owner", "admin", "editor"] as const;

/** Módulos con perfil de agente editable por tenant (Setting JSON). */
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

export type AiHelpChatConfig = {
  enabled: boolean;
  allowedRoles: string[];
  allowDataQuestions: boolean;
  allowWrites: boolean;
  /** Perfiles de agente por módulo; vacío = sin instrucciones custom. */
  agents: Partial<Record<AiAgentModule, AiAgentProfile>>;
};

const AGENT_INSTRUCTIONS_MAX = 2000;

const DEFAULT_CONFIG: AiHelpChatConfig = {
  enabled: true,
  allowedRoles: [...AI_HELP_CHAT_DEFAULT_ROLES],
  allowDataQuestions: true,
  allowWrites: true,
  agents: {},
};

const AI_AGENT_MODULE_SET = new Set<string>(AI_AGENT_MODULES);

function configKey(tenantId: string): string {
  return `ai_help_chat_config:${tenantId}`;
}

function normalizeRoles(input: unknown): string[] {
  if (!Array.isArray(input)) return [...AI_HELP_CHAT_DEFAULT_ROLES];
  const unique = new Set<string>();
  for (const item of input) {
    if (typeof item !== "string") continue;
    const role = item.trim().toLowerCase();
    if (!role) continue;
    unique.add(role);
  }
  return unique.size > 0 ? [...unique] : [...AI_HELP_CHAT_DEFAULT_ROLES];
}

function sanitizeAgents(raw: unknown): Partial<Record<AiAgentModule, AiAgentProfile>> {
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

export function sanitizeAiHelpChatConfig(raw: unknown): AiHelpChatConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_CONFIG, agents: {} };
  }

  const obj = raw as Record<string, unknown>;
  const allowDataQuestions =
    typeof obj.allowDataQuestions === "boolean"
      ? obj.allowDataQuestions
      : DEFAULT_CONFIG.allowDataQuestions;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_CONFIG.enabled,
    allowedRoles: normalizeRoles(obj.allowedRoles),
    allowDataQuestions,
    allowWrites:
      typeof obj.allowWrites === "boolean" ? obj.allowWrites : allowDataQuestions,
    agents: sanitizeAgents(obj.agents),
  };
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

export async function getAiHelpChatConfig(tenantId: string): Promise<AiHelpChatConfig> {
  const setting = await prisma.setting.findFirst({
    where: { key: configKey(tenantId) },
    select: { value: true },
  });

  if (!setting?.value) return { ...DEFAULT_CONFIG };

  try {
    return sanitizeAiHelpChatConfig(JSON.parse(setting.value));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveAiHelpChatConfig(
  tenantId: string,
  partial: Partial<AiHelpChatConfig>,
): Promise<AiHelpChatConfig> {
  const current = await getAiHelpChatConfig(tenantId);
  const merged = sanitizeAiHelpChatConfig({ ...current, ...partial });
  const key = configKey(tenantId);

  const existing = await prisma.setting.findFirst({
    where: { key },
    select: { id: true },
  });

  if (existing) {
    await prisma.setting.update({
      where: { id: existing.id },
      data: { value: JSON.stringify(merged), type: "json", category: "ai_help_chat" },
    });
  } else {
    await prisma.setting.create({
      data: {
        key,
        value: JSON.stringify(merged),
        type: "json",
        category: "ai_help_chat",
        tenantId,
      },
    });
  }

  return merged;
}

export function canUseAiHelpChat(userRole: string, cfg: AiHelpChatConfig): boolean {
  if (!cfg.enabled) return false;
  const role = userRole.trim().toLowerCase();
  return cfg.allowedRoles.includes(role);
}
