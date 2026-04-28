/**
 * Centralized AI Service
 *
 * Abstracts the active AI provider. All AI calls in the app go through
 * this service so switching providers is transparent.
 */

import { getPlatformAIConfig } from "@/lib/platform-ai-service";
import { AIError, classifyProviderError } from "@/lib/ai-errors";

export type AIConfig = {
  providerType: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
};

export class AIService {
  /**
   * Returns the currently active platform-level provider + default model
   * config, or null if no provider is configured.
   */
  async getActiveConfig(): Promise<AIConfig | null> {
    const cfg = await getPlatformAIConfig();
    if (!cfg) {
      console.warn("[ai-service] No platform AI provider configured");
      return null;
    }
    return {
      providerType: cfg.providerType,
      modelId: cfg.modelId,
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
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
    if (!config) throw new AIError("AI_NOT_CONFIGURED", "No hay un proveedor de IA configurado.");

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
        throw new AIError("AI_PROVIDER_ERROR", `Proveedor no soportado: ${config.providerType}`, config.providerType);
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
    if (!config) throw new AIError("AI_NOT_CONFIGURED", "No hay un proveedor de IA configurado.");

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
        throw new AIError("AI_PROVIDER_ERROR", `Proveedor no soportado: ${config.providerType}`, config.providerType);
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
    if (!config) throw new AIError("AI_NOT_CONFIGURED", "No hay un proveedor de IA configurado.");

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
        throw new AIError("AI_PROVIDER_ERROR", `Proveedor no soportado: ${config.providerType}`, config.providerType);
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
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
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
      const text = await res.text();
      throw classifyProviderError("anthropic", res.status, text);
    }

    const data = await res.json();
    return data.content[0].text;
  }

  private async callOpenAI(
    config: AIConfig,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
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
      const text = await res.text();
      throw classifyProviderError("openai", res.status, text);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }

  private async callGoogle(
    config: AIConfig,
    prompt: string,
    maxTokens = 4096
  ): Promise<string> {
    const url = `${config.baseUrl}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw classifyProviderError("google", res.status, text);
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
      const text = await res.text();
      throw classifyProviderError("anthropic", res.status, text);
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

    const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw classifyProviderError("openai", res.status, text);
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

    const url = `${config.baseUrl}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;
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
      throw classifyProviderError("google", res.status, text);
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
    const res = await fetch(`${config.baseUrl}/v1/messages`, {
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
      const text = await res.text();
      throw classifyProviderError("anthropic", res.status, text);
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
    const res = await fetch(`${config.baseUrl}/v1/chat/completions`, {
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
      const text = await res.text();
      throw classifyProviderError("openai", res.status, text);
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
    const url = `${config.baseUrl}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`;
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
      const text = await res.text();
      throw classifyProviderError("google", res.status, text);
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
