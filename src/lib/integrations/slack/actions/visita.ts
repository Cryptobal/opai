/**
 * Acción "Nueva visita de supervisor" (Fase 7, Bloque 7).
 *
 * Decisión de diseño (según audit): la visita de supervisión es un check-in
 * GEO en vivo — requiere lat/lng del supervisor + validación de geocerca
 * (`/api/ops/supervision`). Slack no puede aportar el GPS real, así que esta
 * acción NO crea la visita (evita datos falsos): abre OPAI para marcar la
 * ubicación. Es un "deep link" honesto en vez de una geocerca fingida.
 */

import { canEdit } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import type { ModalDef, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text });

function build(): SlackView {
  const url = `${getCanonicalSiteUrl()}/ops/supervision/nueva-visita`;
  return {
    type: "modal",
    callback_id: "opai_visita",
    title: pt("Visita de supervisor"),
    close: pt("Cerrar"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Las visitas de supervisión validan tu *ubicación GPS* (geocerca de la instalación), así que se marcan desde OPAI en terreno.",
        },
      },
      {
        type: "actions",
        elements: [
          { type: "button", text: pt("Marcar visita en OPAI"), url, style: "primary" },
        ],
      },
    ],
  };
}

export const visitaModal: ModalDef = {
  callbackId: "opai_visita",
  title: "Visita de supervisor",
  requires: (perms) => canEdit(perms, "ops", "supervision"),
  requiresMessage: "Necesitas permiso de supervisión para esta acción.",
  build,
  submit: async () => ({ ack: {} }),
};
