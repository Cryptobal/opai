/**
 * Mini-modal "En camino" (control de asistencia). Registra el resultado del
 * llamado de central al guardia entrante. El `asistenciaId` viaja en
 * `private_metadata` (contexto, no autoridad — el tenant se re-resuelve por
 * team_id). Reusa el servicio de dominio `marcarEnCamino` (paridad con la web).
 */

import { hasModuleAccess } from "@/lib/permissions";
import { marcarEnCamino, type ContactoResultado } from "@/lib/ops/asistencia-control";
import { refreshRelevoBoardForInstallation } from "@/lib/ops/relevo-board";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const TITLE = "En camino";
const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });
const fieldError = (block: string, msg: string): ModalSubmitResult => ({
  ack: { response_action: "errors", errors: { [block]: msg } },
});

const RESULTADO_OPTS = [
  opt("no_contesta", "No contesta"),
  opt("confirmado", "Confirmó"),
  opt("atrasado", "Atrasado"),
];

function build(ctx: ModalOpenContext): SlackView {
  const asistenciaId = ctx.arg ?? "";
  return {
    type: "modal",
    callback_id: "opai_asist_camino",
    title: modalTitle(TITLE),
    submit: pt("Registrar"),
    close: pt("Cancelar"),
    private_metadata: packMetadata({ kind: "asist_camino", entityId: asistenciaId }),
    blocks: [
      { type: "context", elements: [{ type: "mrkdwn", text: "Resultado del llamado al guardia entrante." }] },
      {
        type: "input",
        block_id: "resultado",
        label: pt("Resultado"),
        element: { type: "static_select", action_id: "v", options: RESULTADO_OPTS },
      },
      {
        type: "input",
        block_id: "minutos",
        optional: true,
        label: pt("Minutos de atraso"),
        element: { type: "plain_text_input", action_id: "v", placeholder: pt("Ej: 20") },
      },
      {
        type: "input",
        block_id: "comentario",
        optional: true,
        label: pt("Comentario"),
        element: { type: "plain_text_input", action_id: "v", multiline: true },
      },
    ],
  };
}

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const asistenciaId = ctx.metadata.entityId;
  const resultado = ctx.state.resultado?.v?.selected_option?.value as ContactoResultado | undefined;
  const minutosStr = (ctx.state.minutos?.v?.value ?? "").trim();
  const comentario = (ctx.state.comentario?.v?.value ?? "").trim() || null;
  if (!asistenciaId) return { ack: {} };
  if (!resultado) return fieldError("resultado", "Elige un resultado.");
  let minutosAtraso: number | null = null;
  if (minutosStr) {
    const n = parseInt(minutosStr, 10);
    if (Number.isNaN(n) || n < 0) return fieldError("minutos", "Ingresa un número de minutos válido.");
    minutosAtraso = n;
  }

  return {
    ack: {}, // cierra el modal
    work: async () => {
      const r = await marcarEnCamino({
        tenantId: ctx.tenantId,
        asistenciaId,
        resultado,
        minutosAtraso,
        comentario,
        operadorId: ctx.linked.adminId,
        origen: "slack",
      });
      if (r.ok && r.installationId && r.date) {
        await refreshRelevoBoardForInstallation(ctx.tenantId, r.installationId, r.date);
      }
    },
  };
}

export const asistCaminoModal: ModalDef = {
  callbackId: "opai_asist_camino",
  title: TITLE,
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones.",
  build,
  submit,
};
