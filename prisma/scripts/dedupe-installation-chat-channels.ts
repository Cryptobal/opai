/**
 * Normaliza canales ChatChannel INSTALLATION duplicados por instalación.
 *
 * - Por defecto: --dry-run (no escribe).
 * - --apply: ejecuta el merge.
 * - --tenant=<id>: acota a un tenant.
 *
 * Uso:
 *   npx tsx prisma/scripts/dedupe-installation-chat-channels.ts
 *   npx tsx prisma/scripts/dedupe-installation-chat-channels.ts --apply
 *   npx tsx prisma/scripts/dedupe-installation-chat-channels.ts --tenant=xxx --dry-run
 *
 * ⛔ No ejecutar --apply contra producción sin aprobación explícita.
 */

import { PrismaClient, type ChatChannel } from "@prisma/client";
import {
  INSTALLATION_CHANNEL_SUBTYPE,
  installationChannelName,
} from "../../src/lib/chat-installation-channel";

const prisma = new PrismaClient();

type ChannelRow = Pick<
  ChatChannel,
  | "id"
  | "tenantId"
  | "installationId"
  | "subType"
  | "name"
  | "isActive"
  | "messageCount"
  | "lastMessageAt"
  | "lastMessagePreview"
  | "createdAt"
>;

function parseArgs(argv: string[]) {
  let apply = false;
  let dryRun = true;
  let tenantId: string | undefined;
  for (const arg of argv) {
    if (arg === "--apply") {
      apply = true;
      dryRun = false;
    } else if (arg === "--dry-run") {
      dryRun = true;
      apply = false;
    } else if (arg.startsWith("--tenant=")) {
      tenantId = arg.slice("--tenant=".length) || undefined;
    }
  }
  return { apply, dryRun, tenantId };
}

function pickWinner(
  channels: ChannelRow[],
  linksByChannel: Map<string, { id: string }>,
): ChannelRow {
  const withReportes = channels.filter(
    (c) => c.subType === INSTALLATION_CHANNEL_SUBTYPE,
  );
  let candidates = withReportes.length > 0 ? withReportes : channels;

  // Prefer channel with Slack link unless it has 0 messages and another has messages
  const withLink = candidates.filter((c) => linksByChannel.has(c.id));
  const withoutLink = candidates.filter((c) => !linksByChannel.has(c.id));
  if (withLink.length === 1 && withoutLink.length > 0) {
    const linked = withLink[0]!;
    const bestOther = [...withoutLink].sort(
      (a, b) =>
        b.messageCount - a.messageCount ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )[0]!;
    if (linked.messageCount === 0 && bestOther.messageCount > 0) {
      // Keep bestOther as winner; link will be moved
      candidates = [bestOther];
    } else {
      candidates = [linked];
    }
  } else if (withLink.length > 1) {
    candidates = withLink;
  }

  return [...candidates].sort(
    (a, b) =>
      b.messageCount - a.messageCount ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )[0]!;
}

async function moveUniqueRows(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  table:
    | "chatReadCursor"
    | "chatNotificationPreference"
    | "chatChannelParticipant"
    | "chatChannelArchive",
  loserId: string,
  winnerId: string,
) {
  if (table === "chatReadCursor") {
    const loserRows = await tx.chatReadCursor.findMany({
      where: { channelId: loserId },
    });
    const winnerKeys = new Set(
      (
        await tx.chatReadCursor.findMany({
          where: { channelId: winnerId },
          select: { readerType: true, readerId: true },
        })
      ).map((r) => `${r.readerType}:${r.readerId}`),
    );
    for (const row of loserRows) {
      const key = `${row.readerType}:${row.readerId}`;
      if (winnerKeys.has(key)) {
        await tx.chatReadCursor.delete({ where: { id: row.id } });
      } else {
        await tx.chatReadCursor.update({
          where: { id: row.id },
          data: { channelId: winnerId },
        });
      }
    }
    return;
  }

  if (table === "chatNotificationPreference") {
    const loserRows = await tx.chatNotificationPreference.findMany({
      where: { channelId: loserId },
    });
    const winnerKeys = new Set(
      (
        await tx.chatNotificationPreference.findMany({
          where: { channelId: winnerId },
          select: { userType: true, userId: true },
        })
      ).map((r) => `${r.userType}:${r.userId}`),
    );
    for (const row of loserRows) {
      const key = `${row.userType}:${row.userId}`;
      if (winnerKeys.has(key)) {
        await tx.chatNotificationPreference.delete({ where: { id: row.id } });
      } else {
        await tx.chatNotificationPreference.update({
          where: { id: row.id },
          data: { channelId: winnerId },
        });
      }
    }
    return;
  }

  if (table === "chatChannelParticipant") {
    const loserRows = await tx.chatChannelParticipant.findMany({
      where: { channelId: loserId },
    });
    const winnerKeys = new Set(
      (
        await tx.chatChannelParticipant.findMany({
          where: { channelId: winnerId },
          select: { participantType: true, participantId: true },
        })
      ).map((r) => `${r.participantType}:${r.participantId}`),
    );
    for (const row of loserRows) {
      const key = `${row.participantType}:${row.participantId}`;
      if (winnerKeys.has(key)) {
        await tx.chatChannelParticipant.delete({ where: { id: row.id } });
      } else {
        await tx.chatChannelParticipant.update({
          where: { id: row.id },
          data: { channelId: winnerId },
        });
      }
    }
    return;
  }

  // chatChannelArchive
  const loserRows = await tx.chatChannelArchive.findMany({
    where: { channelId: loserId },
  });
  const winnerKeys = new Set(
    (
      await tx.chatChannelArchive.findMany({
        where: { channelId: winnerId },
        select: { adminId: true },
      })
    ).map((r) => r.adminId),
  );
  for (const row of loserRows) {
    if (winnerKeys.has(row.adminId)) {
      await tx.chatChannelArchive.delete({ where: { id: row.id } });
    } else {
      await tx.chatChannelArchive.update({
        where: { id: row.id },
        data: { channelId: winnerId },
      });
    }
  }
}

