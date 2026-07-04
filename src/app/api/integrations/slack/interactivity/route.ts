import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { verifySlackSignature } from "@/lib/integrations/slack/signature";
import { handleInteractivity } from "@/lib/integrations/slack/interactivity";
import { openModalForShortcut, prepareViewSubmission } from "@/lib/integrations/slack/modals/dispatch";
import { clampViewTitle } from "@/lib/integrations/slack/modals/title";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/slack/interactivity — Slack Interactivity.
 * Pública en el proxy; la seguridad es la firma HMAC verificada in-route sobre
 * el raw body ANTES de parsear. Maneja `block_actions`, `shortcut`,
 * `message_action` y `view_submission`.
 *
 * ACK 200 en <3s. `view_submission` exige el ACK (response_action) en ESTA
 * respuesta síncrona; el resto agenda el trabajo en after().
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifySlackSignature({ headers: req.headers, rawBody })) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // El payload viene como form-urlencoded: `payload=<json>`.
  let payload: Record<string, unknown>;
  try {
    const encoded = new URLSearchParams(rawBody).get("payload");
    if (!encoded) return NextResponse.json({ ok: true });
    payload = JSON.parse(encoded);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // view_submission: el ACK (cerrar o errores por campo) va en esta respuesta.
  if (payload.type === "view_submission") {
    let result: { ack: Record<string, unknown>; work?: () => Promise<void> } = { ack: {} };
    try {
      result = await prepareViewSubmission(payload);
    } catch (err) {
      console.error("[slack] prepareViewSubmission falló:", err);
    }
    if (result.work) after(result.work);
    // Red de seguridad (Fase 14): un ACK `response_action:"update"/"push"` con un
    // view de título >24 chars también dispara `invalid_arguments`. Clampar aquí
    // cubre las vistas devueltas por HTTP que NO pasan por api.ts.
    if (result.ack.view) clampViewTitle(result.ack.view);
    return NextResponse.json(result.ack);
  }

  // shortcut / message_action: abrir modal (trigger_id perece) en after().
  if (payload.type === "shortcut" || payload.type === "message_action") {
    after(() =>
      openModalForShortcut(payload).catch((err) => console.error("[slack] openModalForShortcut falló:", err)),
    );
    return NextResponse.json({ ok: true });
  }

  after(async () => {
    try {
      await handleInteractivity(payload);
    } catch (err) {
      console.error("[slack] handleInteractivity falló:", err);
    }
  });

  return NextResponse.json({ ok: true });
}
