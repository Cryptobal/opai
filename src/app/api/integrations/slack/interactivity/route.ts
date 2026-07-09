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
      const cbId = (payload.view as { callback_id?: string } | undefined)?.callback_id;
      if (cbId === "bankreconc_assign_account") {
        const { handleBankReconcileAssignSubmit } = await import(
          "@/lib/integrations/slack/actions/bank-reconcile-assign"
        );
        result = await handleBankReconcileAssignSubmit(payload as never);
      } else {
        result = await prepareViewSubmission(payload);
      }
    } catch (err) {
      console.error("[slack] view_submission falló:", err);
    }
    if (result.work) after(result.work);
    // Red de seguridad (Fase 14): un ACK `response_action:"update"/"push"` con un
    // view de título >24 chars también dispara `invalid_arguments`. Clampar aquí
    // cubre las vistas devueltas por HTTP que NO pasan por api.ts.
    if (result.ack.view) clampViewTitle(result.ack.view);
    return NextResponse.json(result.ack);
  }

  // block_suggestion: opciones del external_select. Respuesta SÍNCRONA con
  // { options } en <3s. Se discrimina por el callback_id del view: el buscador
  // de guardias del turno extra vs el buscador de entidad de "Guardar en OPAI".
  if (payload.type === "block_suggestion") {
    let options: { options: unknown[] } = { options: [] };
    try {
      const callbackId = (payload.view as { callback_id?: string } | undefined)?.callback_id;
      // DEBUG TEMPORAL: capturar el shape real que Slack envía en block_suggestion.
      console.log("[slack][DEBUG block_suggestion]", JSON.stringify({
        callbackId,
        actionId: (payload as { action_id?: string }).action_id,
        value: (payload as { value?: string }).value,
        hasView: Boolean(payload.view),
        viewKeys: payload.view ? Object.keys(payload.view as object) : null,
        topKeys: Object.keys(payload),
      }));
      if (callbackId === "bankreconc_assign_account") {
        const { handleBankReconcileAccountSuggestion } = await import(
          "@/lib/integrations/slack/actions/bank-reconcile-modal"
        );
        options = await handleBankReconcileAccountSuggestion(payload as never);
      } else if (callbackId === "opai_turno_extra") {
        const { handleTurnoExtraGuardiaSuggestion } = await import("@/lib/integrations/slack/actions/turno-extra");
        options = await handleTurnoExtraGuardiaSuggestion(payload as never);
      } else {
        const { handleSaveNoteSuggestion } = await import("@/lib/integrations/slack/deal-rooms/save-note");
        options = await handleSaveNoteSuggestion(payload as never);
      }
    } catch (err) {
      console.error("[slack] block_suggestion falló:", err);
    }
    return NextResponse.json(options);
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
