/**
 * Known AI Models Registry
 *
 * Canonical catalog of models per provider. When providers release new models,
 * update this file and run the sync endpoint or seed to propagate to the DB.
 *
 * costTier guide:
 *   low    → <$1/M tokens input  — fast, cheap, simple tasks
 *   medium → $1-15/M tokens      — balanced quality/cost
 *   high   → >$15/M tokens       — best quality, expensive
 *
 * Last updated: 2026-03-01
 */

export type KnownModel = {
  modelId: string;
  displayName: string;
  description: string;
  costTier: "low" | "medium" | "high";
  recommended?: boolean;
};

export type KnownProvider = {
  providerType: string;
  name: string;
  defaultBaseUrl: string;
  models: KnownModel[];
};

export const KNOWN_PROVIDERS: KnownProvider[] = [
  {
    providerType: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      {
        modelId: "claude-haiku-4-5-20251001",
        displayName: "Claude Haiku 4.5",
        description: "R\u00e1pido y econ\u00f3mico, ideal para tareas simples",
        costTier: "low",
        recommended: true,
      },
      {
        modelId: "claude-sonnet-4-5-20250929",
        displayName: "Claude Sonnet 4.5",
        description: "Balance entre costo y calidad",
        costTier: "medium",
      },
      {
        modelId: "claude-opus-4-5-20250918",
        displayName: "Claude Opus 4.5",
        description: "M\u00e1xima calidad, mayor costo por token",
        costTier: "high",
      },
    ],
  },
  {
    providerType: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    models: [
      {
        modelId: "gpt-4o-mini",
        displayName: "GPT-4o Mini",
        description: "R\u00e1pido y econ\u00f3mico",
        costTier: "low",
        recommended: true,
      },
      {
        modelId: "gpt-4o",
        displayName: "GPT-4o",
        description: "Modelo multimodal avanzado",
        costTier: "medium",
      },
      {
        modelId: "o3-mini",
        displayName: "o3-mini",
        description: "Razonamiento avanzado, costo contenido",
        costTier: "medium",
      },
    ],
  },
  {
    providerType: "google",
    name: "Google AI",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    models: [
      {
        modelId: "gemini-2.0-flash",
        displayName: "Gemini 2.0 Flash",
        description: "R\u00e1pido y econ\u00f3mico",
        costTier: "low",
        recommended: true,
      },
      {
        modelId: "gemini-2.0-pro",
        displayName: "Gemini 2.0 Pro",
        description: "Mayor capacidad de razonamiento",
        costTier: "medium",
      },
      {
        modelId: "gemini-2.5-pro-preview-06-05",
        displayName: "Gemini 2.5 Pro (Preview)",
        description: "Modelo de \u00faltima generaci\u00f3n con razonamiento",
        costTier: "high",
      },
    ],
  },
];

/**
 * Returns a flat list of all known model IDs for quick lookup.
 */
export function getAllKnownModelIds(): Set<string> {
  const ids = new Set<string>();
  for (const p of KNOWN_PROVIDERS) {
    for (const m of p.models) {
      ids.add(m.modelId);
    }
  }
  return ids;
}
