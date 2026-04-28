/**
 * Migra los documentos legacy `crm.protocol_documents` con `scope=global`
 * al nuevo sistema `ops.docs_operacionales` (capa global) usando el tipo
 * `protocolo_emergencias` como destino.
 *
 * - Idempotente: detecta documentos ya migrados por (tenantId, capa,
 *   tipoId, fileName).
 * - NO BORRA los registros legacy. La eliminación se hace en una segunda
 *   pasada futura, una vez todos los tenants estén migrados.
 *
 * Ejecución: `npx tsx scripts/migrate-legacy-protocol-docs.ts`
 */

import { prisma } from "@/lib/prisma";

async function main() {
  const legacy = await prisma.protocolDocument.findMany({
    where: { scope: "global" },
  });

  console.log(`Encontrados ${legacy.length} documentos legacy con scope=global`);

  let migrated = 0;
  let skipped = 0;

  for (const doc of legacy) {
    const tipo = await prisma.tipoDocOperacional.findFirst({
      where: {
        tenantId: doc.tenantId,
        codigo: "protocolo_emergencias",
        capa: "global",
      },
    });
    if (!tipo) {
      console.log(
        `Skip ${doc.id}: tenant ${doc.tenantId} no tiene tipo protocolo_emergencias seedado todavía`,
      );
      skipped += 1;
      continue;
    }

    const exists = await prisma.docOperacional.findFirst({
      where: {
        tenantId: doc.tenantId,
        capa: "global",
        tipoId: tipo.id,
        fileName: doc.fileName,
      },
    });
    if (exists) {
      console.log(`Skip ${doc.id}: ya migrado como ${exists.id}`);
      skipped += 1;
      continue;
    }

    await prisma.docOperacional.create({
      data: {
        tenantId: doc.tenantId,
        tipoId: tipo.id,
        capa: "global",
        installationId: null,
        fileName: doc.fileName,
        fileUrl: doc.fileUrl,
        storageKey: doc.storageKey ?? `migrated/${doc.id}`,
        fileSize: doc.fileSize,
        mimeType: "application/pdf",
        status: "vigente",
        portalClienteVisible: true,
        notes: `[migrado desde protocol_documents id=${doc.id}]`,
      },
    });
    console.log(`Migrado ${doc.id} → DocOperacional`);
    migrated += 1;
  }

  console.log(`\nResumen: ${migrated} migrados, ${skipped} omitidos.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
