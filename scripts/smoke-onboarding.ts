/**
 * Smoke test del onboarding del cliente.
 *
 * Uso: pnpm tsx scripts/smoke-onboarding.ts [tenantId]
 *
 * Verifica que:
 *  - Existen los 6 OpsTicketType del onboarding para el tenant.
 *  - Existe un OnboardingPlaybook default con 6 steps.
 *
 * Si pasas un tenantId, lo usa directamente; si no, busca el tenant con slug
 * 'gard'. Sin DATABASE_URL en el entorno, falla con mensaje claro.
 */

import { prisma } from "@/lib/prisma";
import { ONBOARDING_TICKET_TYPES } from "@/lib/onboarding/types";

async function main() {
  const argTenantId = process.argv[2];
  let tenantId: string;

  if (argTenantId) {
    tenantId = argTenantId;
  } else {
    const t = await prisma.tenant.findFirst({
      where: { slug: "gard" },
      select: { id: true, slug: true },
    });
    if (!t) {
      console.error("[smoke] No se encontró tenant 'gard'. Pasa un tenantId como argumento.");
      process.exit(1);
    }
    tenantId = t.id;
    console.info(`[smoke] Usando tenant '${t.slug}' (${tenantId})`);
  }

  let okCount = 0;
  let missCount = 0;
  for (const tt of ONBOARDING_TICKET_TYPES) {
    const existing = await prisma.opsTicketType.findUnique({
      where: { tenantId_slug: { tenantId, slug: tt.slug } },
      select: { id: true, name: true },
    });
    if (existing) {
      console.info(`  ✅ OpsTicketType ${tt.slug}`);
      okCount++;
    } else {
      console.warn(`  ❌ OpsTicketType ${tt.slug} faltante`);
      missCount++;
    }
  }

  const playbook = await prisma.onboardingPlaybook.findFirst({
    where: { tenantId, isDefault: true, isActive: true },
    include: { steps: true },
  });
  if (!playbook) {
    console.warn("  ❌ Sin OnboardingPlaybook default activo");
    missCount++;
  } else {
    console.info(
      `  ✅ Playbook '${playbook.name}' v${playbook.version} con ${playbook.steps.length} steps`,
    );
    if (playbook.steps.length !== 6) {
      console.warn(`     ⚠ Se esperaban 6 steps, hay ${playbook.steps.length}`);
    }
  }

  console.info(`\n[smoke] Resumen: ${okCount} OK · ${missCount} faltantes`);
  if (missCount > 0) {
    console.info("[smoke] Sugerencia: POST /api/onboarding/playbooks/seed-default");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("[smoke] Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
