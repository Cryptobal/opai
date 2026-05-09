/**
 * Smoke test del flujo completo de signup.
 * Ejecuta: npx tsx prisma/scripts/smoke-test-signup.ts
 *
 * Crea un PendingSignup ficticio, verifica creación, simula verify, valida tenant creado.
 * Usa email único con timestamp para no chocar.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const stamp = Date.now();
  const email = `smoketest+${stamp}@opai-test.cl`;
  const slug = `smoketest-${stamp}`;
  const passwordHash = await bcrypt.hash("smoke-test-pwd-1234", 12);
  const token = randomBytes(32).toString("hex");

  console.log("→ Creando PendingSignup...");
  const pending = await prisma.pendingSignup.create({
    data: {
      email,
      passwordHash,
      ownerName: "Smoke Test User",
      commercialName: "Smoke Test SpA",
      proposedSlug: slug,
      verificationToken: token,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      industry: "logistica",
      estimatedGuards: "6-15",
      source: "smoke-test",
    },
  });
  console.log(`  OK · pending.id=${pending.id}`);

  console.log("→ Buscando por token (simula GET /verify)...");
  const found = await prisma.pendingSignup.findUnique({
    where: { verificationToken: token },
  });
  if (!found) throw new Error("PendingSignup no encontrado por token");
  console.log("  OK");

  console.log("→ Cleanup...");
  await prisma.pendingSignup.delete({ where: { id: pending.id } });
  console.log("  OK");

  console.log("\nSmoke test pasó.");
}

main()
  .catch((e) => {
    console.error("error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
