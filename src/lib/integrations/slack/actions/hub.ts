/**
 * Hub de acciones rápidas (`opai_acciones`, Fase 7): modal-menú con las acciones
 * disponibles PARA ESE USUARIO (filtradas por capability real), agrupadas por
 * módulo. Cada acción tiene un botón "Abrir" que apila su modal (views.push vía
 * el block_action `opai_action_open`). El hub no envía (no tiene submit útil).
 */

import { ACTIONS } from "./registry";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text });

function build(ctx: ModalOpenContext): SlackView {
  const allowed = ACTIONS.filter((a) => !a.requires || a.requires(ctx.linked.perms));
  const blocks: unknown[] = [];

  if (allowed.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "No tienes acciones disponibles. Pide acceso a tu administrador de OPAI." },
    });
  } else {
    const groups = new Map<string, typeof ACTIONS>();
    for (const a of allowed) {
      const list = groups.get(a.group) ?? [];
      list.push(a);
      groups.set(a.group, list);
    }
    for (const [group, list] of groups) {
      blocks.push({ type: "header", text: pt(group) });
      for (const a of list) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `*${a.title}*` },
          accessory: {
            type: "button",
            text: pt("Abrir"),
            value: a.callbackId,
            action_id: "opai_action_open",
          },
        });
      }
    }
  }

  return {
    type: "modal",
    callback_id: "opai_acciones",
    title: pt("Acciones OPAI"),
    close: pt("Cerrar"),
    blocks,
  };
}

export const hubModal: ModalDef = {
  callbackId: "opai_acciones",
  title: "Acciones OPAI",
  build,
  submit: async () => ({ ack: {} }),
};
