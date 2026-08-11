/**
 * Adaptadores de backfill por fuente documental.
 * Se reemplazan cuando aterrice el modelo documental unificado — mantener
 * aislados aquí, sin lógica compartida con el resto del espejo.
 */

import { extractStorageKeyFromPublicUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";
import { resolveCrmFileTarget } from "./drive-crm-target";
import { DrivePathsV2, safeSegment } from "./drive-tree";
import type { SupportedDocType } from "./drive-mirror-config";

export type BackfillItem = {
  sourceType: string;
  sourceId: string;
  r2Key: string;
  fileName: string;
  targetPath: string;
  mimeType?: string | null;
};

export type BackfillListResult = {
  items: BackfillItem[];
  nextCursor?: string;
  skipped: number;
};

export type BackfillSource = {
  docType: SupportedDocType;
  listPending(
    tenantId: string,
    limit: number,
    cursor?: string,
  ): Promise<BackfillListResult>;
};

const CRM_ENTITY_FOR_DOC: Partial<
  Record<SupportedDocType, "account" | "installation" | "contact" | "lead">
> = {
  personas: "contact",
  leads: "lead",
};

async function listCrmEntityLinks(
  tenantId: string,
  entityType: string,
  limit: number,
  cursor?: string,
  dealLicitacion?: boolean,
): Promise<BackfillListResult> {
  let rows: Array<{
    id: string;
    entityType: string;
    entityId: string;
    file: {
      id: string;
      storageKey: string | null;
      fileName: string;
      mimeType: string;
    };
  }>;

  if (dealLicitacion !== undefined) {
    const cursorClause = cursor ?? "";
    rows = cursor
      ? await prisma.$queryRaw`
          SELECT fl.id, fl.entity_type AS "entityType", fl.entity_id AS "entityId",
                 json_build_object(
                   'id', f.id, 'storageKey', f.storage_key,
                   'fileName', f.file_name, 'mimeType', f.mime_type
                 ) AS file
          FROM crm.file_links fl
          INNER JOIN crm.files f ON f.id = fl.file_id AND f.storage_key IS NOT NULL
          INNER JOIN crm.deals d ON d.id::text = fl.entity_id AND d.tenant_id = fl.tenant_id
          WHERE fl.tenant_id = ${tenantId}
            AND fl.entity_type = 'deal'
            AND d.is_licitacion = ${dealLicitacion}
            AND fl.id > ${cursorClause}
          ORDER BY fl.id ASC
          LIMIT ${limit + 1}
        `
      : await prisma.$queryRaw`
          SELECT fl.id, fl.entity_type AS "entityType", fl.entity_id AS "entityId",
                 json_build_object(
                   'id', f.id, 'storageKey', f.storage_key,
                   'fileName', f.file_name, 'mimeType', f.mime_type
                 ) AS file
          FROM crm.file_links fl
          INNER JOIN crm.files f ON f.id = fl.file_id AND f.storage_key IS NOT NULL
          INNER JOIN crm.deals d ON d.id::text = fl.entity_id AND d.tenant_id = fl.tenant_id
          WHERE fl.tenant_id = ${tenantId}
            AND fl.entity_type = 'deal'
            AND d.is_licitacion = ${dealLicitacion}
          ORDER BY fl.id ASC
          LIMIT ${limit + 1}
        `;
  } else if (entityType === "documentos") {
    rows = await prisma.documentoEnlace.findMany({
      where: {
        tenantId,
        entityType: { in: ["account", "installation"] },
        ...(cursor ? { id: { gt: cursor } } : {}),
        file: { storageKey: { not: null } },
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        file: {
          select: { id: true, storageKey: true, fileName: true, mimeType: true },
        },
      },
    });
  } else {
    rows = await prisma.documentoEnlace.findMany({
      where: {
        tenantId,
        entityType,
        ...(cursor ? { id: { gt: cursor } } : {}),
        file: { storageKey: { not: null } },
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        file: {
          select: { id: true, storageKey: true, fileName: true, mimeType: true },
        },
      },
    });
  }

  const hasMore = rows.length > limit;
  const batch = hasMore ? rows.slice(0, limit) : rows;
  const items: BackfillItem[] = [];
  let skipped = 0;

  for (const link of batch) {
    const file = link.file;
    if (!file?.storageKey) {
      skipped += 1;
      continue;
    }
    const target = await resolveCrmFileTarget(
      tenantId,
      link.entityType,
      link.entityId,
    );
    if (!target) {
      skipped += 1;
      continue;
    }
    items.push({
      sourceType: `crm_file_${link.entityType}`,
      sourceId: file.id,
      r2Key: file.storageKey,
      fileName: file.fileName,
      mimeType: file.mimeType,
      targetPath: target.path,
    });
  }

  return {
    items,
    skipped,
    nextCursor: hasMore ? batch[batch.length - 1]?.id : undefined,
  };
}

function crmSource(
  docType: SupportedDocType,
  opts: { entityType?: string; dealLicitacion?: boolean },
): BackfillSource {
  return {
    docType,
    listPending: (tenantId, limit, cursor) =>
      listCrmEntityLinks(
        tenantId,
        opts.entityType ?? CRM_ENTITY_FOR_DOC[docType] ?? docType,
        limit,
        cursor,
        opts.dealLicitacion,
      ),
  };
}

const facturaSource: BackfillSource = {
  docType: "factura",
  async listPending(tenantId, limit, cursor) {
    const rows = await prisma.financeDte.findMany({
      where: {
        tenantId,
        pdfR2Key: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: { id: true, pdfR2Key: true, code: true, receiverName: true },
    });
    const hasMore = rows.length > limit;
    const batch = hasMore ? rows.slice(0, limit) : rows;
    const items: BackfillItem[] = [];
    let skipped = 0;
    for (const dte of batch) {
      if (!dte.pdfR2Key) {
        skipped += 1;
        continue;
      }
      items.push({
        sourceType: "finance_dte",
        sourceId: dte.id,
        r2Key: dte.pdfR2Key,
        fileName: `${dte.code || dte.id}.pdf`,
        targetPath: DrivePathsV2.installationInvoices(
          safeSegment(dte.receiverName, "Sin-cuenta"),
          "General",
        ),
      });
    }
    return {
      items,
      skipped,
      nextCursor: hasMore ? batch[batch.length - 1]?.id : undefined,
    };
  },
};

const trabajadoresSource: BackfillSource = {
  docType: "trabajadores",
  async listPending(tenantId, limit, cursor) {
    if (await readsUnified(tenantId)) {
      return listUnifiedGuardiaDocs(tenantId, limit, cursor);
    }
    const rows = await prisma.opsDocumentoPersona.findMany({
      where: {
        tenantId,
        fileUrl: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: {
        id: true,
        guardiaId: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        guardia: {
          select: {
            persona: { select: { rut: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    const hasMore = rows.length > limit;
    const batch = hasMore ? rows.slice(0, limit) : rows;
    const items: BackfillItem[] = [];
    let skipped = 0;
    for (const doc of batch) {
      const r2Key = doc.fileUrl
        ? extractStorageKeyFromPublicUrl(doc.fileUrl)
        : null;
      if (!r2Key) {
        skipped += 1;
        continue;
      }
      const rut = doc.guardia?.persona?.rut?.trim() || "SIN-RUT";
      const nombre =
        `${doc.guardia?.persona?.lastName ?? ""} ${doc.guardia?.persona?.firstName ?? ""}`.trim();
      const label = safeSegment(nombre ? `${rut} — ${nombre}` : rut, doc.guardiaId);
      items.push({
        sourceType: "ops_documento_persona",
        sourceId: doc.id,
        r2Key,
        fileName: doc.fileName || "documento.pdf",
        mimeType: doc.mimeType,
        targetPath: DrivePathsV2.trabajador(label),
      });
    }
    return {
      items,
      skipped,
      nextCursor: hasMore ? batch[batch.length - 1]?.id : undefined,
    };
  },
};

async function listUnifiedGuardiaDocs(
  tenantId: string,
  limit: number,
  cursor?: string,
): Promise<BackfillListResult> {
  const rows = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      entityType: "guardia",
      role: "owner",
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: {
      id: true,
      entityId: true,
      file: {
        select: {
          id: true,
          storageKey: true,
          fileUrl: true,
          fileName: true,
          mimeType: true,
        },
      },
    },
  });
  const hasMore = rows.length > limit;
  const batch = hasMore ? rows.slice(0, limit) : rows;
  const items: BackfillItem[] = [];
  let skipped = 0;

  const guardiaIds = [...new Set(batch.map((r) => r.entityId))];
  const guardias = await prisma.opsGuardia.findMany({
    where: { tenantId, id: { in: guardiaIds } },
    select: {
      id: true,
      persona: { select: { rut: true, firstName: true, lastName: true } },
    },
  });
  const byId = new Map(guardias.map((g) => [g.id, g]));

  for (const link of batch) {
    const r2Key =
      link.file.storageKey ||
      (link.file.fileUrl
        ? extractStorageKeyFromPublicUrl(link.file.fileUrl)
        : null);
    if (!r2Key) {
      skipped += 1;
      continue;
    }
    const g = byId.get(link.entityId);
    const rut = g?.persona?.rut?.trim() || "SIN-RUT";
    const nombre =
      `${g?.persona?.lastName ?? ""} ${g?.persona?.firstName ?? ""}`.trim();
    const label = safeSegment(nombre ? `${rut} — ${nombre}` : rut, link.entityId);
    items.push({
      sourceType: "ops_documento_persona",
      sourceId: link.file.id,
      r2Key,
      fileName: link.file.fileName,
      mimeType: link.file.mimeType,
      targetPath: DrivePathsV2.trabajador(label),
    });
  }
  return {
    items,
    skipped,
    nextCursor: hasMore ? batch[batch.length - 1]?.id : undefined,
  };
}

const opsSource: BackfillSource = {
  docType: "ops_documentos",
  async listPending(tenantId, limit, cursor) {
    if (await readsUnified(tenantId)) {
      return listUnifiedOpsDocs(tenantId, limit, cursor);
    }
    const rows = await prisma.docOperacional.findMany({
      where: {
        tenantId,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: limit + 1,
      select: {
        id: true,
        storageKey: true,
        fileName: true,
        mimeType: true,
        capa: true,
        installationId: true,
        installation: { select: { name: true } },
      },
    });
    const hasMore = rows.length > limit;
    const batch = hasMore ? rows.slice(0, limit) : rows;
    const items: BackfillItem[] = [];
    let skipped = 0;
    for (const doc of batch) {
      if (!doc.storageKey) {
        skipped += 1;
        continue;
      }
      const path =
        doc.capa === "instalacion" && doc.installation
          ? DrivePathsV2.opsInstallation(
              safeSegment(doc.installation.name, doc.installationId || "inst"),
            )
          : DrivePathsV2.opsGeneral();
      items.push({
        sourceType: "doc_operacional",
        sourceId: doc.id,
        r2Key: doc.storageKey,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        targetPath: path,
      });
    }
    return {
      items,
      skipped,
      nextCursor: hasMore ? batch[batch.length - 1]?.id : undefined,
    };
  },
};

async function listUnifiedOpsDocs(
  tenantId: string,
  limit: number,
  cursor?: string,
): Promise<BackfillListResult> {
  const rows = await prisma.documentoEnlace.findMany({
    where: {
      tenantId,
      entityType: { in: ["instalacion", "tenant"] },
      role: "owner",
      ...(cursor ? { id: { gt: cursor } } : {}),
      file: { storageKey: { not: null } },
    },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      file: {
        select: { id: true, storageKey: true, fileName: true, mimeType: true },
      },
    },
  });
  const hasMore = rows.length > limit;
  const batch = hasMore ? rows.slice(0, limit) : rows;
  const instIds = batch
    .filter((r) => r.entityType === "instalacion")
    .map((r) => r.entityId);
  const insts = instIds.length
    ? await prisma.crmInstallation.findMany({
        where: { tenantId, id: { in: instIds } },
        select: { id: true, name: true },
      })
    : [];
  const instById = new Map(insts.map((i) => [i.id, i.name]));
  const items: BackfillItem[] = [];
  let skipped = 0;
  for (const link of batch) {
    if (!link.file.storageKey) {
      skipped += 1;
      continue;
    }
    const path =
      link.entityType === "instalacion"
        ? DrivePathsV2.opsInstallation(
            safeSegment(instById.get(link.entityId), link.entityId),
          )
        : DrivePathsV2.opsGeneral();
    items.push({
      sourceType: "doc_operacional",
      sourceId: link.file.id,
      r2Key: link.file.storageKey,
      fileName: link.file.fileName,
      mimeType: link.file.mimeType,
      targetPath: path,
    });
  }
  return {
    items,
    skipped,
    nextCursor: hasMore ? batch[batch.length - 1]?.id : undefined,
  };
}

const emptySource = (docType: SupportedDocType): BackfillSource => ({
  docType,
  async listPending() {
    return { items: [], skipped: 0 };
  },
});

export const BACKFILL_SOURCES: Record<SupportedDocType, BackfillSource> = {
  cotizacion: emptySource("cotizacion"),
  factura: facturaSource,
  licitacion: crmSource("licitacion", { dealLicitacion: true }),
  negocios: crmSource("negocios", { dealLicitacion: false }),
  personas: crmSource("personas", { entityType: "contact" }),
  documentos: crmSource("documentos", { entityType: "documentos" }),
  leads: crmSource("leads", { entityType: "lead" }),
  trabajadores: trabajadoresSource,
  ops_documentos: opsSource,
};
