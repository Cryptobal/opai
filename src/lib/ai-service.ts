/**
 * Centralized AI Service
 *
 * Abstracts the active AI provider. All AI calls in the app go through
 * this service so switching providers is transparent.
 */

import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "@/lib/ai-encryption";
import { getDefaultBaseUrlForProvider, KNOWN_PROVIDERS } from "@/lib/ai-known-models";

export type AIConfig = {
  providerType: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
};

export class AIService {
  /** Evita baseUrl vacío o con slash final que rompe el join con /v1/... */
  private resolveApiBase(config: AIConfig): string {
    const raw =
      (config.baseUrl && config.baseUrl.trim()) || getDefaultBaseUrlForProvider(config.providerType);
    return raw.replace(/\/+$/, "");
  }

  /**
   * Returns the currently active provider + default model config,
   * or null if no provider is configured.
   */
  async getActiveConfig(): Promise<AIConfig | null> {
    const activeProvider = await prisma.aiProvider.findFirst({
      where: { isActive: true, apiKey: { not: null } },
      include: {
        models: {
          where: { isDefault: true, isActive: true },
          take: 1,
        },
      },
    });

    if (!activeProvider || !activeProvider.apiKey) {
      console.warn("[ai-service] No active provider found with API key");
      return null;
    }

    let model: { modelId: string } | null = activeProvider.models[0] ?? null;

    // Fallback: if no default+active model found, try first active model
    if (!model) {
      console.warn("[ai-service] No default model for provider, trying fallback");
      model = await prisma.aiModel.findFirst({
        where: { providerId: activeProvider.id, isActive: true },
        orderBy: { costTier: "asc" },
      });
    }

    // Last resort: any model from this provider
    if (!model) {
      console.warn("[ai-service] No active model, trying any model");
      model = await prisma.aiModel.findFirst({
        where: { providerId: activeProvider.id },
        orderBy: { costTier: "asc" },
      });
    }

    if (!model) {
      console.warn("[ai-service] Provider has no models at all");
      return null;
    }

    const fallbackUrl = getDefaultBaseUrlForProvider(activeProvider.providerType);

    return {
      providerType: activeProvider.providerType,
      modelId: model.modelId,
      apiKey: decryptApiKey(activeProvider.apiKey),
      baseUrl: (activeProvider.baseUrl && activeProvider.baseUrl.trim()) || fallbackUrl,
    };
  }

  /**
   * Sends a text prompt and expects a JSON response.
   */
  async generateJSON(
    prompt: string,
    maxTokens?: number
  ): Promise<object> {
    const config = await this.getActiveConfig();
    if (!config) throw new Error("NO_AI_CONFIGURED");

    let rawText: string;
    switch (config.providerType) {
      case "anthropic":
        rawText = await this.callAnthropic(config, prompt, maxTokens);
        break;
      case "openai":
        rawText = await this.callOpenAI(config, prompt, maxTokens);
        break;
      case "google":
        rawText = await this.callGoogle(config, prompt, maxTokens);
        break;
      default:
        throw new Error(`Proveedor no soportado: ${config.providerType}`);
    }

    return this.parseJSON(rawText);
  }

  /**
   * Sends a PDF (base64) + prompt for document content extraction.
   */
  async processDocument(
    pdfBase64: string,
    prompt: string,
    maxTokens?: number
  ): Promise<object> {
    const config = await this.getActiveConfig();
    if (!config) throw new Error("NO_AI_CONFIGURED");

    let rawText: string;
    switch (config.providerType) {
      case "anthropic":
        rawText = await this.callAnthropicDocument(
          config,
          pdfBase64,
          prompt,
          maxTokens
        );
        break;
      case "openai":
        rawText = await this.callOpenAIDocument(
          config,
          pdfBase64,
          prompt,
          maxTokens
        );
        break;
      case "google":
        rawText = await this.callGoogleDocument(
          config,
          pdfBase64,
          prompt,
          maxTokens
        );
        break;
      default:
        throw new Error(`Proveedor no soportado: ${config.providerType}`);
    }

    return this.parseJSON(rawText);
  }

