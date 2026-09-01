/**
 * Repara TipoDocumento codigo="undefined" (capa guardia) creado por PATCH
 * unificado que enviaba `type: undefined`.
 *
 * Idempotente. DRY-RUN por defecto — pasar `--apply` para escribir.
 *
 * Uso:
 *   npx tsx scripts/docs/repair-tipo-undefined.ts --tenant <id>
 *   npx tsx scripts/docs/repair-tipo-undefined.ts --tenant <id> --apply
 *   npx tsx scripts/docs/repair-tipo-undefined.ts --tenant <id> --merge-custom-duplicates --apply
 */
import { prisma } from "../../src/lib/prisma";
import { ensureTipoForLegacyType } from "../../src/lib/docs/ensure-tipo";
import {
  resolveLegacyType,
  UNCLASSIFIED_GUARDIA_TIPO,
} from "../../src/lib/docs/legacy-type-map";
import { LEGACY_PERSONA } from "../../src/lib/docs/migration/types";

function argValue(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function jsonType(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

function usableType(raw: string | null | undefined): string | null {
  const resolution = resolveLegacyType(raw, false);
  if (!resolution) return null;
  return resolution.codigo;
}

async function inferOriginalType(opts: {
  tenantId: string;
  fileId: string;
  fileName: string;
  createdAt: Date;
  legacySource: string | null;
  legacyId: string | null;
  guardiaId: string | null;
  auditByDocumentId: Map<string, string>;
}): Promise<{ type: string; source: string; unclassified: boolean }> {
  if (opts.legacySource === LEGACY_PERSONA && opts.legacyId) {
    const legacy = await prisma.opsDocumentoPersona.findFirst({
      where: { id: opts.legacyId, tenantId: opts.tenantId },
      select: { type: true },
    });
    const fromLegacy = usableType(legacy?.type);
    if (fromLegacy) return { type: fromLegacy, source: "ops_documento_persona", unclassified: false };
  }

  const fromAudit = usableType(opts.auditByDocumentId.get(opts.fileId));
  if (fromAudit) return { type: fromAudit, source: "audit_log", unclassified: false };

  const fromFileName = usableType(opts.fileName);
  if (fromFileName && fromFileName !== UNCLASSIFIED_GUARDIA_TIPO) {
    return { type: fromFileName, source: "fileName", unclassified: false };
  }

  if (opts.guardiaId) {
    const from = new Date(opts.createdAt.getTime() - 10 * 60 * 1000);
    const to = new Date(opts.createdAt.getTime() + 10 * 60 * 1000);
    const history = await prisma.opsGuardiaHistory.findMany({
      where: {
        tenantId: opts.tenantId,
        guardiaId: opts.guardiaId,
        eventType: { in: ["document_uploaded", "document_updated"] },
        createdAt: { gte: from, lte: to },
      },
      select: { previousValue: true, newValue: true, eventType: true },
      orderBy: { createdAt: "desc" },
    });
    for (const event of history) {
      const candidate =
        usableType(jsonType(event.previousValue)) ?? usableType(jsonType(event.newValue));
      if (candidate) return { type: candidate, source: `history:${event.eventType}`, unclassified: false };
    }
  }

  return { type: UNCLASSIFIED_GUARDIA_TIPO, source: "fallback", unclassified: true };
}

async function repairUndefined(tenantId: string, apply: boolean) {
  const tipo = await prisma.tipoDocumento.findUnique({
    where: { tenantId_codigo: { tenantId, codigo: "undefined" } },
    select: { id: true, codigo: true, capa: true, isActive: true },
  });
  if (!tipo || tipo.capa !== "guardia") {
    console.log(`[undefined] no hay TipoDocumento codigo=undefined capa=guardia en tenant ${tenantId}`);
    return { repaired: 0, unclassified: 0, deactivated: false };
  }

  const files = await prisma.documento.findMany({
    where: { tenantId, tipoId: tipo.id },
    select: {
      id: true,
      fileName: true,
      createdAt: true,
      legacySource: true,
      legacyId: true,
      needsAttention: true,
      links: {
        where: { entityType: "guardia", role: "owner" },
        select: { entityId: true },
        take: 1,
      },
    },
  });

  console.log(`[undefined] tipoId=${tipo.id} documentos=${files.length} isActive=${tipo.isActive}`);

  const audits = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: { in: ["personas.guardia.document.created", "personas.guardia.document.updated"] },
    },
    select: { details: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const auditByDocumentId = new Map<string, string>();
  for (const row of audits) {
    const details = row.details as { documentId?: unknown; type?: unknown } | null;
    if (!details || typeof details.documentId !== "string" || typeof details.type !== "string") continue;
    if (!auditByDocumentId.has(details.documentId)) {
      auditByDocumentId.set(details.documentId, details.type);
    }
  }

  let repaired = 0;
  let unclassified = 0;

  for (const file of files) {
    const inferred = await inferOriginalType({
      tenantId,
      fileId: file.id,
      fileName: file.fileName,
      createdAt: file.createdAt,
      legacySource: file.legacySource,
      legacyId: file.legacyId,
      guardiaId: file.links[0]?.entityId ?? null,
      auditByDocumentId,
    });
    console.log(
      `  doc ${file.id} fileName=${JSON.stringify(file.fileName)} → ${inferred.type} (${inferred.source})`
    );
    if (inferred.unclassified) unclassified += 1;
    if (apply) {
      const { tipoId } = await ensureTipoForLegacyType(
        prisma,
        tenantId,
        inferred.type,
        false
      );
      await prisma.documento.update({
        where: { id: file.id },
        data: {
          tipoId,
          needsAttention: inferred.unclassified ? true : file.needsAttention,
          needsClassification: inferred.unclassified,
        },
      });
    }
    repaired += 1;
  }

  let deactivated = false;
  if (apply && tipo.isActive) {
    await prisma.tipoDocumento.update({
      where: { id: tipo.id },
      data: { isActive: false },
    });
    deactivated = true;
    console.log(`[undefined] desactivado TipoDocumento ${tipo.id}`);
  } else if (!tipo.isActive) {
    console.log(`[undefined] ya estaba inactivo`);
  } else {
    console.log(`[undefined] dry-run: se desactivaría TipoDocumento ${tipo.id}`);
  }

  return { repaired, unclassified, deactivated };
}

async function mergeCustomHistorial(tenantId: string, apply: boolean) {
  const custom = await prisma.tipoDocumento.findUnique({
    where: { tenantId_codigo: { tenantId, codigo: "custom_historial_penal" } },
    select: { id: true, isActive: true, capa: true },
  });
  if (!custom) {
    console.log("[merge] no existe custom_historial_penal");
    return { merged: 0 };
  }
  const files = await prisma.documento.findMany({
    where: { tenantId, tipoId: custom.id },
    select: { id: true, fileName: true },
  });
  console.log(`[merge] custom_historial_penal documentos=${files.length}`);
  for (const file of files) {
    console.log(`  doc ${file.id} fileName=${JSON.stringify(file.fileName)} → historial_penal`);
  }
  if (apply) {
    const { tipoId } = await ensureTipoForLegacyType(prisma, tenantId, "historial_penal", true);
    for (const file of files) {
      await prisma.documento.update({
        where: { id: file.id },
        data: { tipoId },
      });
    }
    if (custom.isActive) {
      await prisma.tipoDocumento.update({
        where: { id: custom.id },
        data: { isActive: false },
      });
      console.log("[merge] desactivado custom_historial_penal");
    }
  }
  return { merged: files.length };
}

async function main() {
  const tenantId = argValue("tenant");
  if (!tenantId) {
    console.error("Uso: npx tsx scripts/docs/repair-tipo-undefined.ts --tenant <id> [--apply] [--merge-custom-duplicates]");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");
  const mergeCustom = process.argv.includes("--merge-custom-duplicates");
  console.log(`tenant=${tenantId} apply=${apply} mergeCustom=${mergeCustom}`);

  const undefinedReport = await repairUndefined(tenantId, apply);
  const mergeReport = mergeCustom
    ? await mergeCustomHistorial(tenantId, apply)
    : { merged: 0 };

  console.log(
    JSON.stringify(
      {
        tenantId,
        apply,
        mergeCustom,
        undefinedDocs: undefinedReport.repaired,
        unclassifiedFallback: undefinedReport.unclassified,
        undefinedTipoDeactivated: undefinedReport.deactivated,
        customHistorialMerged: mergeReport.merged,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
