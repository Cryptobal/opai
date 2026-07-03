/**
 * Helpers reutilizables sobre `SlackOutbox` (Fase 6): encolar una fila PENDING e
 * intentar el envío inmediato, marcando SENT | FAILED con la misma política de
 * errores permanentes (el cron `flush-slack-outbox` reintenta los transitorios).
 * Los usa el DM personal; el dispatch tenant mantiene su flujo con botones.
 */

import { prisma } from "@/lib/prisma";
import { slackPostMessage, SlackApiError, isPermanentSlackError } from "./api";

/** Crea la fila PENDING. Devuelve el id, o null si el dedupe (unique) chocó. */
export async function enqueueOutboxRow(params: {
  tenantId: string;
  workspaceId: string;
  channelId: string;
  text: string;
  blocks: unknown[];
  dedupeKey: string;
}): Promise<string | null> {
  try {
    const row = await prisma.slackOutbox.create({
      data: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        channelId: params.channelId,
        payload: { text: params.text, blocks: params.blocks } as object,
        dedupeKey: params.dedupeKey,
        status: "PENDING",
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return null; // ya encolado
    throw err;
  }
}

/** Intenta enviar una fila ya encolada; marca SENT o FAILED. Devuelve el ts. */
export async function trySendOutboxRow(
  botToken: string,
  outboxId: string,
  channelId: string,
  text: string,
  blocks: unknown[],
): Promise<string | null> {
  try {
    const { ts } = await slackPostMessage(botToken, { channel: channelId, text, blocks });
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "SENT", sentAt: new Date(), slackTs: ts },
    });
    return ts || null;
  } catch (err) {
    const reason = err instanceof SlackApiError ? err.slackError : String(err);
    const permanent = err instanceof SlackApiError && isPermanentSlackError(err.slackError);
    // permanent → attempts al tope: el cron (attempts < 5) no lo vuelve a tomar.
    await prisma.slackOutbox.update({
      where: { id: outboxId },
      data: { status: "FAILED", attempts: permanent ? 5 : 1, lastError: reason },
    });
    return null;
  }
}
