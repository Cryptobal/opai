/**
 * Wrapper de la API de Canvas de Slack (Fase Canvas de Inicio).
 *
 * Reutiliza `callSlack` (form-urlencoded + validación `ok`). Un canvas de CANAL
 * aparece como pestaña del canal; su contenido es markdown de Slack (checkboxes
 * `- [ ]`, tablas `| a | b |`, headers `#`, links). El re-render se hace con
 * `replace` SIN `section_id`, que reemplaza el documento completo.
 *
 * Scopes requeridos: `canvases:write` (crear/editar) — declararlos en config.ts
 * y en el manifest exige RECONECTAR cada workspace (ver Bloque 6 del plan).
 */

import { callSlack } from "./api";

/**
 * Crea el canvas del CANAL (`conversations.canvases.create`). Devuelve el
 * `canvasId`. La idempotencia a nivel de negocio (no crear dos por deal) la
 * garantiza el llamador consultando el canvasId guardado antes de invocar esto.
 */
export async function slackChannelCanvasCreate(
  token: string,
  params: { channelId: string; markdown: string },
): Promise<{ canvasId: string }> {
  const json = await callSlack(
    "conversations.canvases.create",
    {
      channel_id: params.channelId,
      document_content: { type: "markdown", markdown: params.markdown },
    },
    token,
  );
  return { canvasId: (json.canvas_id as string) ?? "" };
}

/**
 * Reemplaza el contenido COMPLETO de un canvas (`canvases.edit` con una única
 * operación `replace` sin `section_id`). Es el mecanismo de re-render en cada
 * cambio relevante del negocio.
 */
export async function slackCanvasReplaceAll(
  token: string,
  params: { canvasId: string; markdown: string },
): Promise<void> {
  await callSlack(
    "canvases.edit",
    {
      canvas_id: params.canvasId,
      changes: [
        {
          operation: "replace",
          document_content: { type: "markdown", markdown: params.markdown },
        },
      ],
    },
    token,
  );
}
