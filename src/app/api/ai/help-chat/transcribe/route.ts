import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getAiHelpChatConfig, canUseAiHelpChat } from "@/lib/ai/help-chat-config";
import { getHelpChatAIConfig, transcribeAudio } from "@/lib/ai/help-chat-provider";
import { logAiUsage } from "@/lib/platform-ai-service";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
];

function mimeAllowed(mime: string): boolean {
  const m = mime.toLowerCase().trim();
  if (ALLOWED_MIME.includes(m)) return true;
  // Algunos browsers mandan solo el tipo base.
  return ALLOWED_MIME.some((a) => a.startsWith(m) || m.startsWith(a.split(";")[0]));
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const config = await getAiHelpChatConfig(ctx.tenantId);
  if (!canUseAiHelpChat(ctx.userRole, config)) {
    return NextResponse.json(
      { success: false, error: "Sin acceso al asistente" },
      { status: 403 },
    );
  }

  const rl = checkRateLimit(`ai-transcribe:${ctx.userId}`, {
    limit: 30,
    windowSeconds: 5 * 60,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Demasiadas transcripciones. Espera un momento." },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Formulario inválido" },
      { status: 400 },
    );
  }

  const audio = form.get("audio");
  if (!(audio instanceof File)) {
    return NextResponse.json(
      { success: false, error: "Campo audio requerido" },
      { status: 400 },
    );
  }

  const mime = audio.type || "application/octet-stream";
  if (!mimeAllowed(mime)) {
    return NextResponse.json(
      { success: false, error: "Tipo de audio no permitido" },
      { status: 400 },
    );
  }
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "El audio supera 10 MB" },
      { status: 413 },
    );
  }

  // Chat config es opcional: la transcripción puede resolverse por OpenAI
  // (tenant/plataforma) aunque no haya proveedor de chat o sea Anthropic.
  const aiConfig = await getHelpChatAIConfig(ctx.tenantId);
  const buffer = Buffer.from(await audio.arrayBuffer());
  const t0 = Date.now();
  try {
    const result = await transcribeAudio(ctx.tenantId, buffer, mime, aiConfig);
    if (result == null) {
      return NextResponse.json(
        {
          success: false,
          code: "NO_TRANSCRIPTION_PROVIDER",
          error:
            "Dictado por servidor no disponible. Se usará el dictado del dispositivo.",
        },
        { status: 501 },
      );
    }
    logAiUsage({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      providerType: result.providerType,
      model: result.model,
      feature: "voice_transcription",
      durationMs: Date.now() - t0,
      metadata: {
        mimeType: mime,
        bytes: buffer.length,
        source: "help-chat",
        keySource: result.keySource,
        chatProvider: aiConfig?.providerType ?? null,
      },
    });
    return NextResponse.json({ success: true, data: { text: result.text } });
  } catch (err) {
    console.error("[help-chat/transcribe] provider error", err instanceof Error ? err.message : "unknown");
    return NextResponse.json(
      { success: false, error: "No se pudo transcribir el audio" },
      { status: 502 },
    );
  }
}
