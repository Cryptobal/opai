/**
 * Lógica core: crea ClientOnboarding + tickets a partir del input del modal.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateTicketCode } from "@/lib/tickets";
import { recordTicketEvent } from "@/lib/tickets-events";
import type {
  OnboardingStartInput,
  OnboardingStartStepInput,
} from "@/lib/validations/onboarding";

export type StartOnboardingResult = {
  onboardingId: string;
  ticketIds: string[];
  ticketsByTeam: Record<string, string[]>;
};

export type StartOnboardingCtx = {
  tenantId: string;
  userId: string;
};

function computeSlaDueAt(serviceStart: Date, offsetDays: number): Date {
  return new Date(serviceStart.getTime() + offsetDays * 86_400_000);
}

/**
 * Devuelve el último número de secuencia usado por los códigos de ticket del
 * tenant. Se llama UNA sola vez antes del loop de creación: dentro de una misma
 * transacción todas las filas comparten `transaction_timestamp()` como
 * `createdAt`, así que ordenar por `createdAt` no distingue entre los tickets
 * recién creados y `findFirst` podría devolver uno con código no-máximo,
 * generando un código duplicado (P2002). Calculamos la base una vez y luego
 * incrementamos en memoria.
 */
async function lastTicketSeq(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<number> {
  const last = await tx.opsTicket.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: { code: true },
  });
  const parsed = last?.code
    ? parseInt(last.code.split("-").pop() ?? "0", 10)
    : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function startOnboardingForDeal(
  ctx: StartOnboardingCtx,
  input: OnboardingStartInput,
): Promise<StartOnboardingResult> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: input.dealId, tenantId: ctx.tenantId },
    include: { account: true },
  });
  if (!deal) throw new Error("Deal no encontrado");
  if (deal.status !== "won") throw new Error("El deal no está en estado won");

  const existing = await prisma.clientOnboarding.findUnique({
    where: { dealId: deal.id },
    select: { id: true },
  });
  if (existing) {
    const err = new Error("Ya existe un onboarding para este deal") as Error & {
      code?: string;
    };
    err.code = "ALREADY_EXISTS";
    throw err;
  }

  const installation = await prisma.crmInstallation.findFirst({
    where: { tenantId: ctx.tenantId, accountId: deal.accountId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const playbook = await prisma.onboardingPlaybook.findFirst({
    where: { id: input.playbookId, tenantId: ctx.tenantId },
    select: { id: true, isDefault: true },
  });
  if (!playbook) throw new Error("Playbook no encontrado");

  const serviceStart = new Date(input.serviceStartDate);
  if (Number.isNaN(serviceStart.getTime())) {
    throw new Error("serviceStartDate inválida");
  }

  return prisma.$transaction(async (tx) => {
    const onboarding = await tx.clientOnboarding.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: deal.accountId,
        installationId: installation?.id ?? null,
        dealId: deal.id,
        playbookId: playbook.id,
        serviceStartDate: serviceStart,
        status: "in_progress",
        createdBy: ctx.userId,
        notes: input.notes,
      },
    });

    const ticketIds: string[] = [];
    const ticketsByTeam: Record<string, string[]> = {};
    const customStepsToSave: OnboardingStartStepInput[] = [];

    // Secuencia base calculada una sola vez; cada ticket creado en este loop
    // toma el siguiente número en memoria para evitar colisiones de código.
    let ticketSeq = await lastTicketSeq(tx, ctx.tenantId);

    for (const step of input.steps) {
      if (!step.applies) {
        await tx.clientOnboardingStep.create({
          data: {
            onboardingId: onboarding.id,
            playbookStepId: step.playbookStepId ?? null,
            isCustom: !!step.isCustom,
            title: step.title,
            status: "skipped",
            skippedReason: "Marcado como no aplica al crear onboarding",
          },
        });
        continue;
      }

      if (!step.ticketTypeSlug) {
        throw new Error(
          `Step "${step.title}" requiere ticketTypeSlug cuando applies=true`,
        );
      }
      const ticketType = await tx.opsTicketType.findUnique({
        where: { tenantId_slug: { tenantId: ctx.tenantId, slug: step.ticketTypeSlug } },
        select: {
          id: true,
          assignedTeam: true,
          defaultPriority: true,
        },
      });
      if (!ticketType) {
        throw new Error(`Tipo de ticket "${step.ticketTypeSlug}" no existe`);
      }

      const offsetDays = step.dueDateOffsetDays ?? 0;
      const slaDueAt = computeSlaDueAt(serviceStart, offsetDays);
      ticketSeq += 1;
      const code = generateTicketCode(ticketSeq);

      const ticket = await tx.opsTicket.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          ticketTypeId: ticketType.id,
          status: "open",
          priority: step.priority ?? ticketType.defaultPriority,
          title: step.title,
          description: step.description ?? null,
          assignedTeam: step.assignedTeam ?? ticketType.assignedTeam,
          assignedTo: step.assignedToUserId ?? null,
          installationId: installation?.id ?? null,
          source: "onboarding",
          reportedBy: ctx.userId,
          slaDueAt,
          metadata: {
            onboardingId: onboarding.id,
            playbookStepId: step.playbookStepId ?? null,
            isCustom: !!step.isCustom,
          } as Prisma.InputJsonValue,
        },
        select: { id: true, assignedTeam: true },
      });

      await recordTicketEvent({
        tenantId: ctx.tenantId,
        ticketId: ticket.id,
        type: "ticket_created",
        actorId: ctx.userId,
        data: { source: "onboarding", onboardingId: onboarding.id },
        tx,
      });

      await tx.clientOnboardingStep.create({
        data: {
          onboardingId: onboarding.id,
          playbookStepId: step.playbookStepId ?? null,
          ticketId: ticket.id,
          isCustom: !!step.isCustom,
          title: step.title,
          status: "open",
        },
      });

      ticketIds.push(ticket.id);
      const team = ticket.assignedTeam;
      if (!ticketsByTeam[team]) ticketsByTeam[team] = [];
      ticketsByTeam[team].push(ticket.id);

      if (step.isCustom && step.saveToPlaybook) {
        customStepsToSave.push(step);
      }
    }

    if (customStepsToSave.length > 0) {
      const defaultPb = await tx.onboardingPlaybook.findFirst({
        where: { tenantId: ctx.tenantId, isDefault: true },
        select: { id: true },
      });
      if (defaultPb) {
        const maxSort = await tx.onboardingPlaybookStep.aggregate({
          where: { playbookId: defaultPb.id },
          _max: { sortOrder: true },
        });
        let nextSort = (maxSort._max.sortOrder ?? 0) + 1;
        for (const s of customStepsToSave) {
          if (!s.ticketTypeSlug) continue;
          await tx.onboardingPlaybookStep.create({
            data: {
              playbookId: defaultPb.id,
              phase: s.phase ?? 4,
              sortOrder: nextSort++,
              slug: `custom_${Date.now()}_${nextSort}`,
              title: s.title,
              description: s.description,
              ticketTypeSlug: s.ticketTypeSlug,
              defaultAssignedTeam: s.assignedTeam ?? "ops",
              defaultPriority: s.priority ?? "p3",
              dueDateOffsetDays: s.dueDateOffsetDays ?? 0,
              defaultApplies: true,
            },
          });
        }
      }
    }

    return {
      onboardingId: onboarding.id,
      ticketIds,
      ticketsByTeam,
    };
  });
}
