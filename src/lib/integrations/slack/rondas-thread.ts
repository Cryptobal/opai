/**
 * Raíz viva del hilo de una ronda (Fase 19).
 *
 * El término de la ronda llega como reply del hilo; además la RAÍZ se re-edita
 * (chat.update) para que el canal muestre el desenlace sin abrir el hilo:
 * "🛡️ Ronda Nocturna · El Bosque · Jorge Sáez → ✅ 12/12 checkpoints en 42 min".
 *
 * Los valores salen del `data` del evento de término (claves legibles que puso
 * el emisor en lifecycle-notifications: Ronda / Instalación / Guardia / resumen).
 */

import { slackUpdateMessage } from "./api";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function buildRondaRootUpdate(
  data: Record<string, unknown> | null | undefined,
  link: string | null | undefined,
): { text: string; blocks: unknown[] } {
  const ronda = str(data?.Ronda) ?? "Ronda";
  const inst = str(data?.["Instalación"]);
  const guardia = str(data?.Guardia);
  const resumen = str(data?.resumen);

  const quien = [inst, guardia].filter(Boolean).join(" · ");
  const headline = `🛡️ *${ronda}*${quien ? ` · ${quien}` : ""}${resumen ? ` → ${resumen}` : ""}`;

  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: headline } },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "Operaciones - Rondas · OPAI" }],
    },
  ];
  if (link) {
    const abs = /^https?:\/\//.test(link) ? link : `${getCanonicalSiteUrl()}${link.startsWith("/") ? "" : "/"}${link}`;
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Ver recorrido", emoji: true },
          url: abs,
          style: "primary",
        },
      ],
    });
  }
  return { text: headline.replace(/\*/g, ""), blocks };
}

/** Re-edita la raíz del hilo con el desenlace. Best-effort: nunca lanza. */
export async function updateRondaThreadRoot(params: {
  botToken: string;
  channelId: string;
  rootTs: string;
  data: Record<string, unknown> | null | undefined;
  link?: string | null;
}): Promise<void> {
  try {
    const { text, blocks } = buildRondaRootUpdate(params.data, params.link);
    await slackUpdateMessage(params.botToken, {
      channel: params.channelId,
      ts: params.rootTs,
      text,
      blocks,
    });
  } catch (err) {
    console.error("[slack] update raíz de ronda falló:", err);
  }
}
