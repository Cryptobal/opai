/**
 * Unit tests: resolución de proveedor IA por tenant con fallback a plataforma.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  tenantProvider: null as null | {
    providerType: string;
    apiKey: string;
    baseUrl: string | null;
    models: Array<{ modelId: string; displayName: string }>;
    id: string;
  },
  platformCfg: {
    providerType: "openai",
    modelId: "gpt-4o-mini",
    apiKey: "platform-key",
    baseUrl: "https://api.openai.com",
    displayName: "Platform GPT",
  },
  decryptThrows: false,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantAiProvider: {
      findFirst: vi.fn(async () => hoisted.tenantProvider),
    },
    tenantAiModel: {
      findFirst: vi.fn(async () => null),
    },
  },
}));

vi.mock("@/lib/ai-encryption", () => ({
  decryptApiKey: vi.fn((enc: string) => {
    if (hoisted.decryptThrows) throw new Error("corrupt key");
    return enc === "encrypted-tenant" ? "tenant-decrypted-key" : enc;
  }),
}));

vi.mock("@/lib/platform-ai-service", () => ({
  getPlatformAIConfig: vi.fn(async () => hoisted.platformCfg),
  logAiUsage: vi.fn(),
}));

import { getHelpChatAIConfig } from "@/lib/ai/help-chat-provider";

describe("getHelpChatAIConfig — tenant SaaS", () => {
  beforeEach(() => {
    hoisted.tenantProvider = null;
    hoisted.decryptThrows = false;
    hoisted.platformCfg = {
      providerType: "openai",
      modelId: "gpt-4o-mini",
      apiKey: "platform-key",
      baseUrl: "https://api.openai.com",
      displayName: "Platform GPT",
    };
  });

  it("tenant con provider activo → config del tenant (source platform)", async () => {
    hoisted.tenantProvider = {
      id: "prov-1",
      providerType: "openai",
      apiKey: "encrypted-tenant",
      baseUrl: null,
      models: [{ modelId: "gpt-4o", displayName: "Tenant GPT-4o" }],
    };

    const cfg = await getHelpChatAIConfig("tenant-a");
    expect(cfg).not.toBeNull();
    expect(cfg?.apiKey).toBe("tenant-decrypted-key");
    expect(cfg?.model).toBe("gpt-4o");
    expect(cfg?.displayName).toBe("Tenant GPT-4o");
    expect(cfg?.source).toBe("platform");
  });

  it("sin provider tenant → fallback plataforma", async () => {
    const cfg = await getHelpChatAIConfig("tenant-b");
    expect(cfg?.apiKey).toBe("platform-key");
    expect(cfg?.model).toBe("gpt-4o-mini");
    expect(cfg?.displayName).toBe("Platform GPT");
  });

  it("provider con key corrupta → fallback plataforma", async () => {
    hoisted.tenantProvider = {
      id: "prov-2",
      providerType: "openai",
      apiKey: "bad-cipher",
      baseUrl: null,
      models: [{ modelId: "gpt-4o", displayName: "Broken" }],
    };
    hoisted.decryptThrows = true;

    const cfg = await getHelpChatAIConfig("tenant-c");
    expect(cfg?.apiKey).toBe("platform-key");
    expect(cfg?.model).toBe("gpt-4o-mini");
  });
});
