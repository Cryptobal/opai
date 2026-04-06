import { prisma } from "@/lib/prisma";

export const AI_HELP_CHAT_DEFAULT_ROLES = ["owner", "admin", "editor"] as const;

export type AiHelpChatConfig = {
  enabled: boolean;
  allowedRoles: string[];
  allowDataQuestions: boolean;
};

const DEFAULT_CONFIG: AiHelpChatConfig = {
  enabled: true,
  allowedRoles: [...AI_HELP_CHAT_DEFAULT_ROLES],
  allowDataQuestions: true,
};

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

export function sanitizeAiHelpChatConfig(raw: unknown): AiHelpChatConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_CONFIG };
  }

  const obj = raw as Record<string, unknown>;
  return {
    enabled: typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_CONFIG.enabled,
    allowedRoles: normalizeRoles(obj.allowedRoles),
    allowDataQuestions:
      typeof obj.allowDataQuestions === "boolean"
        ? obj.allowDataQuestions
        : DEFAULT_CONFIG.allowDataQuestions,
  };
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

export async function isAiModuleEnabled(tenantId: string): Promise<boolean> {
  const mod = await prisma.tenantModule.findUnique({
    where: { tenantId_module: { tenantId, module: "ai_intelligence" } },
  })
  return mod?.enabled !== false // enabled by default if record doesn't exist
}

export function canUseAiHelpChat(userRole: string, cfg: AiHelpChatConfig): boolean {
  if (!cfg.enabled) return false;
  const role = userRole.trim().toLowerCase();
  return cfg.allowedRoles.includes(role);
}