async function mergeLoserIntoWinner(
  loser: ChannelRow,
  winner: ChannelRow,
  linksByChannel: Map<string, { id: string }>,
  dryRun: boolean,
) {
  const loserLink = linksByChannel.get(loser.id);
  const winnerLink = linksByChannel.get(winner.id);

  if (dryRun) {
    return {
      action:
        loser.messageCount === 0 && !loserLink
          ? "delete-empty"
          : "merge-messages",
      moveLink: Boolean(loserLink && !winnerLink),
      dropLoserLink: Boolean(loserLink && winnerLink),
    };
  }

  await prisma.$transaction(async (tx) => {
    if (loserLink && !winnerLink) {
      await tx.slackChannelLink.update({
        where: { id: loserLink.id },
        data: { chatChannelId: winner.id },
      });
    } else if (loserLink && winnerLink) {
      await tx.slackChannelLink.delete({ where: { id: loserLink.id } });
    }

    if (loser.messageCount === 0 && !loserLink) {
      await tx.chatChannel.delete({ where: { id: loser.id } });
      return;
    }

    await tx.chatMessage.updateMany({
      where: { channelId: loser.id },
      data: { channelId: winner.id },
    });

    await moveUniqueRows(tx, "chatReadCursor", loser.id, winner.id);
    await moveUniqueRows(tx, "chatNotificationPreference", loser.id, winner.id);
    await moveUniqueRows(tx, "chatChannelParticipant", loser.id, winner.id);
    await moveUniqueRows(tx, "chatChannelArchive", loser.id, winner.id);

    // DM participants unlikely on INSTALLATION; still clear safely
    await tx.chatDmParticipant.deleteMany({ where: { channelId: loser.id } });

    await tx.chatChannel.delete({ where: { id: loser.id } });
  });

  return {
    action: "merged",
    moveLink: Boolean(loserLink && !winnerLink),
    dropLoserLink: Boolean(loserLink && winnerLink),
  };
}

async function recalculateWinner(
  winnerId: string,
  installationName: string,
  isActive: boolean,
  dryRun: boolean,
) {
  const name = installationChannelName(installationName);
  if (dryRun) {
    return { name, isActive };
  }

  const lastMsg = await prisma.chatMessage.findFirst({
    where: { channelId: winnerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      content: true,
      senderName: true,
    },
  });
  const messageCount = await prisma.chatMessage.count({
    where: { channelId: winnerId, deletedAt: null },
  });

  const preview = lastMsg?.content
    ? lastMsg.content.replace(/<[^>]+>/g, "").slice(0, 100)
    : null;

  await prisma.chatChannel.update({
    where: { id: winnerId },
    data: {
      subType: INSTALLATION_CHANNEL_SUBTYPE,
      name,
      isActive,
      messageCount,
      lastMessageAt: lastMsg?.createdAt ?? null,
      lastMessagePreview: preview,
      lastMessageSenderName: lastMsg?.senderName ?? null,
    },
  });

  return { name, isActive, messageCount };
}

