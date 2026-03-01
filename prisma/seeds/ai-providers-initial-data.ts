/**
 * Seed: AI Providers & Models
 *
 * Proveedores y modelos pre-configurados. Sin API key — el admin la
 * configura desde Configuración → Inteligencia Artificial.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ProviderSeed = {
  providerType: string;
  name: string;
  baseUrl: string;
  models: {
    modelId: string;
    displayName: string;
    description: string | null;
    costTier: string;
    isDefault: boolean;
  }[];
};

const PROVIDERS: ProviderSeed[] = [
  {
    providerType: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    models: [
      {
        modelId: "claude-haiku-4-5-20251001",
        displayName: "Claude Haiku 4.5",
        description: "Rápido y económico, ideal para tareas simples",
        costTier: "low",
        isDefault: true,
      },
      {
        modelId: "claude-sonnet-4-5-20250929",
        displayName: "Claude Sonnet 4.5",
        description: "Balance entre costo y calidad",
        costTier: "medium",
        isDefault: false,
      },
      {
        modelId: "claude-opus-4-5-20250918",
        displayName: "Claude Opus 4.5",
        description: "Máxima calidad, mayor costo por token",
        costTier: "high",
        isDefault: false,
      },
    ],
  },
  {
    providerType: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com",
    models: [
      {
        modelId: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        description: "Rápido y económico",
        costTier: "low",
        isDefault: false,
      },
      {
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        description: "Modelo multimodal avanzado",
        costTier: "medium",
        isDefault: false,
      },
    ],
  },
  {
    providerType: "google",
    name: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com",
    models: [
      {
        modelId: "gemini-2.0-flash",
        displayName: "Gemini 2.0 Flash",
        description: "Rápido y económico",
        costTier: "low",
        isDefault: false,
      },
      {
        modelId: "gemini-2.0-pro",
        displayName: "Gemini 2.0 Pro",
        description: "Mayor capacidad de razonamiento",
        costTier: "medium",
        isDefault: false,
      },
    ],
  },
];

export async function seedAiProviders(tenantId: string) {
  console.log("🤖 Seeding AI providers...");

  for (const p of PROVIDERS) {
    const existing = await prisma.aiProvider.findUnique({
      where: { providerType: p.providerType },
    });

    if (existing) {
      console.log(`  ⏭️  Provider "${p.name}" already exists, skipping`);
      continue;
    }

    const provider = await prisma.aiProvider.create({
      data: {
        tenantId,
        name: p.name,
        providerType: p.providerType,
        baseUrl: p.baseUrl,
        isActive: false,
        models: {
          create: p.models.map((m) => ({
            modelId: m.modelId,
            displayName: m.displayName,
            description: m.description,
            costTier: m.costTier,
            isDefault: m.isDefault,
            isActive: true,
          })),
        },
      },
    });

    console.log(
      `  ✅ Provider "${p.name}" created with ${p.models.length} models (id: ${provider.id})`
    );
  }

  console.log("✅ AI providers seeded");
}