  /**
   * Sends a text prompt and returns the raw text response (no JSON parsing).
   * Used for free-form text generation like descriptions, summaries, etc.
   */
  async generateText(
    prompt: string,
    opts?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    const config = await this.getActiveConfig();
    if (!config) throw new Error("NO_AI_CONFIGURED");

    const maxTokens = opts?.maxTokens ?? 4096;
    const temperature = opts?.temperature;

    switch (config.providerType) {
      case "anthropic":
        return this.callAnthropicText(config, prompt, maxTokens, temperature);
      case "openai":
        return this.callOpenAIText(config, prompt, maxTokens, temperature);
      case "google":
        return this.callGoogleText(config, prompt, maxTokens, temperature);
      default:
        throw new Error(`Proveedor no soportado: ${config.providerType}`);
    }
  }

  /**
   * Sends a simple test prompt to verify the provider connection works.
   * Used by the "Test connection" button in the config UI.
   */
  async testConnection(config: AIConfig): Promise<{ ok: boolean; error?: string }> {
    const testPrompt = 'Responde únicamente con el siguiente JSON: {"status":"ok"}';
    try {
      let rawText: string;
      switch (config.providerType) {
        case "anthropic":
          rawText = await this.callAnthropic(config, testPrompt, 64);
          break;
        case "openai":
          rawText = await this.callOpenAI(config, testPrompt, 64);
          break;
        case "google":
          rawText = await this.callGoogle(config, testPrompt, 64);
          break;
        default:
          return { ok: false, error: `Proveedor no soportado: ${config.providerType}` };
      }
      this.parseJSON(rawText);
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  // ── Provider-specific text calls ──

  private async callAnthropic(
    config: AIConfig,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const base = this.resolveApiBase(config);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  private async callOpenAI(
    config: AIConfig,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const base = this.resolveApiBase(config);
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  private async callGoogle(
    config: AIConfig,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const base = this.resolveApiBase(config);
    const url = `${base}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google AI ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  // ── Provider-specific text calls (no JSON mode) ──

  private async callAnthropicText(
    config: AIConfig,
    prompt: string,
    maxTokens: number,
    temperature?: number
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: config.modelId,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    };
    if (temperature !== undefined) body.temperature = temperature;

    const base = this.resolveApiBase(config);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  private async callOpenAIText(
    config: AIConfig,
    prompt: string,
    maxTokens: number,
    temperature?: number
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model: config.modelId,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    };
    if (temperature !== undefined) body.temperature = temperature;
    // NOTE: No response_format — returns free-form text

    const base = this.resolveApiBase(config);
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  private async callGoogleText(
    config: AIConfig,
    prompt: string,
    maxTokens: number,
    temperature?: number
  ): Promise<string> {
    const genConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
    if (temperature !== undefined) genConfig.temperature = temperature;

    const base = this.resolveApiBase(config);
    const url = `${base}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: genConfig,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Google AI ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  // ── Provider-specific document calls ──

  private async callAnthropicDocument(
    config: AIConfig,
    pdfBase64: string,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const base = this.resolveApiBase(config);
    const res = await fetch(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Anthropic ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  private async callOpenAIDocument(
    config: AIConfig,
    pdfBase64: string,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const base = this.resolveApiBase(config);
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        max_tokens: maxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "document.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  private async callGoogleDocument(
    config: AIConfig,
    pdfBase64: string,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const base = this.resolveApiBase(config);
    const url = `${base}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google AI ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  // ── JSON parsing ──

  private parseJSON(text: string): object {
    let clean = text.trim();
    if (clean.startsWith("```json")) clean = clean.slice(7);
    if (clean.startsWith("```")) clean = clean.slice(3);
    if (clean.endsWith("```")) clean = clean.slice(0, -3);
    clean = clean.trim();
    try {
      return JSON.parse(clean);
    } catch {
      throw new Error("La respuesta de la IA no es un JSON válido");
    }
  }
}

export const aiService = new AIService();
