/**
 * Seed BNE integration for GARD Security tenant.
 *
 * Idempotent: re-running updates the row in place. Use this once after the
 * migration is applied to load production credentials. Test ones can be
 * loaded by passing --env=test.
 *
 * Usage:
 *   pnpm tsx scripts/seed-bne-gard.ts            # writes PROD credentials
 *   pnpm tsx scripts/seed-bne-gard.ts --env=test # writes TEST credentials
 *   pnpm tsx scripts/seed-bne-gard.ts --discover # also calls /empresas?rut=...
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv(); // .env fallback

import { PrismaClient } from "@prisma/client";
import {
  encryptBneSecret,
  testBneConnection,
  discoverEmpleador,
} from "../src/lib/ats/bne.service";

const prisma = new PrismaClient();

const GARD_TENANT_ID = "clgard00000000000000001";
const GARD_RUT = "778406233"; // 77.840.623-3 sin puntos ni guion

// Credentials are NEVER hardcoded. Provide them via env vars when running:
//   BNE_GARD_PROD_KEY=... BNE_GARD_PROD_SECRET=... pnpm tsx scripts/seed-bne-gard.ts
//   BNE_GARD_TEST_KEY=... BNE_GARD_TEST_SECRET=... pnpm tsx scripts/seed-bne-gard.ts --env=test
const PROD_KEY = process.env.BNE_GARD_PROD_KEY || "";
const PROD_SECRET = process.env.BNE_GARD_PROD_SECRET || "";
const TEST_KEY = process.env.BNE_GARD_TEST_KEY || "";
const TEST_SECRET = process.env.BNE_GARD_TEST_SECRET || "";

async function main() {
  const args = process.argv.slice(2);
  const env = args.includes("--env=test") ? "test" : "prod";
  const discover = args.includes("--discover");

  const tenant = await prisma.tenant.findUnique({
    where: { id: GARD_TENANT_ID },
    select: { id: true, slug: true, name: true },
  });
  if (!tenant) {
    throw new Error(
      `GARD tenant ${GARD_TENANT_ID} no existe. Verifica la migración 20260205181108_backfill_tenant_gard.`,
    );
  }
  console.log(`✓ Tenant: ${tenant.name} (${tenant.slug})`);

  const consumerKey = env === "prod" ? PROD_KEY : TEST_KEY;
  const consumerSecret = env === "prod" ? PROD_SECRET : TEST_SECRET;
  if (!consumerKey || !consumerSecret) {
    throw new Error(
      `Faltan credenciales para ambiente ${env}. Define BNE_GARD_${env.toUpperCase()}_KEY y BNE_GARD_${env.toUpperCase()}_SECRET en tu shell o .env.local antes de correr este script.`,
    );
  }

  const data = {
    consumerKey,
    consumerSecretEncrypted: encryptBneSecret(consumerSecret),
    environment: env,
    rutEmpleador: GARD_RUT,
    mostrarNombreEmpresa: true,
    defaultDiasPublicacion: 30,
    status: "pending" as const,
    accessToken: null,
    tokenExpiresAt: null,
  };

  await prisma.bneIntegration.upsert({
    where: { tenantId: GARD_TENANT_ID },
    create: { tenantId: GARD_TENANT_ID, ...data },
    update: data,
  });
  console.log(`✓ Credenciales BNE (${env}) guardadas para GARD`);

  console.log("→ Probando conexión OAuth2 contra BNE...");
  const test = await testBneConnection(GARD_TENANT_ID);
  if (!test.ok) {
    console.error(`✗ Falló el token: ${test.error}`);
    process.exit(1);
  }
  console.log("✓ Token BNE obtenido correctamente");

  if (discover) {
    console.log("→ Descubriendo idEmpleador via GET /empresas?rut=...");
    try {
      const found = await discoverEmpleador(GARD_TENANT_ID, GARD_RUT);
      if (found.idEmpleador) {
        await prisma.bneIntegration.update({
          where: { tenantId: GARD_TENANT_ID },
          data: {
            idEmpleador: found.idEmpleador,
            idUsuarioPublicador: found.idUsuario ?? undefined,
          },
        });
        console.log(
          `✓ idEmpleador=${found.idEmpleador} idUsuario=${found.idUsuario ?? "—"}`,
        );
      } else {
        console.warn(
          "⚠ BNE no devolvió idEmpleador para este RUT. Verifica que GARD esté registrado en BNE en el ambiente seleccionado.",
        );
      }
    } catch (err) {
      console.warn(
        `⚠ Discovery falló: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log("\nListo. Pasa a /opai/configuracion/ats → tab Canales → BNE.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
