/**
 * Anthropic API client for protocol generation and exam question creation.
 *
 * Uses direct HTTP calls to avoid adding a heavy SDK dependency.
 * All calls go through this module so rate-limiting, error handling,
 * and model configuration live in a single place.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250514";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS_DEFAULT = 4096;

function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "sk-build-placeholder") {
    throw new Error("ANTHROPIC_API_KEY is not configured. Set it in your environment variables.");
  }
  return key;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicContentBlock {
  type: "text" | "document";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

interface AnthropicResponse {
  id: string;
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AnthropicOptions {
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

/**
 * Send a message to the Anthropic API and return the text response.
 */
export async function anthropicChat(
  messages: AnthropicMessage[],
  options: AnthropicOptions = {},
): Promise<string> {
  const apiKey = getApiKey();

  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: options.maxTokens ?? MAX_TOKENS_DEFAULT,
    messages,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }
  if (options.system) {
    body.system = options.system;
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "unknown error");
    throw new Error(`Anthropic API error ${res.status}: ${errorBody}`);
  }

  const data = (await res.json()) as AnthropicResponse;
  const textBlock = data.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

/**
 * Send a message and parse the response as JSON.
 * Strips markdown code fences if the model wraps them.
 */
export async function anthropicJson<T = unknown>(
  messages: AnthropicMessage[],
  options: AnthropicOptions = {},
): Promise<T> {
  const raw = await anthropicChat(messages, options);

  // Strip possible ```json ... ``` wrapper
  const cleaned = raw
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  return JSON.parse(cleaned) as T;
}
