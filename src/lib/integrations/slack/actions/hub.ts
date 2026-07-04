/**
 * Hub de acciones rápidas (`opai_acciones`, Fase 7 · F20): modal-menú con las
 * acciones disponibles PARA ESE USUARIO (filtradas por capability real),
 * agrupadas por módulo con header + divider. El texto de cada botón ES la
 * acción con su emoji ("🎫 Mis tickets", "⏱ Ingresar turno extra") — nunca un
 * "Abrir" genérico. Cada botón apila su modal (block_action
 * `opai_action_open_<callbackId>`). El hub no envía (no tiene submit útil).
 */

import { ACTIONS, type ActionDef } from "./registry";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text, emoji: true });

/** Botón cuyo label es la acción misma. action_id único por callbackId. */
function actionButton(a: ActionDef): unknown {
  return {
    type: "button",
    text: pt(`${a.emoji} ${a.title}`.slice(0, 75)),
    value: a.callbackId,
    action_id: `opai_action_open_${a.callbackId}`,
  };
}

/** Parte una lista en filas de máx. 3 botones (Slack mobile, 375px). */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function build(ctx: ModalOpenContext): SlackView {
  const allowed = ACTIONS.filter((a) => !a.requires || a.requires(ctx.linked.perms));
  const blocks: unknown[] = [];

  if (allowed.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "No tienes acciones disponibles. Pide acceso a tu administrador de OPAI." },
    });
  } else {
    const groups = new Map<string, ActionDef[]>();
    for (const a of allowed) {
      const list = groups.get(a.group) ?? [];
      list.push(a);
      groups.set(a.group, list);
    }
    let first = true;
    for (const [group, list] of groups) {
      if (!first) blocks.push({ type: "divider" });
      first = false;
      blocks.push({ type: "header", text: pt(group) });
      for (const row of chunk(list, 3)) {
        blocks.push({ type: "actions", elements: row.map(actionButton) });
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
