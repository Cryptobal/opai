/**
 * Servicio del mensaje-ficha del tablero de relevo (auto-editable), espejo de
 * `CrmDealSlackRoom.fichaTs`: un único mensaje por (instalación, día, turno
 * entrante) que se re-edita con `chat.update` en cada cambio de asistencia.
 */

import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "@/lib/integrations/slack/workspace";
import { resolveInstallationSlackChannel } from "@/lib/integrations/slack/installation-channel";
import { slackPostMessage, slackUpdateMessage } from "@/lib/integrations/slack/api";
import { buildRelevoBoardData } from "./relevo-board-data";
import { buildRelevoBlocks } from "@/lib/integrations/slack/relevo-blocks";

interface BoardKey {
  tenantId: string;
  installationId: string;
  date: Date;
  shiftStart: string;
}

/**
 * Publica (o re-edita si ya existe OPEN) el tablero de relevo en el canal de la
 * instalación. No-op si no hay puente Slack. Idempotente por el unique
 * (installationId, date, shiftStart).
 */
export async function publishRelevoBoard(input: BoardKey): Promise<void> {
  const workspace = await getWorkspaceForTenant(input.tenantId);
  if (!workspace) return;
  const channelId = await resolveInstallationSlackChannel(input.tenantId, input.installationId);
  if (!channelId) return;

  const whereKey = {
    installationId_date_shiftStart: {
      installationId: input.installationId,
      date: input.date,
      shiftStart: input.shiftStart,
    },
  };
  const existing = await prisma.opsRelevoSlackBoard.findUnique({ where: whereKey });

  const data = await buildRelevoBoardData(input);
  const { text, blocks } = buildRelevoBlocks(data);

  // Ya publicado y abierto → re-edita en vez de duplicar (idempotencia).
  if (existing && existing.status === "OPEN") {
    await slackUpdateMessage(workspace.botToken, {
      channel: existing.slackChannelId,
      ts: existing.slackTs,
      text,
      blocks,
    }).catch((err) => console.error("[relevo-board] update en publish falló:", err));
    return;
  }

  const { ts } = await slackPostMessage(workspace.botToken, { channel: channelId, text, blocks });
  if (!ts) return;

  await prisma.opsRelevoSlackBoard.upsert({
    where: whereKey,
    create: {
      tenantId: input.tenantId,
      installationId: input.installationId,
      date: input.date,
      shiftStart: input.shiftStart,
      slackChannelId: channelId,
      slackTs: ts,
      status: "OPEN",
    },
    update: { slackChannelId: channelId, slackTs: ts, status: "OPEN" },
  });
}

/**
 * Re-arma y re-edita el/los tablero(s) OPEN de una instalación/fecha tras un
 * cambio de asistencia. Best-effort, NUNCA lanza. No-op si no hay tablero OPEN.
 */
export async function refreshRelevoBoardForInstallation(
  tenantId: string,
  installationId: string,
  date: Date,
): Promise<void> {
  try {
    const boards = await prisma.opsRelevoSlackBoard.findMany({
      where: { tenantId, installationId, date, status: "OPEN" },
      select: { shiftStart: true, slackChannelId: true, slackTs: true },
    });
    if (boards.length === 0) return;
    const workspace = await getWorkspaceForTenant(tenantId);
    if (!workspace) return;

    for (const b of boards) {
      try {
        const data = await buildRelevoBoardData({ tenantId, installationId, date, shiftStart: b.shiftStart });
        const { text, blocks } = buildRelevoBlocks(data);
        await slackUpdateMessage(workspace.botToken, {
          channel: b.slackChannelId,
          ts: b.slackTs,
          text,
          blocks,
        });
      } catch (err) {
        console.error("[relevo-board] refresh de un board falló:", err);
      }
    }
  } catch (err) {
    console.error("[relevo-board] refresh falló:", err);
  }
}

/** Cierra el tablero al terminar el turno (marca CLOSED). Best-effort. */
export async function closeRelevoBoard(input: BoardKey): Promise<void> {
  try {
    await prisma.opsRelevoSlackBoard.updateMany({
      where: {
        tenantId: input.tenantId,
        installationId: input.installationId,
        date: input.date,
        shiftStart: input.shiftStart,
        status: "OPEN",
      },
      data: { status: "CLOSED" },
    });
  } catch (err) {
    console.error("[relevo-board] close falló:", err);
  }
}
