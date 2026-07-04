/**
 * Multi-provider AI abstraction for the Help Chat.
 *
 * Reads the platform-level AI config (managed by Platform Admin),
 * falling back to process.env.OPENAI_API_KEY, and exposes a unified
 * streaming / non-streaming completion interface for OpenAI, Anthropic,
 * and Google Gemini.
 */

import { getPlatformAIConfig } from "@/lib/platform-ai-service";
import OpenAI from "openai";

/* ── Types ── */

export type HelpChatAIConfig = {
  providerType: "openai" | "anthropic" | "google";
  apiKey: string;
  baseUrl: string;
  model: string;
  displayName: string;
  source: "platform" | "env";
};

export type ToolCallInfo = {
  id: string;
  name: string;
  arguments: string;
};

export type ChatStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_calls"; calls: ToolCallInfo[] }
  | { type: "done" };

export type ChatCompletionResult = {
  text: string;
  toolCalls: ToolCallInfo[];
};

export type CompletionParams = {
  messages: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  temperature: number;
  maxTokens: number;
};

/* ── Config retrieval ── */

/**
 * Reads the platform-level AI config (managed by Platform Admin).
 * The tenantId parameter is kept for signature compatibility but is no longer
 * used to look up per-tenant providers.
 */
export async function getHelpChatAIConfig(
  _tenantId: string,
): Promise<HelpChatAIConfig | null> {
  const cfg = await getPlatformAIConfig();
  if (!cfg) return null;

  return {
    providerType: cfg.providerType as "openai" | "anthropic" | "google",
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    model: cfg.modelId,
    displayName: cfg.displayName,
    source: cfg.displayName.endsWith("(env)") ? "env" : "platform",
  };
}

/* ── Unified completion interface ── */

export async function* createStreamingCompletion(
  config: HelpChatAIConfig,
  params: CompletionParams,
): AsyncGenerator<ChatStreamEvent> {
  switch (config.providerType) {
    case "openai":
      yield* streamOpenAI(config, params);
      break;
    case "anthropic":
      yield* streamAnthropic(config, params);
      break;
    case "google":
      yield* streamGoogle(config, params);
      break;
    default:
      throw new Error(`Proveedor no soportado: ${config.providerType}`);
  }
}

export async function createCompletion(
  config: HelpChatAIConfig,
  params: CompletionParams,
): Promise<ChatCompletionResult> {
  switch (config.providerType) {
    case "openai":
      return completeOpenAI(config, params);
    case "anthropic":
      return completeAnthropic(config, params);
    case "google":
      return completeGoogle(config, params);
    default:
      throw new Error(`Proveedor no soportado: ${config.providerType}`);
  }
}

/* ═══════════════════════════════════════════════
   OpenAI implementation
   ═══════════════════════════════════════════════ */

function makeOpenAIClient(config: HelpChatAIConfig): OpenAI {
  const base = config.baseUrl.replace(/\/+$/, "");
  const baseURL = base.endsWith("/v1") ? base : `${base}/v1`;
  return new OpenAI({ apiKey: config.apiKey, baseURL });
}

async function* streamOpenAI(
  config: HelpChatAIConfig,
  params: CompletionParams,
): AsyncGenerator<ChatStreamEvent> {
  const client = makeOpenAIClient(config);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: params.messages as unknown as Parameters<
      typeof client.chat.completions.create
    >[0]["messages"],
    tools:
      params.tools.length > 0
        ? (params.tools as unknown as Parameters<
            typeof client.chat.completions.create
          >[0]["tools"])
        : undefined,
    tool_choice: params.tools.length > 0 ? "auto" : undefined,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
    stream: true,
  });

  const toolCalls: ToolCallInfo[] = [];
  let hasToolCalls = false;

  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.tool_calls) {
      hasToolCalls = true;
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolCalls[idx]) {
          toolCalls[idx] = { id: tc.id || "", name: tc.function?.name || "", arguments: "" };
        }
        if (tc.id) toolCalls[idx].id = tc.id;
        if (tc.function?.name) toolCalls[idx].name = tc.function.name;
        if (tc.function?.arguments)
          toolCalls[idx].arguments += tc.function.arguments;
      }
      continue;
    }

    if (delta.content) {
      yield { type: "token", text: delta.content };
    }
  }

  if (hasToolCalls && toolCalls.length > 0) {
    yield { type: "tool_calls", calls: toolCalls };
  }
  yield { type: "done" };
}

