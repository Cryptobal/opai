import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getAiHelpChatConfig, canUseAiHelpChat } from "@/lib/ai/help-chat-config";
import { getHelpChatAIConfig, createCompletion } from "@/lib/ai/help-chat-provider";
import { logAiUsage } from "@/lib/platform-ai-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHARS = 4000;
const TIMEOUT_MS = 2500;

const SYSTEM = [
  "Corrige SOLO puntuación y mayúsculas del texto del usuario.",
  "No cambies palabras, no añadas contenido, no resumas, no respondas al contenido.",
  "Devuelve únicamente el texto corregido, sin comillas ni explicación.",
].join(" ");

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

  const body = (await request.json().catch(() => ({}))) as { text?: unknown };
  const original = typeof body.text === "string" ? body.text : "";
  if (!original.trim()) {
    return NextResponse.json({
      success: true,
      data: { text: original, polished: false },
    });
  }
  if (original.length > MAX_CHARS) {
    return NextResponse.json({
      success: true,
      data: { text: original.slice(0, MAX_CHARS), polished: false },
    });
  }

  const aiConfig = await getHelpChatAIConfig(ctx.tenantId);
  if (!aiConfig) {
    return NextResponse.json({
      success: true,
      data: { text: original, polished: false },
    });
  }

  const t0 = Date.now();
  try {
    const result = await Promise.race([
      createCompletion(aiConfig, {
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: original },
        ],
        tools: [],
        temperature: 0,
        maxTokens: 1024,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);

    if (!result?.text?.trim()) {
      return NextResponse.json({
        success: true,
        data: { text: original, polished: false },
      });
    }

    logAiUsage({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      providerType: aiConfig.providerType,
      model: aiConfig.model,
      feature: "voice_transcription",
      durationMs: Date.now() - t0,
      metadata: { kind: "polish", chars: original.length },
    });

    return NextResponse.json({
      success: true,
      data: { text: result.text.trim(), polished: true },
    });
  } catch {
    return NextResponse.json({
      success: true,
      data: { text: original, polished: false },
    });
  }
}
