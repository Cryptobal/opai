/**
 * Backfill del responsable por defecto en tickets ABIERTOS sin responsable.
 *
 * Contexto (Fase 11): `OpsTicketType.defaultAssignedToUserId` existe hace tiempo
 * pero `createOpsTicket` lo ignoraba, así que los tickets nacían huérfanos
 * (≈145 sin responsable). El fix raíz ya está cableado: los NUEVOS tickets
 * heredan el responsable del tipo. Este script cierra la brecha histórica:
 * asigna el `defaultAssignedToUserId` del tipo a los tickets abiertos/activos
 * que hoy no tienen responsable, SOLO cuando su tipo tiene un default activo.
 *
 * ⚠️ NO EJECUTAR sin decisión humana: asignar en masa dispara notificaciones
 * (una por ticket). Por eso el default es dry-run y las notificaciones vienen
 * APAGADAS salvo que se pidan explícitamente con `--notify`.
 *
 * Uso:
 *   npx tsx scripts/backfill-ticket-assignees.ts                 # dry-run (no escribe, no notifica)
 *   npx tsx scripts/backfill-ticket-assignees.ts --commit        # asigna, SIN notificar
 *   npx tsx scripts/backfill-ticket-assignees.ts --commit --notify   # asigna Y notifica a cada responsable
 *   npx tsx scripts/backfill-ticket-assignees.ts --commit --tenant <tenantId>
 *
 * Idempotente: un ticket que ya tiene responsable no se toca.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ACTIVE_STATUSES = ["open", "in_progress", "waiting", "pending_approval"];

const argv = process.argv.slice(2);
const COMMIT = argv.includes("--commit");
const NOTIFY = argv.includes("--notify");
const tenantFlagIdx = argv.indexOf("--tenant");
const ONLY_TENANT = tenantFlagIdx >= 0 ? argv[tenantFlagIdx + 1] : null;

async function main() {
  console.log(
    `\nBackfill responsable por defecto — modo: ${COMMIT ? "COMMIT" : "DRY-RUN"}` +
      `${COMMIT ? (NOTIFY ? " (con notificaciones)" : " (SIN notificaciones)") : ""}` +
      `${ONLY_TENANT ? ` · tenant=${ONLY_TENANT}` : ""}\n`,
  );

  // Tipos con default activo (el default apunta a un admin activo del tenant).
  const types = await prisma.opsTicketType.findMany({
    where: {
      defaultAssignedToUserId: { not: null },
      ...(ONLY_TENANT ? { tenantId: ONLY_TENANT } : {}),
    },
    select: { id: true, tenantId: true, name: true, defaultAssignedToUserId: true },
  });
  if (types.length === 0) {
    console.log("No hay tipos con responsable por defecto. Nada que hacer.");
    return;
  }

  // Validar que cada default siga activo en su tenant.
  const defaultIds = [...new Set(types.map((t) => t.defaultAssignedToUserId!))];
  const activeAdmins = await prisma.admin.findMany({
    where: { id: { in: defaultIds }, status: "active" },
    select: { id: true, tenantId: true, name: true, email: true },
  });
  const activeById = new Map(activeAdmins.map((a) => [`${a.tenantId}:${a.id}`, a]));

  let totalCandidates = 0;
  let totalAssigned = 0;

  for (const type of types) {
    const admin = activeById.get(`${type.tenantId}:${type.defaultAssignedToUserId}`);
    if (!admin) {
      console.log(
        `· Tipo "${type.name}" (${type.id}): su responsable por defecto no está activo → se omite.`,
      );
      continue;
    }

    const candidates = await prisma.opsTicket.findMany({
      where: {
        tenantId: type.tenantId,
        ticketTypeId: type.id,
        assignedTo: null,
        status: { in: ACTIVE_STATUSES },
      },
      select: { id: true, code: true, title: true, priority: true, assignedTeam: true },
    });
    if (candidates.length === 0) continue;

    totalCandidates += candidates.length;
    console.log(
      `· Tipo "${type.name}": ${candidates.length} ticket(s) → ${admin.name || admin.email}`,
    );

    if (!COMMIT) continue;

    for (const t of candidates) {
      await prisma.$transaction(async (tx) => {
        // Anti-carrera: solo si sigue sin responsable.
        const claimed = await tx.opsTicket.updateMany({
          where: { id: t.id, assignedTo: null },
          data: { assignedTo: admin.id },
        });
        if (claimed.count === 0) return;
        const { recordTicketEvent } = await import("../src/lib/tickets-events");
        await recordTicketEvent({
          tenantId: type.tenantId,
          ticketId: t.id,
          type: "assignee_changed",
          actorId: admin.id,
          data: { from: null, to: admin.id, source: "backfill", via: "default_assignee" },
          tx,
        });
        totalAssigned++;
      });

      if (NOTIFY) {
        const { notifyTicketAssigned } = await import(
          "../src/lib/notifications/notify-ticket-assigned"
        );
        await notifyTicketAssigned({
          tenantId: type.tenantId,
          ticketId: t.id,
          ticketCode: t.code,
          ticketTitle: t.title,
          ticketPriority: t.priority,
          ticketAssignedTeam: t.assignedTeam,
          assigneeId: admin.id,
          assignedById: admin.id,
          source: "patch",
        }).catch((e) => console.error(`  ⚠ notify ${t.code} falló:`, e));
      }
    }
  }

  console.log(
    `\n${COMMIT ? "Asignados" : "Candidatos"}: ${COMMIT ? totalAssigned : totalCandidates} ticket(s).`,
  );
  if (!COMMIT && totalCandidates > 0) {
    console.log(
      "Dry-run. Corre con --commit para aplicar (agrega --notify para avisar a cada responsable).",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
