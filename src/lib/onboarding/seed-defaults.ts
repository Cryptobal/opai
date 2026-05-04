/**
 * Seed idempotente del playbook por defecto y los OpsTicketType del onboarding.
 *
 * Llamado desde:
 * - El endpoint admin POST /api/onboarding/playbooks/seed-default
 * - Hook automático cuando un deal pasa a "won" (idempotente)
 */

import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PLAYBOOK_NAME,
  DEFAULT_PLAYBOOK_VERSION,
  ONBOARDING_PLAYBOOK_STEPS,
  ONBOARDING_TICKET_TYPES,
} from "./types";

export type EnsureDefaultPlaybookResult = {
  playbookId: string;
  ticketTypesCreated: number;
  ticketTypesExisting: number;
  stepsCreated: number;
  stepsExisting: number;
  playbookCreated: boolean;
};

/**
 * Defensive guard: la migration `20260721000000_add_default_assignee_to_ops_ticket_types`
 * agrega la columna `default_assigned_to_user_id`. En algunos despliegues la
 * migration no quedó aplicada y Prisma falla con P2022. Usamos `IF NOT EXISTS`
 * para ser idempotente y no romper si ya está aplicada.
 */
let columnGuardApplied = false;
async function ensureOpsTicketTypeColumns(): Promise<void> {
  if (columnGuardApplied) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "ops"."ops_ticket_types" ADD COLUMN IF NOT EXISTS "default_assigned_to_user_id" TEXT`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_ops_ticket_types_default_assignee" ON "ops"."ops_ticket_types" ("default_assigned_to_user_id")`,
    );
    columnGuardApplied = true;
  } catch (err) {
    // No bloqueamos la operación si la verificación falla por permisos: la
    // migration normal se encarga del estado correcto.
    console.warn("[onboarding] ensureOpsTicketTypeColumns: skip", err);
  }
}

/**
 * Asegura que el tenant tenga los 6 OpsTicketType del onboarding y un
 * OnboardingPlaybook default ("Estándar" v1) con sus 6 steps.
 * Idempotente: si ya existe, no duplica.
 */
export async function ensureDefaultPlaybook(
  tenantId: string,
): Promise<EnsureDefaultPlaybookResult> {
  if (!tenantId) {
    throw new Error("ensureDefaultPlaybook: tenantId is required");
  }

  await ensureOpsTicketTypeColumns();

  return prisma.$transaction(async (tx) => {
    let ticketTypesCreated = 0;
    let ticketTypesExisting = 0;

    for (const tt of ONBOARDING_TICKET_TYPES) {
      const existing = await tx.opsTicketType.findUnique({
        where: { tenantId_slug: { tenantId, slug: tt.slug } },
        select: { id: true },
      });
      if (existing) {
        ticketTypesExisting++;
        continue;
      }
      await tx.opsTicketType.create({
        data: {
          tenantId,
          slug: tt.slug,
          name: tt.name,
          description: tt.description,
          assignedTeam: tt.assignedTeam,
          defaultPriority: tt.defaultPriority,
          slaHours: tt.slaHours,
          icon: tt.icon,
          sortOrder: tt.sortOrder,
          origin: "internal",
          requiresApproval: false,
          isActive: true,
        },
      });
      ticketTypesCreated++;
    }

    let playbook = await tx.onboardingPlaybook.findFirst({
      where: {
        tenantId,
        name: DEFAULT_PLAYBOOK_NAME,
        version: DEFAULT_PLAYBOOK_VERSION,
      },
      select: { id: true },
    });

    let playbookCreated = false;
    if (!playbook) {
      const created = await tx.onboardingPlaybook.create({
        data: {
          tenantId,
          name: DEFAULT_PLAYBOOK_NAME,
          version: DEFAULT_PLAYBOOK_VERSION,
          isDefault: true,
          isActive: true,
          description: "Playbook estándar de onboarding del cliente.",
        },
        select: { id: true },
      });
      playbook = created;
      playbookCreated = true;
    }

    let stepsCreated = 0;
    let stepsExisting = 0;
    for (const step of ONBOARDING_PLAYBOOK_STEPS) {
      const existing = await tx.onboardingPlaybookStep.findUnique({
        where: {
          playbookId_slug: { playbookId: playbook.id, slug: step.slug },
        },
        select: { id: true },
      });
      if (existing) {
        stepsExisting++;
        continue;
      }
      await tx.onboardingPlaybookStep.create({
        data: {
          playbookId: playbook.id,
          phase: step.phase,
          sortOrder: step.sortOrder,
          slug: step.slug,
          title: step.title,
          description: step.description,
          ticketTypeSlug: step.ticketTypeSlug,
          defaultAssignedTeam: step.defaultAssignedTeam,
          defaultPriority: step.defaultPriority,
          dueDateOffsetDays: step.dueDateOffsetDays,
          defaultApplies: true,
        },
      });
      stepsCreated++;
    }

    console.info("[onboarding] ensureDefaultPlaybook", {
      tenantId,
      playbookId: playbook.id,
      playbookCreated,
      ticketTypesCreated,
      ticketTypesExisting,
      stepsCreated,
      stepsExisting,
    });

    return {
      playbookId: playbook.id,
      ticketTypesCreated,
      ticketTypesExisting,
      stepsCreated,
      stepsExisting,
      playbookCreated,
    };
  });
}