async function completeOpenAI(
  config: HelpChatAIConfig,
  params: CompletionParams,
): Promise<ChatCompletionResult> {
  const client = makeOpenAIClient(config);

  const completion = await client.chat.completions.create({
    model: config.model,
    messages: params.messages as unknown as Parameters<
      typeof client.chat.completions.create
    >[0]["messages"],
    tools:
      params.tools.length > 0
        ? (params.tools as unknown as Parameters<
            typeof client.chat.completions.create
          >[0]["tools"])
        : undefined,
    tool_choice: params.tools.length > 0 ? "auto" : undefined,
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  });

  const choice = completion.choices[0]?.message;
  return {
    text: choice?.content?.trim() || "",
    toolCalls: (choice?.tool_calls ?? [])
      .filter((tc): tc is typeof tc & { type: "function"; function: { name: string; arguments: string } } => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      })),
  };
}

/* ═══════════════════════════════════════════════
   Anthropic implementation
   ═══════════════════════════════════════════════ */

function convertMessagesForAnthropic(msgs: Array<Record<string, unknown>>): {
  system: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
} {
  const systemParts: string[] = [];
  const out: Array<Record<string, unknown>> = [];

  for (const msg of msgs) {
    if (msg.role === "system") {
      systemParts.push(String(msg.content ?? ""));
      continue;
    }

    if (msg.role === "assistant") {
      const content: unknown[] = [];
      const textContent = msg.content
        ? String(msg.content).trim()
        : "";
      if (textContent) {
        content.push({ type: "text", text: textContent });
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls as Array<Record<string, unknown>>) {
          const fn = tc.function as Record<string, unknown> | undefined;
          let input: unknown = {};
          try {
            input = JSON.parse(String(fn?.arguments ?? "{}"));
          } catch {
            /* empty */
          }
          content.push({
            type: "tool_use",
            id: tc.id ?? fn?.id,
            name: fn?.name ?? tc.name,
            input,
          });
        }
      }
      if (content.length === 0) {
        content.push({ type: "text", text: " " });
      }
      out.push({ role: "assistant", content });
      continue;
    }

    if (msg.role === "tool") {
      const last = out[out.length - 1];
      const toolResult = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id,
        content: String(msg.content ?? ""),
      };
      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as unknown[]).push(toolResult);
      } else {
        out.push({ role: "user", content: [toolResult] });
      }
      continue;
    }

    out.push({ role: String(msg.role), content: String(msg.content ?? "") });
  }

  // Devolvemos el system como array de bloques: el primero (todos los system
  // mergeados) lleva cache_control:ephemeral. Anthropic cachea ese prefijo;
  // los siguientes turnos pagan ~10% del costo en tokens de entrada para esa
  // porción mientras esté caliente (TTL 5 min). Si no hay system, devolvemos [].
  const systemText = systemParts.join("\n\n");
  const system: Array<Record<string, unknown>> = systemText
    ? [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }]
    : [];
  return { system, messages: out };
}

function convertToolsForAnthropic(
  tools: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const out = tools.map((tool) => {
    const fn = (tool as { function?: Record<string, unknown> }).function ?? tool;
    return {
      name: fn.name,
      description: fn.description ?? "",
      input_schema: fn.parameters ?? { type: "object", properties: {} },
    } as Record<string, unknown>;
  });
  // Marca el último tool con cache_control: {type:"ephemeral"} para que las
  // definiciones de tools (decenas de KB) reutilicen el prompt cache de
  // Anthropic (TTL 5 min). Esto reduce input tokens contra el rate limit
  // 10x sobre cache hit y baja el costo, evitando 429 en flujos multi-turno.
  if (out.length > 0) {
    out[out.length - 1] = {
      ...out[out.length - 1],
      cache_control: { type: "ephemeral" },
    };
  }
  return out;
}

async function* parseAnthropicSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        yield JSON.parse(raw);
      } catch {
        /* skip malformed */
      }
    }
  }
}