async function processTenant(tenantId: string, dryRun: boolean) {
  const channels = await prisma.chatChannel.findMany({
    where: {
      tenantId,
      channelType: "INSTALLATION",
      installationId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      installationId: true,
      subType: true,
      name: true,
      isActive: true,
      messageCount: true,
      lastMessageAt: true,
      lastMessagePreview: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const byInstallation = new Map<string, ChannelRow[]>();
  for (const ch of channels) {
    if (!ch.installationId) continue;
    const list = byInstallation.get(ch.installationId) ?? [];
    list.push(ch);
    byInstallation.set(ch.installationId, list);
  }

  const channelIds = channels.map((c) => c.id);
  const links = channelIds.length
    ? await prisma.slackChannelLink.findMany({
        where: { tenantId, chatChannelId: { in: channelIds } },
        select: { id: true, chatChannelId: true },
      })
    : [];
  const linksByChannel = new Map(
    links.map((l) => [l.chatChannelId, { id: l.id }]),
  );

  const installationIds = [...byInstallation.keys()];
  const installations = installationIds.length
    ? await prisma.crmInstallation.findMany({
        where: { tenantId, id: { in: installationIds } },
        select: {
          id: true,
          name: true,
          status: true,
          chatEnabled: true,
        },
      })
    : [];
  const instById = new Map(installations.map((i) => [i.id, i]));

  let groupsTouched = 0;
  let losersMerged = 0;
  let nullNormalized = 0;

  // Report active "interno" channels (do not merge)
  const activeInterno = channels.filter(
    (c) => c.subType === "interno" && c.isActive,
  );
  if (activeInterno.length > 0) {
    console.log(
      JSON.stringify({
        level: "info",
        event: "active_interno_channels",
        tenantId,
        count: activeInterno.length,
        ids: activeInterno.map((c) => c.id),
      }),
    );
  }

  for (const [installationId, group] of byInstallation) {
    const inst = instById.get(installationId);
    const instName = inst?.name ?? group[0]!.name;
    const shouldActive =
      (inst?.status === "active" && inst?.chatEnabled === true) ?? false;

    // Exclude interno from merge groups
    const mergeable = group.filter((c) => c.subType !== "interno");
    if (mergeable.length === 0) continue;

    if (mergeable.length === 1) {
      const only = mergeable[0]!;
      if (only.subType == null || only.subType !== INSTALLATION_CHANNEL_SUBTYPE) {
        nullNormalized += 1;
        console.log(
          JSON.stringify({
            level: "plan",
            event: "normalize_single",
            tenantId,
            installationId,
            installationName: instName,
            channelId: only.id,
            fromSubType: only.subType,
            toSubType: INSTALLATION_CHANNEL_SUBTYPE,
            name: installationChannelName(instName),
            isActive: shouldActive,
          }),
        );
        if (!dryRun) {
          // If another channel already owns (installationId, reportes), skip rename of subtype
          const conflict = await prisma.chatChannel.findUnique({
            where: {
              installationId_subType: {
                installationId,
                subType: INSTALLATION_CHANNEL_SUBTYPE,
              },
            },
            select: { id: true },
          });
          if (!conflict || conflict.id === only.id) {
            await recalculateWinner(only.id, instName, shouldActive, false);
          }
        }
      }
      continue;
    }

    groupsTouched += 1;
    const winner = pickWinner(mergeable, linksByChannel);
    const losers = mergeable.filter((c) => c.id !== winner.id);

    console.log(
      JSON.stringify({
        level: "plan",
        event: "dedupe_group",
        tenantId,
        installationId,
        installationName: instName,
        winner: {
          id: winner.id,
          subType: winner.subType,
          messageCount: winner.messageCount,
          hasSlackLink: linksByChannel.has(winner.id),
        },
        losers: losers.map((l) => ({
          id: l.id,
          subType: l.subType,
          messageCount: l.messageCount,
          hasSlackLink: linksByChannel.has(l.id),
        })),
      }),
    );

    for (const loser of losers) {
      const result = await mergeLoserIntoWinner(
        loser,
        winner,
        linksByChannel,
        dryRun,
      );
      losersMerged += 1;
      console.log(
        JSON.stringify({
          level: dryRun ? "plan" : "applied",
          event: "merge_loser",
          tenantId,
          installationId,
          winnerId: winner.id,
          loserId: loser.id,
          ...result,
        }),
      );
      // Update in-memory link map after apply
      if (!dryRun) {
        const moved = linksByChannel.get(loser.id);
        if (moved && !linksByChannel.has(winner.id)) {
          linksByChannel.set(winner.id, moved);
        }
        linksByChannel.delete(loser.id);
      }
    }

    await recalculateWinner(winner.id, instName, shouldActive, dryRun);
  }

  return { groupsTouched, losersMerged, nullNormalized };
}

async function main() {
  const { apply, dryRun, tenantId } = parseArgs(process.argv.slice(2));
  console.log(
    JSON.stringify({
      level: "info",
      event: "start",
      mode: apply ? "apply" : "dry-run",
      tenantId: tenantId ?? null,
    }),
  );

  const tenants = tenantId
    ? [{ id: tenantId }]
    : await prisma.tenant.findMany({ select: { id: true } });

  let totalGroups = 0;
  let totalLosers = 0;
  let totalNull = 0;

  for (const t of tenants) {
    const result = await processTenant(t.id, dryRun);
    totalGroups += result.groupsTouched;
    totalLosers += result.losersMerged;
    totalNull += result.nullNormalized;
  }

  console.log(
    JSON.stringify({
      level: "info",
      event: "summary",
      mode: apply ? "apply" : "dry-run",
      tenants: tenants.length,
      duplicateGroups: totalGroups,
      losersProcessed: totalLosers,
      nullSubtypeNormalized: totalNull,
    }),
  );

  if (dryRun) {
    console.log(
      "\nDry-run complete. Re-run with --apply to execute (requires explicit approval for production).",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
