/**
 * Asigna roles de PlatformAdmin: Carlos → owner; el resto → admin.
 *
 *   npx tsx scripts/migrate-platform-roles.ts --dry-run
 *   npx tsx scripts/migrate-platform-roles.ts
 *
 * Email owner: OWNER_EMAIL (obligatorio). Ejemplo en el brief F2.
 *   OWNER_EMAIL=... npx tsx scripts/migrate-platform-roles.ts --dry-run
 *   OWNER_EMAIL=... npx tsx scripts/migrate-platform-roles.ts
 *
 * Idempotente. No asigna `support` (queda para asignación manual).
 * Tras aplicarlo, el owner debe volver a iniciar sesión (el rol vive en el JWT).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!OWNER_EMAIL) {
    console.error("Falta OWNER_EMAIL (correo del PlatformAdmin que será owner).");
    process.exitCode = 1;
    return;
  }
  const admins = await prisma.platformAdmin.findMany({
    select: { id: true, email: true, name: true, status: true, role: true },
    orderBy: { email: "asc" },
  });

  if (admins.length === 0) {
    console.error("No hay PlatformAdmin.");
    process.exitCode = 1;
    return;
  }

  const ownerMatches = admins.filter((a) => a.email.toLowerCase() === OWNER_EMAIL);
  if (ownerMatches.length === 0) {
    console.warn(`⚠ Ningún PlatformAdmin con email ${OWNER_EMAIL}. Nadie pasará a owner.`);
  }

  console.log(DRY_RUN ? "=== DRY-RUN (no se escribe) ===\n" : "=== APPLY ===\n");
  console.log("| email | name | status | role actual | role destino |");
  console.log("|-------|------|--------|-------------|--------------|");

  const updates: { id: string; email: string; from: string; to: "owner" | "admin" }[] = [];

  for (const admin of admins) {
    const next: "owner" | "admin" =
      admin.email.toLowerCase() === OWNER_EMAIL ? "owner" : "admin";
    const current = admin.role || "admin";
    console.log(
      `| ${admin.email} | ${admin.name} | ${admin.status} | ${current} | ${next} |`,
    );
    if (current !== next) {
      updates.push({ id: admin.id, email: admin.email, from: current, to: next });
    }
  }

  if (updates.length === 0) {
    console.log("\nNada que cambiar.");
    return;
  }

  console.log(`\n${updates.length} fila(s) a actualizar.`);
  if (DRY_RUN) {
    console.log("Re-ejecuta sin --dry-run para aplicar.");
    return;
  }

  for (const u of updates) {
    await prisma.platformAdmin.update({
      where: { id: u.id },
      data: { role: u.to },
    });
    console.log(`  ✔ ${u.email}: ${u.from} → ${u.to}`);
  }
  console.log("\nListo. Los admins deben re-login para refrescar el JWT.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
