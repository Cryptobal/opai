/**
 * API Route: /api/ai/help-chat/attachments
 * POST (multipart/form-data, campo "files") — sube al staging de R2 los archivos
 * que el usuario adjunta en el chat web y devuelve referencias livianas
 * (stagedKey, fileName, mimeType, size). El binario NO vuelve al cliente: la
 * ruta /stream reconstruye la visión y extrae el texto desde R2 con la stagedKey.
 *
 * Reutiliza el prefijo "chat-staged" para que attach_file_to_entity valide la
 * procedencia (igual que el bot de Slack). Multi-tenant vía ctx.tenantId.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { canUseAiHelpChat, getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { uploadFile } from "@/lib/storage";

const MAX_DOC_BYTES = 10_000_000;
const MAX_FILES = 4;
const IMAGE_MIME_RE = /^image\/(png|jpe?g|webp|gif)$/;
const DOC_MIME_RE =
  /^(application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/vnd\.ms-excel|text\/csv)$/;

function isSupported(mime: string): boolean {
  return IMAGE_MIME_RE.test(mime) || DOC_MIME_RE.test(mime);
}

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const cfg = await getAiHelpChatConfig(ctx.tenantId);
  if (!canUseAiHelpChat(ctx.userRole, cfg)) {
    return NextResponse.json({ ok: false, error: "No tienes acceso al asistente." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Formato inválido: se espera multipart/form-data." }, { status: 400 });
  }

  const rawFiles = form.getAll("files").filter((f): f is File => f instanceof File).slice(0, MAX_FILES);
  if (rawFiles.length === 0) {
    return NextResponse.json({ ok: false, error: "No se recibieron archivos." }, { status: 400 });
  }

  const attachments: Array<{ stagedKey: string; fileName: string; mimeType: string; size: number }> = [];
  const rejected: string[] = [];

  for (const file of rawFiles) {
    const mimeType = file.type || "application/octet-stream";
    const fileName = file.name || "archivo";
    if (!isSupported(mimeType)) {
      rejected.push(`${fileName} (tipo no soportado)`);
      continue;
    }
    if (file.size > MAX_DOC_BYTES) {
      rejected.push(`${fileName} (supera 10MB)`);
      continue;
    }
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const up = await uploadFile(buffer, fileName, mimeType, "chat-staged", ctx.tenantId);
      attachments.push({ stagedKey: up.storageKey, fileName, mimeType, size: buffer.length });
    } catch (err) {
      console.error("[help-chat] staging de adjunto falló:", err);
      rejected.push(`${fileName} (error al subir)`);
    }
  }

  if (attachments.length === 0) {
    return NextResponse.json(
      { ok: false, error: `No se pudo procesar ningún archivo. ${rejected.join(", ")}`.trim() },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, attachments, rejected });
}