async function* streamAnthropic(
  config: HelpChatAIConfig,
  params: CompletionParams,
): AsyncGenerator<ChatStreamEvent> {
  const { system, messages } = convertMessagesForAnthropic(params.messages);
  const anthropicTools =
    params.tools.length > 0
      ? convertToolsForAnthropic(params.tools)
      : undefined;

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    stream: true,
    messages,
  };
  if (system.length > 0) body.system = system;
  if (anthropicTools) body.tools = anthropicTools;

  const base = config.baseUrl.replace(/\/+$/, "");
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
    const errBody = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Sin cuerpo de respuesta de Anthropic");

  const toolCalls: ToolCallInfo[] = [];
  const blockToToolIdx = new Map<number, number>();
  let toolCallCount = 0;

  for await (const event of parseAnthropicSSE(reader)) {
    const type = event.type as string;

    if (type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "tool_use") {
        const tcIdx = toolCallCount++;
        blockToToolIdx.set(event.index as number, tcIdx);
        toolCalls.push({
          id: String(block.id),
          name: String(block.name),
          arguments: "",
        });
      }
    }

    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        yield { type: "token", text: String(delta.text ?? "") };
      } else if (delta?.type === "input_json_delta") {
        const tcIdx = blockToToolIdx.get(event.index as number);
        if (tcIdx !== undefined) {
          toolCalls[tcIdx].arguments += String(delta.partial_json ?? "");
        }
      }
    }
  }

  if (toolCalls.length > 0) {
    yield { type: "tool_calls", calls: toolCalls };
  }
  yield { type: "done" };
}

async function completeAnthropic(
  config: HelpChatAIConfig,
  params: CompletionParams,
): Promise<ChatCompletionResult> {
  const { system, messages } = convertMessagesForAnthropic(params.messages);
  const anthropicTools =
    params.tools.length > 0
      ? convertToolsForAnthropic(params.tools)
      : undefined;

  const body: Record<string, unknown> = {
    model: config.model,
    max_tokens: params.maxTokens,
    temperature: params.temperature,
    messages,
  };
  if (system.length > 0) body.system = system;
  if (anthropicTools) body.tools = anthropicTools;

  const base = config.baseUrl.replace(/\/+$/, "");
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
    const errBody = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const data = await res.json();
  const content = data.content as Array<Record<string, unknown>>;

  let text = "";
  const toolCalls: ToolCallInfo[] = [];

  for (const block of content) {
    if (block.type === "text") {
      text += String(block.text ?? "");
    }
    if (block.type === "tool_use") {
      toolCalls.push({
        id: String(block.id),
        name: String(block.name),
        arguments: JSON.stringify(block.input ?? {}),
      });
    }
  }

  return { text: text.trim(), toolCalls };
}

/* ═══════════════════════════════════════════════
   Google Gemini implementation
   ═══════════════════════════════════════════════ */

function convertMessagesForGemini(msgs: Array<Record<string, unknown>>): {
  systemInstruction: string;
  contents: Array<Record<string, unknown>>;
} {
  const systemParts: string[] = [];
  const contents: Array<Record<string, unknown>> = [];

  for (const msg of msgs) {
    if (msg.role === "system") {
      systemParts.push(String(msg.content ?? ""));
      continue;
    }

    if (msg.role === "assistant") {
      const parts: unknown[] = [];
      if (msg.content) parts.push({ text: String(msg.content) });
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls as Array<Record<string, unknown>>) {
          const fn = tc.function as Record<string, unknown> | undefined;
          let args: unknown = {};
          try {
            args = JSON.parse(String(fn?.arguments ?? "{}"));
          } catch {
            /* empty */
          }
          parts.push({ functionCall: { name: fn?.name, args } });
        }
      }
      contents.push({ role: "model", parts });
      continue;
    }

    if (msg.role === "tool") {
      const last = contents[contents.length - 1];
      const frPart = {
        functionResponse: {
          name: "tool_call",
          response: { result: msg.content },
        },
      };
      if (last?.role === "user" && Array.isArray(last.parts)) {
        (last.parts as unknown[]).push(frPart);
      } else {
        contents.push({ role: "user", parts: [frPart] });
      }
      continue;
    }

    contents.push({
      role: "user",
      parts: [{ text: String(msg.content ?? "") }],
    });
  }

  return {
    systemInstruction: systemParts.join("\n\n"),
    contents,
  };
}

function convertToolsForGemini(
  tools: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const declarations = tools.map((tool) => {
    const fn = (tool as { function?: Record<string, unknown> }).function ?? tool;
    return {
      name: fn.name,
      description: fn.description ?? "",
      parameters: fn.parameters ?? { type: "object", properties: {} },
    };
  });
  return [{ functionDeclarations: declarations }];
}

