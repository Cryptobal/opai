/**
 * Migración de datos F1 — ciclo de vida, settings y catálogo simplificado.
 *
 * Default: --dry-run (no escribe).
 * Aplicar (solo con aprobación explícita, nunca contra producción desde este PR):
 *   npx tsx scripts/migrate-platform-lifecycle.ts --apply
 *
 * No auto-suspende tenants. No toca TenantAddon.enabled.
 *
 * STOP: si Gard quedaría blocked o read_only, aborta con exit 1.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { PLATFORM_SETTING_DEFAULTS } from "../src/lib/platform/settings";
import {
  computeBillingMigration,
  isEnterpriseIncomplete,
  shouldDeactivateAddon,
  type BillingMigrationIntent,
  type MigrationTenantInput,
} from "../src/lib/platform/lifecycle-migration";
import { deriveTenantAccess } from "../src/lib/platform/tenant-lifecycle";
import type { LifecycleSettings } from "../src/lib/platform/settings";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

const KEEP_ADDON_KEYS_HELP = [
  "crm",
  "cpq",
  "finanzas",
  "payroll",
  "ops_rondas",
  "ops_inventario",
  "ops_camaras",
  "face_id",
  "control_acceso",
  "app_nativa",
  "white_label",
  "psych",
  "ia_operacional",
  "control_nocturno",
  "fiscalizacion",
  "portal_cliente",
  "ats",
];

function line(title: string) {
  console.log("\n" + "═".repeat(72));
  console.log(title);
  console.log("═".repeat(72));
}

function lifecycleSettingsFromDefaults(): LifecycleSettings {
  return {
    enabled: Boolean(PLATFORM_SETTING_DEFAULTS["lifecycle.enabled"]),
    emailsEnabled: Boolean(PLATFORM_SETTING_DEFAULTS["lifecycle.emailsEnabled"]),
    exemptSlugs: [...PLATFORM_SETTING_DEFAULTS["lifecycle.exemptSlugs"]],
    trialDefaultDays: Number(PLATFORM_SETTING_DEFAULTS["trial.defaultDays"]),
    trialGraceDays: Number(PLATFORM_SETTING_DEFAULTS["trial.graceDays"]),
    trialReminderDays: [...PLATFORM_SETTING_DEFAULTS["trial.reminderDays"]],
    pastDueGraceDays: Number(PLATFORM_SETTING_DEFAULTS["pastDue.graceDays"]),
    suspendedMarcacionGraceDays: Number(PLATFORM_SETTING_DEFAULTS["suspended.marcacionGraceDays"]),
    signupDefaultPlan: String(PLATFORM_SETTING_DEFAULTS["signup.defaultPlan"]),
  };
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function main() {
  const now = new Date();
  const settings = lifecycleSettingsFromDefaults();
  const graceDays = settings.trialGraceDays;

  console.log(`Modo: ${DRY_RUN ? "DRY-RUN (no escribe)" : "APPLY"}`);
  console.log(`now: ${now.toISOString()}`);
  console.log(`trial.graceDays: ${graceDays}`);
  console.log(`lifecycle.enabled default: ${settings.enabled}`);
  console.log(`exemptSlugs: ${settings.exemptSlugs.join(", ")}`);

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      suspendedAt: true,
      suspendedReason: true,
      plan: {
        select: {
          id: true,
          plan: true,
          billingStatus: true,
          trialEndsAt: true,
          graceEndsAt: true,
          statusChangedAt: true,
          statusReason: true,
          customBaseMinimum: true,
        },
      },
    },
    orderBy: { slug: "asc" },
  });

  const rows: MigrationTenantInput[] = tenants.map((t) => ({
    id: t.id,
    slug: t.slug,
    active: t.active,
    suspendedAt: t.suspendedAt,
    suspendedReason: t.suspendedReason,
    plan: t.plan
      ? {
          id: t.plan.id,
          plan: t.plan.plan,
          billingStatus: t.plan.billingStatus,
          trialEndsAt: t.plan.trialEndsAt,
          graceEndsAt: t.plan.graceEndsAt,
          statusChangedAt: t.plan.statusChangedAt,
          statusReason: t.plan.statusReason,
          customBaseMinimum:
            t.plan.customBaseMinimum == null ? null : t.plan.customBaseMinimum.toString(),
        }
      : null,
  }));

  const intents: BillingMigrationIntent[] = rows.map((t) =>
    computeBillingMigration(t, now, graceDays),
  );

  line("TENANTS — billingStatus");
  console.log(
    "slug".padEnd(24) +
      "plan".padEnd(16) +
      "from".padEnd(16) +
      "to".padEnd(16) +
      "kind".padEnd(14) +
      "notes",
  );
  for (const t of tenants) {
    const intent = intents.find((i) => i.tenantId === t.id)!;
    const from = t.plan?.billingStatus ?? "(sin plan)";
    console.log(
      t.slug.padEnd(24) +
        (t.plan?.plan ?? "—").padEnd(16) +
        from.padEnd(16) +
        intent.billingStatus.padEnd(16) +
        intent.kind.padEnd(14) +
        intent.notes.join("; "),
    );
  }

  const freeCount = tenants.filter((t) => (t.plan?.plan ?? "").toLowerCase() === "free").length;
  const missingPlan = intents.filter((i) => i.kind === "create_plan");
  const trialExpired = intents.filter((i) => i.billingStatus === "trial_expired");
  const enterpriseIncomplete = tenants.filter((t) => {
    const intent = intents.find((i) => i.tenantId === t.id);
    const persistedActive = intent?.billingStatus === "active" || intent?.billingStatus === "past_due";
    return (
      persistedActive &&
      isEnterpriseIncomplete(
        t.plan?.plan,
        t.plan?.customBaseMinimum == null ? null : t.plan.customBaseMinimum.toString(),
      )
    );
  });

  console.log(`\nTenants totales: ${tenants.length}`);
  console.log(`Sin TenantPlan (se crea free): ${missingPlan.length}`);
  console.log(`Quedan con plan slug 'free' (decisión manual): ${freeCount + missingPlan.length}`);
  console.log(`Pasan / quedan trial_expired: ${trialExpired.length}`);
  console.log(`Enterprise active sin customBaseMinimum: ${enterpriseIncomplete.length}`);
  for (const t of enterpriseIncomplete) {
    console.log(`  - ${t.slug} (${t.name}) billing=${t.plan?.billingStatus} active=${t.active}`);
  }

  line("STOP CHECK — Gard");
  const gard = tenants.find((t) => t.slug === "gard");
  if (!gard) {
    console.error("STOP: tenant slug=gard no encontrado.");
    process.exitCode = 1;
    return;
  }
  const gardIntent = intents.find((i) => i.slug === "gard")!;
  const gardSnapshot = {
    tenantId: gard.id,
    slug: gard.slug,
    active: gard.active,
    suspendedAt: gard.suspendedAt,
    plan: {
      billingStatus: gardIntent.billingStatus,
      trialEndsAt: gardIntent.trialEndsAt,
      graceEndsAt: gardIntent.graceEndsAt,
      statusChangedAt: gardIntent.statusChangedAt,
    },
  };

  const accessEnabled = deriveTenantAccess(gardSnapshot, now, { ...settings, enabled: true });
  const accessDisabled = deriveTenantAccess(gardSnapshot, now, { ...settings, enabled: false });
  console.log(
    `Gard persistido: active=${gard.active} plan=${gard.plan?.plan} billing=${gard.plan?.billingStatus} → ${gardIntent.billingStatus}`,
  );
  console.log(
    `access lifecycle.enabled=true:  mode=${accessEnabled.mode} state=${accessEnabled.state} exempt=${accessEnabled.exempt}`,
  );
  console.log(
    `access lifecycle.enabled=false: mode=${accessDisabled.mode} state=${accessDisabled.state}`,
  );

  const blocked =
    accessEnabled.mode === "blocked" ||
    accessEnabled.mode === "read_only" ||
    accessDisabled.mode === "blocked" ||
    accessDisabled.mode === "read_only";
  if (blocked) {
    console.error("STOP: Gard quedaría blocked o read_only. Abortando.");
    process.exitCode = 1;
    return;
  }
  console.log("OK: Gard permanece full.");

  line("CATÁLOGO (sin tocar TenantAddon.enabled)");
  const [plans, addons, packs] = await Promise.all([
    prisma.planCatalog.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.addonCatalog.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.packCatalog.findMany({ orderBy: { slug: "asc" } }),
  ]);

  const profesional = plans.find((p) => p.slug === "profesional");
  const profesionalModules = new Set(profesional?.includedModules ?? []);
  console.log(
    `Plan profesional includedModules (${profesionalModules.size}): ${[...profesionalModules].join(", ") || "(no encontrado)"}`,
  );

  const planChanges: { slug: string; action: string }[] = [];
  for (const p of plans) {
    if (p.slug === "free" && p.active) {
      planChanges.push({ slug: p.slug, action: "active=false" });
    }
    if (p.slug === "enterprise") {
      const needsHeadline = p.headline !== "Precio negociado";
      const needsZero = Number(p.pricePerGuard) !== 0 || Number(p.baseMinimum) !== 0;
      if (needsHeadline || needsZero) {
        planChanges.push({
          slug: p.slug,
          action: "headline=Precio negociado, pricePerGuard=0, baseMinimum=0",
        });
      }
    }
  }
  console.log("Planes a actualizar:");
  if (planChanges.length === 0) console.log("  (sin cambios)");
  for (const c of planChanges) console.log(`  - ${c.slug}: ${c.action}`);

  const addonsDeactivate = addons.filter((a) => a.active && shouldDeactivateAddon(a.moduleKey, profesionalModules));
  const addonsKeep = addons.filter((a) => !shouldDeactivateAddon(a.moduleKey, profesionalModules));
  const addonsAlreadyOff = addons.filter((a) => !a.active);

  console.log("\nAdd-ons que se DESACTIVAN (catálogo; tenants no cambian):");
  if (addonsDeactivate.length === 0) console.log("  (ninguno)");
  for (const a of addonsDeactivate) {
    console.log(`  - ${a.slug} moduleKey=${a.moduleKey ?? "null"}`);
  }
  console.log("\nAdd-ons que QUEDAN activos (opcionales sobre Profesional):");
  for (const a of addonsKeep) {
    console.log(`  - ${a.slug} moduleKey=${a.moduleKey ?? "null"} active=${a.active}`);
  }
  const unexpectedKeep = addonsKeep.filter(
    (a) => a.moduleKey && !KEEP_ADDON_KEYS_HELP.includes(a.moduleKey),
  );
  if (unexpectedKeep.length) {
    console.log("ADVERTENCIA: add-ons activos fuera de la lista acordada:");
    for (const a of unexpectedKeep) console.log(`  - ${a.slug} moduleKey=${a.moduleKey}`);
  }
  if (addonsAlreadyOff.length) {
    console.log(`Add-ons ya inactivos: ${addonsAlreadyOff.map((a) => a.slug).join(", ")}`);
  }

  const packsDeactivate = packs.filter((p) => p.active);
  console.log("\nPacks a desactivar (todos):");
  for (const p of packs) {
    console.log(`  - ${p.slug} active=${p.active} → false`);
  }

  line("PlatformSetting defaults (no sobrescribe keys existentes)");
  const existingSettings = await prisma.platformSetting.findMany({ select: { key: true } });
  const existingKeys = new Set(existingSettings.map((s) => s.key));
  const settingsToInsert = Object.entries(PLATFORM_SETTING_DEFAULTS).filter(([key]) => !existingKeys.has(key));
  for (const [key, value] of Object.entries(PLATFORM_SETTING_DEFAULTS)) {
    console.log(`  ${key} = ${JSON.stringify(value)} ${existingKeys.has(key) ? "(ya existe, skip)" : "(insertar)"}`);
  }

  line("Marketing / pricing — pendiente F4");
  console.log("API /api/marketing/catalog ya filtra PlanCatalog/AddonCatalog/PackCatalog active=true.");
  console.log("Copy hardcodeado de Gratis/packs (NO tocado en este PR, addendum A/F4):");
  console.log("  - src/app/(marketing)/planes/page.tsx");
  console.log("  - src/app/(marketing)/registrarse/page.tsx");
  console.log("  - src/app/(marketing)/page.tsx");
  console.log("  - src/app/platform/pricing/page.tsx (tab Packs; el catálogo inactivo se oculta al reactivar filtro en UI F4)");

  if (DRY_RUN) {
    line("DRY-RUN completo — no se escribió nada");
    console.log("Para aplicar (solo con OK explícito, nunca prod sin instrucción):");
    console.log("  npx tsx scripts/migrate-platform-lifecycle.ts --apply");
    return;
  }

  line("APPLY");
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of settingsToInsert) {
      await tx.platformSetting.create({
        data: { key, value: jsonValue(value), updatedBy: "system:lifecycle-migrate" },
      });
    }

    for (const p of plans) {
      if (p.slug === "free" && p.active) {
        await tx.planCatalog.update({ where: { id: p.id }, data: { active: false } });
      }
      if (p.slug === "enterprise") {
        await tx.planCatalog.update({
          where: { id: p.id },
          data: {
            headline: "Precio negociado",
            pricePerGuard: 0,
            baseMinimum: 0,
          },
        });
      }
    }

    for (const a of addonsDeactivate) {
      await tx.addonCatalog.update({ where: { id: a.id }, data: { active: false } });
    }
    for (const p of packsDeactivate) {
      await tx.packCatalog.update({ where: { id: p.id }, data: { active: false } });
    }

    for (const intent of intents) {
      if (intent.kind === "noop") {
        await tx.platformAuditLog.create({
          data: {
            actorType: "system",
            actorEmail: "system:lifecycle-migrate",
            action: "lifecycle.migrated",
            tenantId: intent.tenantId,
            targetType: "TenantPlan",
            after: { billingStatus: intent.billingStatus, kind: "noop" },
          },
        });
        continue;
      }

      if (intent.kind === "create_plan") {
        const created = await tx.tenantPlan.create({
          data: {
            tenantId: intent.tenantId,
            plan: intent.createPlanSlug ?? "free",
            billingStatus: intent.billingStatus,
            trialEndsAt: intent.trialEndsAt,
            graceEndsAt: intent.graceEndsAt,
            statusChangedAt: intent.statusChangedAt,
            statusReason: intent.statusReason,
          },
        });
        await tx.platformAuditLog.create({
          data: {
            actorType: "system",
            actorEmail: "system:lifecycle-migrate",
            action: "lifecycle.migrated",
            tenantId: intent.tenantId,
            targetType: "TenantPlan",
            targetId: created.id,
            before: { plan: null },
            after: {
              billingStatus: intent.billingStatus,
              plan: intent.createPlanSlug,
              kind: "create_plan",
            },
          },
        });
        continue;
      }

      const current = tenants.find((t) => t.id === intent.tenantId)?.plan;
      await tx.tenantPlan.update({
        where: { tenantId: intent.tenantId },
        data: {
          billingStatus: intent.billingStatus,
          trialEndsAt: intent.trialEndsAt,
          graceEndsAt: intent.graceEndsAt,
          statusChangedAt: intent.statusChangedAt,
          statusReason: intent.statusReason,
        },
      });
      await tx.platformAuditLog.create({
        data: {
          actorType: "system",
          actorEmail: "system:lifecycle-migrate",
          action: "lifecycle.migrated",
          tenantId: intent.tenantId,
          targetType: "TenantPlan",
          targetId: current?.id,
          before: {
            billingStatus: current?.billingStatus ?? null,
            trialEndsAt: current?.trialEndsAt?.toISOString() ?? null,
            graceEndsAt: current?.graceEndsAt?.toISOString() ?? null,
          },
          after: {
            billingStatus: intent.billingStatus,
            trialEndsAt: intent.trialEndsAt?.toISOString() ?? null,
            graceEndsAt: intent.graceEndsAt?.toISOString() ?? null,
            notes: intent.notes,
          },
        },
      });
    }
  });

  console.log("APPLY completado.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
