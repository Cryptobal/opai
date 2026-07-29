/**
 * Capacidad de transcripción de audio desacoplada del proveedor de chat.
 *
 * Orden de resolución:
 * 1. OpenAI Whisper con key del tenant
 * 2. OpenAI Whisper con key de plataforma (OPENAI_API_KEY)
 * 3. Google Gemini inline (sólo si el config de chat resuelto es Google)
 * 4. none → el caller responde 501 NO_TRANSCRIPTION_PROVIDER
 */

import { prisma } from "@/lib/prisma";
import { getTenantOpenAIClient } from "@/lib/ai/tenant-openai";

/** Subconjunto del config de chat necesario para la rama Google. */
export type TranscriptionChatConfig = {
  providerType: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type TranscriptionResult = {
  text: string;
  providerType: string;
  model: string;
  keySource?: "tenant" | "platform";
};

export type TranscriptionCapability =
  | { kind: "openai"; source: "tenant" | "platform" }
  | { kind: "google"; apiKey: string; baseUrl: string; model: string }
  | { kind: "none" };

const PLATFORM_PLACEHOLDER = "sk-build-placeholder";

/** True si OPENAI_API_KEY de entorno es usable (no vacía ni placeholder de build). */
export function hasPlatformOpenAIKey(): boolean {
  const k = process.env.OPENAI_API_KEY;
  return Boolean(k && k.trim() && k !== PLATFORM_PLACEHOLDER);
}

/** Mapea MIME de audio a extensión que Whisper acepta (iOS Safari → .m4a). */
export function mimeToAudioExt(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return ".mp3";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("wav")) return ".wav";
  if (m.includes("webm")) return ".webm";
  if (m.includes("mp4") || m.includes("m4a")) return ".m4a";
  if (m.includes("aac")) return ".aac";
  return ".bin";
}

export async function resolveTranscriptionCapability(
  tenantId: string,
  chatConfig?: TranscriptionChatConfig | null,
): Promise<TranscriptionCapability> {
  if (tenantId) {
    try {
      const provider = await prisma.tenantAiProvider.findFirst({
        where: { tenantId, providerType: "openai", apiKey: { not: null } },
        select: { id: true },
      });
      if (provider) return { kind: "openai", source: "tenant" };
    } catch (err) {
      console.warn(
        "[transcription] Error resolviendo TenantAiProvider openai",
        tenantId,
        err instanceof Error ? err.message : "unknown",
      );
    }
  }

  if (hasPlatformOpenAIKey()) {
    return { kind: "openai", source: "platform" };
  }

  if (chatConfig?.providerType === "google" && chatConfig.apiKey) {
    return {
      kind: "google",
      apiKey: chatConfig.apiKey,
      baseUrl: chatConfig.baseUrl,
      model: chatConfig.model,
    };
  }

  return { kind: "none" };
}

async function transcribeWithOpenAI(
  tenantId: string,
  audio: Buffer,
  mimeType: string,
  source: "tenant" | "platform",
): Promise<TranscriptionResult> {
  const { toFile } = await import("openai");
  const client = await getTenantOpenAIClient(tenantId);
  const ext = mimeToAudioExt(mimeType);
  const transcription = await client.audio.transcriptions.create({
    file: await toFile(audio, `nota${ext}`),
    model: "whisper-1",
    language: "es",
  });
  const text = typeof transcription === "string" ? transcription : transcription.text;
  if (!text?.trim()) throw new Error("La transcripción quedó vacía.");
  return {
    text: text.trim(),
    providerType: "openai",
    model: "whisper-1",
    keySource: source,
  };
}

async function transcribeWithGoogle(
  capability: Extract<TranscriptionCapability, { kind: "google" }>,
  audio: Buffer,
  mimeType: string,
): Promise<TranscriptionResult> {
  const base = capability.baseUrl.replace(/\/+$/, "");
  const url = `${base}/v1beta/models/${capability.model}:generateContent?key=${capability.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: audio.toString("base64") } },
            {
              text: "Transcribe literalmente este audio en español. Devuelve solo el texto transcrito, sin comillas ni comentarios.",
            },
          ],
        },
      ],
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
  return {
    text,
    providerType: "google",
    model: capability.model,
  };
}

/**
 * Transcribe audio según la capacidad disponible (no según el proveedor de chat).
 * null = no hay proveedor de transcripción configurado.
 */
export async function transcribeAudioBuffer(
  tenantId: string,
  audio: Buffer,
  mimeType: string,
  chatConfig?: TranscriptionChatConfig | null,
): Promise<TranscriptionResult | null> {
  const capability = await resolveTranscriptionCapability(tenantId, chatConfig);
  if (capability.kind === "none") return null;
  if (capability.kind === "openai") {
    return transcribeWithOpenAI(tenantId, audio, mimeType, capability.source);
  }
  return transcribeWithGoogle(capability, audio, mimeType);
}
