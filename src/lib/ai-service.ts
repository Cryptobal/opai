/**
 * Centralized AI Service
 *
 * Abstracts the active AI provider. All AI calls in the app go through
 * this service so switching providers is transparent.
 */

import {
  getPlatformAIConfig,
  getAIConfigForTenant,
} from "@/lib/platform-ai-service";
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
  async getActiveConfig(ctx?: { tenantId?: string }): Promise<AIConfig | null> {
    const cfg = ctx?.tenantId
      ? await getAIConfigForTenant(ctx.tenantId)
      : await getPlatformAIConfig();
    if (!cfg) {
      console.warn("[ai-service] No AI provider configured for ctx", ctx);
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
    maxTokens?: number,
    ctx?: { tenantId?: string },
  ): Promise<object> {
    const config = await this.getActiveConfig(ctx);
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
    maxTokens?: number,
    ctx?: { tenantId?: string },
  ): Promise<object> {
    const config = await this.getActiveConfig(ctx);
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
    opts?: { maxTokens?: number; temperature?: number },
    ctx?: { tenantId?: string },
  ): Promise<string> {
    const config = await this.getActiveConfig(ctx);
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
   * Sends text + images for vision analysis. Returns parsed JSON.
   * Used by the VRA pipeline to enrich photos with technical descriptions
   * and auto-suggested vulnerability links.
   *
   * @param images Array of base64 strings (without data URI prefix). Caller is
   *               responsible for resizing/compressing before passing.
   * @param mimeTypes Array matching images. Only "image/jpeg" or "image/png" supported.
   */
  async generateFromImages(
    images: string[],
    mimeTypes: string[],
    prompt: string,
    opts?: { maxTokens?: number; modelOverride?: string },
    ctx?: { tenantId?: string },
  ): Promise<object> {
    if (images.length === 0) throw new AIError("AI_INPUT_INVALID", "No hay imágenes para analizar.");
    if (images.length !== mimeTypes.length) {
      throw new AIError("AI_INPUT_INVALID", "Mismatch entre images y mimeTypes.");
    }
    const config = await this.getActiveConfig(ctx);
    if (!config) throw new AIError("AI_NOT_CONFIGURED", "No hay un proveedor de IA configurado.");

    const effectiveConfig: AIConfig = opts?.modelOverride
      ? { ...config, modelId: opts.modelOverride }
      : config;
    const maxTokens = opts?.maxTokens ?? 2048;

    let rawText: string;
    switch (effectiveConfig.providerType) {
      case "anthropic":
        rawText = await this.callAnthropicVision(effectiveConfig, images, mimeTypes, prompt, maxTokens);
        break;
      case "openai":
        rawText = await this.callOpenAIVision(effectiveConfig, images, mimeTypes, prompt, maxTokens);
        break;
      case "google":
        rawText = await this.callGoogleVision(effectiveConfig, images, mimeTypes, prompt, maxTokens);
        break;
      default:
        throw new AIError("AI_PROVIDER_ERROR", `Proveedor no soportado: ${effectiveConfig.providerType}`, effectiveConfig.providerType);
    }

    return this.parseJSON(rawText);
  }

  /**
   * Generates JSON with explicit model override. Useful when a feature needs
   * a different model than the tenant default (e.g. vision on a smaller model).
   */
  async generateJSONWithModel(
    prompt: string,
    modelOverride: string,
    maxTokens?: number,
    ctx?: { tenantId?: string },
  ): Promise<object> {
    const config = await this.getActiveConfig(ctx);
    if (!config) throw new AIError("AI_NOT_CONFIGURED", "No hay un proveedor de IA configurado.");

    const effectiveConfig: AIConfig = { ...config, modelId: modelOverride };

    let rawText: string;
    switch (effectiveConfig.providerType) {
      case "anthropic":
        rawText = await this.callAnthropic(effectiveConfig, prompt, maxTokens);
        break;
      case "openai":
        rawText = await this.callOpenAI(effectiveConfig, prompt, maxTokens);
        break;
      case "google":
        rawText = await this.callGoogle(effectiveConfig, prompt, maxTokens);
        break;
      default:
        throw new AIError("AI_PROVIDER_ERROR", `Proveedor no soportado: ${effectiveConfig.providerType}`, effectiveConfig.providerType);
    }

    return this.parseJSON(rawText);
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

  // ── Provider-specific vision calls ──

  private async callAnthropicVision(
    config: AIConfig,
    images: string[],
    mimeTypes: string[],
    prompt: string,
    maxTokens = 2048,
  ): Promise<string> {
    const imageBlocks = images.map((img, i) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mimeTypes[i],
        data: img,
      },
    }));

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
            content: [...imageBlocks, { type: "text", text: prompt }],
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

  private async callOpenAIVision(
    config: AIConfig,
    images: string[],
    mimeTypes: string[],
    prompt: string,
    maxTokens = 2048,
  ): Promise<string> {
    const imageBlocks = images.map((img, i) => ({
      type: "image_url" as const,
      image_url: { url: `data:${mimeTypes[i]};base64,${img}` },
    }));

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
            content: [...imageBlocks, { type: "text", text: prompt }],
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

  private async callGoogleVision(
    config: AIConfig,
    images: string[],
    mimeTypes: string[],
    prompt: string,
    maxTokens = 2048,
  ): Promise<string> {
    const parts = [
      ...images.map((img, i) => ({
        inline_data: { mime_type: mimeTypes[i], data: img },
      })),
      { text: prompt },
    ];

    const res = await fetch(
      `${config.baseUrl}/v1beta/models/${config.modelId}:generateContent?key=${config.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { maxOutputTokens: maxTokens, responseMimeType: "application/json" },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw classifyProviderError("google", res.status, text);
    }
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  // ── JSON parsing ──

  private parseJSON(text: string): object {
    let clean = (text ?? "").trim();
    // Quitar fences markdown (``` o ```json) iniciales y finales
    clean = clean.replace(/^```(?:json|JSON)?\s*/m, "").replace(/```\s*$/m, "").trim();

    // Intento directo
    try {
      return JSON.parse(clean);
    } catch {
      // Fallback 1: extraer el primer objeto/array balanceado más probable.
      const objStart = clean.indexOf("{");
      const arrStart = clean.indexOf("[");
      const candidates: Array<{ start: number; end: number }> = [];
      if (objStart >= 0) {
        const end = clean.lastIndexOf("}");
        if (end > objStart) candidates.push({ start: objStart, end });
      }
      if (arrStart >= 0) {
        const end = clean.lastIndexOf("]");
        if (end > arrStart) candidates.push({ start: arrStart, end });
      }
      for (const c of candidates) {
        const slice = clean.slice(c.start, c.end + 1);
        try {
          return JSON.parse(slice);
        } catch {
          // continúa con el siguiente candidato
        }
      }

      const preview = clean.length > 200 ? `${clean.slice(0, 200)}…` : clean;
      throw new Error(`La respuesta de la IA no es un JSON válido. Preview: ${preview}`);
    }
  }
}

export const aiService = new AIService();
