/**
 * Centralized AI Service — Multi-provider abstraction.
 *
 * ALL AI calls in the application MUST go through this service.
 * Reads the active provider + model from the database, decrypts the API key,
 * and routes to the correct provider (Anthropic, OpenAI, Google).
 *
 * Supports: text generation, JSON generation, PDF extraction.
 */

import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

// ─── Types ───────────────────────────────────────────────────

export interface AiConfig {
  providerType: "anthropic" | "openai" | "google";
  modelId: string;
  apiKey: string;
  baseUrl: string;
}

export interface AiGenerateOptions {
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AiPdfContent {
  type: "pdf";
  base64: string;
  fileName: string;
}

export type AiContent = string | (string | AiPdfContent)[];

// ─── Config cache (5 min TTL) ────────────────────────────────

let _configCache: AiConfig | null = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Clear the config cache (call after changing AI settings).
 */
export function clearAiConfigCache(): void {
  _configCache = null;
  _configCacheTime = 0;
}

/**
 * Get the active AI configuration from the database.
 * Caches for 5 minutes to avoid hitting the DB on every AI call.
 */
export async function getActiveAiConfig(): Promise<AiConfig | null> {
  const now = Date.now();
  if (_configCache && now - _configCacheTime < CONFIG_CACHE_TTL) {
    return _configCache;
  }

  // Find the default model
  const defaultModel = await prisma.aiModel.findFirst({
    where: { isDefault: true, isActive: true },
    include: { provider: true },
  });

  if (!defaultModel || !defaultModel.provider.isActive || !defaultModel.provider.apiKey) {
    _configCache = null;
    _configCacheTime = now;
    return null;
  }

  let apiKey: string;
  try {
    apiKey = decrypt(defaultModel.provider.apiKey);
  } catch {
    // If decryption fails, try using the key as-is (for dev/testing with plain keys)
    apiKey = defaultModel.provider.apiKey;
  }

  const config: AiConfig = {
    providerType: defaultModel.provider.providerType as AiConfig["providerType"],
    modelId: defaultModel.modelId,
    apiKey,
    baseUrl: defaultModel.provider.baseUrl ?? getDefaultBaseUrl(defaultModel.provider.providerType),
  };

  _configCache = config;
  _configCacheTime = now;
  return config;
}

function getDefaultBaseUrl(providerType: string): string {
  switch (providerType) {
    case "anthropic":
      return "https://api.anthropic.com";
    case "openai":
      return "https://api.openai.com";
    case "google":
      return "https://generativelanguage.googleapis.com";
    default:
      return "";
  }
}

// ─── Main API ────────────────────────────────────────────────

/**
 * Generate text from a prompt. Returns the raw text response.
 */
export async function aiGenerate(
  prompt: AiContent,
  options: AiGenerateOptions = {},
): Promise<string> {
  const config = await getActiveAiConfig();
  if (!config) {
    throw new AiNotConfiguredError();
  }

  switch (config.providerType) {
    case "anthropic":
      return callAnthropic(config, prompt, options);
    case "openai":
      return callOpenAI(config, prompt, options);
    case "google":
      return callGoogle(config, prompt, options);
    default:
      throw new Error(`Proveedor de IA no soportado: ${config.providerType}`);
  }
}

/**
 * Generate and parse a JSON response from a prompt.
 */
export async function aiGenerateJson<T = unknown>(
  prompt: AiContent,
  options: AiGenerateOptions = {},
): Promise<T> {
  const raw = await aiGenerate(prompt, options);
  return parseJsonResponse<T>(raw);
}

/**
 * Extract structured data from a PDF using AI.
 */
export async function aiExtractFromPdf<T = unknown>(
  pdfBase64: string,
  fileName: string,
  textPrompt: string,
  options: AiGenerateOptions = {},
): Promise<T> {
  const content: AiContent = [
    { type: "pdf", base64: pdfBase64, fileName },
    textPrompt,
  ];
  return aiGenerateJson<T>(content, options);
}

/**
 * Test connection with the given provider config.
 * Returns { ok: true } or { ok: false, error: string }.
 */
export async function testAiConnection(
  providerType: string,
  modelId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<{ ok: boolean; error?: string }> {
  const config: AiConfig = {
    providerType: providerType as AiConfig["providerType"],
    modelId,
    apiKey,
    baseUrl: baseUrl ?? getDefaultBaseUrl(providerType),
  };

  try {
    const prompt = "Responde solo con: OK";
    let result: string;

    switch (config.providerType) {
      case "anthropic":
        result = await callAnthropic(config, prompt, { maxTokens: 10 });
        break;
      case "openai":
        result = await callOpenAI(config, prompt, { maxTokens: 10 });
        break;
      case "google":
        result = await callGoogle(config, prompt, { maxTokens: 10 });
        break;
      default:
        return { ok: false, error: "Proveedor no soportado" };
    }

    return { ok: result.length > 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error desconocido";
    return { ok: false, error: msg };
  }
}

// ─── Error class ─────────────────────────────────────────────

export class AiNotConfiguredError extends Error {
  constructor() {
    super("No hay proveedor de IA configurado. Configura uno en Configuración → Inteligencia Artificial.");
    this.name = "AiNotConfiguredError";
  }
}

// ─── Provider implementations ────────────────────────────────

async function callAnthropic(
  config: AiConfig,
  prompt: AiContent,
  options: AiGenerateOptions,
): Promise<string> {
  const messages = buildAnthropicMessages(prompt);

  const body: Record<string, unknown> = {
    model: config.modelId,
    max_tokens: options.maxTokens ?? 4096,
    messages,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.system) body.system = options.system;

  const res = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`Anthropic API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
  return textBlock?.text ?? "";
}

function buildAnthropicMessages(prompt: AiContent) {
  if (typeof prompt === "string") {
    return [{ role: "user", content: prompt }];
  }

  // Mixed content (PDF + text)
  const contentBlocks: unknown[] = [];
  for (const part of prompt) {
    if (typeof part === "string") {
      contentBlocks.push({ type: "text", text: part });
    } else if (part.type === "pdf") {
      contentBlocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: part.base64,
        },
      });
    }
  }
  return [{ role: "user", content: contentBlocks }];
}

async function callOpenAI(
  config: AiConfig,
  prompt: AiContent,
  options: AiGenerateOptions,
): Promise<string> {
  const messages: unknown[] = [];

  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }

  if (typeof prompt === "string") {
    messages.push({ role: "user", content: prompt });
  } else {
    // Mixed content — OpenAI uses content array with image_url for files
    const parts: unknown[] = [];
    for (const part of prompt) {
      if (typeof part === "string") {
        parts.push({ type: "text", text: part });
      } else if (part.type === "pdf") {
        // OpenAI doesn't natively support PDF in chat; send as text description
        parts.push({
          type: "text",
          text: `[Archivo PDF adjunto: ${part.fileName}. El contenido del PDF ha sido proporcionado como contexto.]`,
        });
      }
    }
    messages.push({ role: "user", content: parts });
  }

  const body: Record<string, unknown> = {
    model: config.modelId,
    max_tokens: options.maxTokens ?? 4096,
    messages,
  };

  if (options.temperature !== undefined) body.temperature = options.temperature;

  const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`OpenAI API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGoogle(
  config: AiConfig,
  prompt: AiContent,
  options: AiGenerateOptions,
): Promise<string> {
  const parts: unknown[] = [];

  if (typeof prompt === "string") {
    parts.push({ text: prompt });
  } else {
    for (const part of prompt) {
      if (typeof part === "string") {
        parts.push({ text: part });
      } else if (part.type === "pdf") {
        parts.push({
          inline_data: {
            mime_type: "application/pdf",
            data: part.base64,
          },
        });
      }
    }
  }

  const body: Record<string, unknown> = {
    contents: [{ parts }],
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  };

  if (options.temperature !== undefined) {
    (body.generationConfig as Record<string, unknown>).temperature = options.temperature;
  }

  if (options.system) {
    body.systemInstruction = { parts: [{ text: options.system }] };
  }

  const url = `${config.baseUrl}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown");
    throw new Error(`Google AI API error ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ─── JSON parsing helper ─────────────────────────────────────

function parseJsonResponse<T>(text: string): T {
  let clean = text.trim();
  // Strip markdown code fences
  if (clean.startsWith("```json")) clean = clean.slice(7);
  else if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  clean = clean.trim();
  return JSON.parse(clean) as T;
}
