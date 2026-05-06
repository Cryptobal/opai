#!/usr/bin/env tsx
/**
 * Extract tenant DTE certificate from Opai DB to a local .pfx file.
 *
 * USO LOCAL ÚNICAMENTE. El .pfx generado contiene la firma digital de
 * la empresa — NO commitear, NO compartir, NO subir a la nube.
 * Eliminar después de usar (`rm ./tmp/<archivo>.pfx`).
 *
 * Carga `.env.local` al inicio para tener disponible `DTE_ENCRYPTION_KEY`
 * (necesario para descifrar el PFX y la contraseña). Mismo pattern que
 * el resto de scripts standalone del repo (ver scripts/seed-bne-gard.ts).
 *
 * Uso:
 *   npx tsx scripts/factoring/extract-cert.ts --tenant-slug gard
 *   npx tsx scripts/factoring/extract-cert.ts --tenant-id <uuid>
 *   npx tsx scripts/factoring/extract-cert.ts --tenant-slug gard --out ./tmp/foo.pfx
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      "tenant-slug": { type: "string", default: "" },
      "tenant-id": { type: "string", default: "" },
      out: { type: "string", default: "./tmp/gard-cert.pfx" },
    },
    strict: true,
    allowPositionals: false,
  });

  const slug = String(values["tenant-slug"] ?? "");
  const explicitTenantId = String(values["tenant-id"] ?? "");

  if (!slug && !explicitTenantId) {
    console.error("❌ Falta --tenant-slug o --tenant-id");
    process.exit(1);
  }

  // Imports tardíos para evitar inicializar Prisma si los args están mal.
  const { prisma } = await import("@/lib/prisma");
  const { decryptBuffer, decryptString } = await import("@/lib/dte-encryption");

  let tenantId = explicitTenantId;
  if (!tenantId && slug) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      console.error(`❌ Tenant con slug "${slug}" no encontrado`);
      await prisma.$disconnect();
      process.exit(1);
    }
    tenantId = tenant.id;
    console.log(`✅ Tenant: ${tenant.name} (${tenant.slug})`);
  }

  const cert = await prisma.tenantDteCertificate.findUnique({
    where: { tenantId },
  });
  if (!cert) {
    console.error(`❌ Tenant ${tenantId} sin TenantDteCertificate cargado`);
    await prisma.$disconnect();
    process.exit(1);
  }

  let pfxBuffer: Buffer;
  let password: string;
  try {
    pfxBuffer = decryptBuffer(Buffer.from(cert.pfxDataEnc));
    password = decryptString(cert.passwordEnc);
  } catch (err) {
    console.error("❌ Error descifrando el cert. Posibles causas:");
    console.error("   - DTE_ENCRYPTION_KEY no está en .env.local");
    console.error("   - DTE_ENCRYPTION_KEY no coincide con la usada al cifrar");
    console.error(`   Detalle: ${(err as Error).message}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const outPath = String(values.out ?? "./tmp/gard-cert.pfx");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, new Uint8Array(pfxBuffer));

  console.log("");
  console.log("═".repeat(60));
  console.log("✅ Cert extraído correctamente");
  console.log("═".repeat(60));
  console.log(`   Archivo: ${outPath} (${pfxBuffer.length} bytes)`);
  console.log(`   RUT titular: ${cert.rutTitular}`);
  if (cert.nombreTitular) console.log(`   Nombre titular: ${cert.nombreTitular}`);
  console.log(`   Vence: ${cert.notAfter.toISOString().split("T")[0]}`);
  console.log(`   Contraseña: ${password}`);
  console.log("");
  console.log("⚠️  SEGURIDAD:");
  console.log("   - El .pfx contiene la firma digital de la empresa.");
  console.log("   - NO commitear, NO compartir, NO subir a la nube.");
  console.log(`   - Eliminar después de usar:  rm ${outPath}`);
  console.log("");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
