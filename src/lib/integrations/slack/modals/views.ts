/**
 * Vistas comunes de modales de Slack + (des)empaque de `private_metadata`.
 */

import { signCookie, verifyCookie } from "@/lib/cookie-signature";
import { buildLinkPrompt } from "../user-link";
import type { ActiveWorkspace } from "../workspace";
import type { SlackView, ModalMetadata } from "./types";

/** Modal mínimo mientras se resuelve identidad/contenido (trigger_id perece ~3s). */
export function loadingView(title = "OPAI"): SlackView {
  return {
    type: "modal",
    title: { type: "plain_text", text: title.slice(0, 24) },
    close: { type: "plain_text", text: "Cerrar" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text: "⏳ Cargando…" } }],
  };
}

/** Modal informativo sin submit: errores, permisos, avisos. */
export function infoView(title: string, message: string): SlackView {
  return {
    type: "modal",
    title: { type: "plain_text", text: title.slice(0, 24) },
    close: { type: "plain_text", text: "Cerrar" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text: message } }],
  };
}

/** Modal con el flujo de vinculación (usuario Slack sin Admin vinculado). */
export function linkAccountView(workspace: ActiveWorkspace, slackUserId: string): SlackView {
  const prompt = buildLinkPrompt(workspace, slackUserId);
  return {
    type: "modal",
    title: { type: "plain_text", text: "Vincula tu cuenta" },
    close: { type: "plain_text", text: "Cerrar" },
    blocks: prompt.blocks,
  };
}

/** Firma-liviana del contexto en private_metadata (contexto, no autoridad). */
export function packMetadata(meta: ModalMetadata): string {
  return signCookie(JSON.stringify(meta));
}

export function unpackMetadata(raw: string | undefined): ModalMetadata {
  if (!raw) return { kind: "" };
  const json = verifyCookie(raw);
  if (!json) return { kind: "" };
  try {
    return JSON.parse(json) as ModalMetadata;
  } catch {
    return { kind: "" };
  }
}