async function* streamGoogle(
  config: HelpChatAIConfig,
  params: CompletionParams,
): AsyncGenerator<ChatStreamEvent> {
  const { systemInstruction, contents } = convertMessagesForGemini(
    params.messages,
  );
  const geminiTools =
    params.tools.length > 0
      ? convertToolsForGemini(params.tools)
      : undefined;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      maxOutputTokens: params.maxTokens,
      temperature: params.temperature,
    },
  };
  if (geminiTools) body.tools = geminiTools;

  const base = config.baseUrl.replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google AI ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("Sin cuerpo de respuesta de Google AI");

  const toolCalls: ToolCallInfo[] = [];
  let tcCounter = 0;
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;

      try {
        const event = JSON.parse(raw);
        const parts =
          (event.candidates?.[0]?.content?.parts as Array<
            Record<string, unknown>
          >) ?? [];

        for (const part of parts) {
          if (typeof part.text === "string" && part.text) {
            yield { type: "token", text: part.text };
          }
          if (part.functionCall) {
            const fc = part.functionCall as Record<string, unknown>;
            toolCalls.push({
              id: `gemini-tc-${tcCounter++}`,
              name: String(fc.name),
              arguments: JSON.stringify(fc.args ?? {}),
            });
          }
        }
      } catch {
        /* skip malformed */
      }
    }
  }

  if (toolCalls.length > 0) {
    yield { type: "tool_calls", calls: toolCalls };
  }
  yield { type: "done" };
}

async function completeGoogle(
  config: HelpChatAIConfig,
  params: CompletionParams,
): Promise<ChatCompletionResult> {
  const { systemInstruction, contents } = convertMessagesForGemini(
    params.messages,
  );
  const geminiTools =
    params.tools.length > 0
      ? convertToolsForGemini(params.tools)
      : undefined;

  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents,
    generationConfig: {
      maxOutputTokens: params.maxTokens,
      temperature: params.temperature,
    },
  };
  if (geminiTools) body.tools = geminiTools;

  const base = config.baseUrl.replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Google AI ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const data = await res.json();
  const parts =
    (data.candidates?.[0]?.content?.parts as Array<
      Record<string, unknown>
    >) ?? [];

  let text = "";
  const toolCalls: ToolCallInfo[] = [];
  let tcCounter = 0;

  for (const part of parts) {
    if (typeof part.text === "string") text += part.text;
    if (part.functionCall) {
      const fc = part.functionCall as Record<string, unknown>;
      toolCalls.push({
        id: `gemini-tc-${tcCounter++}`,
        name: String(fc.name),
        arguments: JSON.stringify(fc.args ?? {}),
      });
    }
  }

  return { text: text.trim(), toolCalls };
}

function mimeToAudioExt(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("wav")) return ".wav";
  if (m.includes("webm")) return ".webm";
  if (m.includes("mp4") || m.includes("m4a")) return ".m4a";
  if (m.includes("aac")) return ".aac";
  return ".bin";
}

/** Transcribe audio con el proveedor configurado. null = proveedor sin soporte. */
export async function transcribeAudio(
  config: HelpChatAIConfig,
  audio: Buffer,
  mimeType: string,
): Promise<string | null> {
  if (config.providerType === "anthropic") return null;

  if (config.providerType === "openai") {
    const { toFile } = await import("openai");
    const client = makeOpenAIClient(config);
    const ext = mimeToAudioExt(mimeType);
    const transcription = await client.audio.transcriptions.create({
      file: await toFile(audio, `nota${ext}`),
      model: "whisper-1",
      language: "es",
    });
    const text = typeof transcription === "string" ? transcription : transcription.text;
    if (!text?.trim()) throw new Error("La transcripción quedó vacía.");
    return text.trim();
  }

  if (config.providerType === "google") {
    const base = config.baseUrl.replace(/\/+$/, "");
    const url = `${base}/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: audio.toString("base64") } },
            { text: "Transcribe literalmente este audio en español. Devuelve solo el texto transcrito, sin comillas ni comentarios." },
          ],
        }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0 },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Google transcripción ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = ((data.candidates?.[0]?.content?.parts as Array<{ text?: string }> | undefined) ?? [])
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new Error("La transcripción quedó vacía.");
    return text;
  }

  return null;
}
