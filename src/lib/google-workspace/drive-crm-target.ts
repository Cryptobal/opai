import { prisma } from "@/lib/prisma";
import {
  DrivePathsV1,
  DrivePathsV2,
  safeSegment,
} from "./drive-tree";

export type CrmFileTarget = {
  docType: string;
  path: string;
  entity?: { type: string; id: string };
};

async function structureVersion(tenantId: string): Promise<number> {
  const ws = await prisma.googleDriveWorkspace.findFirst({
    where: { tenantId, status: "ACTIVE" },
    select: { structureVersion: true },
  });
  return ws?.structureVersion ?? 1;
}

function pathsFor(version: number) {
  return version >= 2 ? DrivePathsV2 : DrivePathsV1;
}

/**
 * Resuelve docType + carpeta Drive destino para un archivo CRM.
 * v1: árbol plano; v2: bajo Comercial/… (ver drive-tree.ts).
 */
export async function resolveCrmFileTarget(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<CrmFileTarget | null> {
  const year = String(new Date().getFullYear());
  const v = await structureVersion(tenantId);
  const P = pathsFor(v);

  switch (entityType) {
    case "deal": {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: entityId, tenantId },
        select: { title: true, isLicitacion: true },
      });
      if (!deal) return null;
      const name = safeSegment(deal.title, entityId);
      if (deal.isLicitacion) {
        return {
          docType: "licitacion",
          path: P.licitacion(year, name),
          entity: { type: "deal", id: entityId },
        };
      }
      return {
        docType: "negocios",
        path: P.deal(year, name),
        entity: { type: "deal", id: entityId },
      };
    }
    case "lead": {
      if (v < 2) return null;
      const lead = await prisma.crmLead.findFirst({
        where: { id: entityId, tenantId },
        select: { companyName: true, firstName: true, lastName: true },
      });
      if (!lead) return null;
      const label = safeSegment(
        lead.companyName || `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim(),
        entityId,
      );
      return {
        docType: "leads",
        path: DrivePathsV2.lead(year, label),
        entity: { type: "lead", id: entityId },
      };
    }
    case "contact": {
      const c = await prisma.crmContact.findFirst({
        where: { id: entityId, tenantId },
        select: { firstName: true, lastName: true, account: { select: { name: true } } },
      });
      if (!c) return null;
      const nombre = safeSegment(`${c.firstName} ${c.lastName}`.trim(), entityId);
      return {
        docType: "personas",
        path: P.contact(safeSegment(c.account?.name, "Sin-cuenta"), nombre),
        entity: { type: "contact", id: entityId },
      };
    }
    case "account": {
      const a = await prisma.crmAccount.findFirst({
        where: { id: entityId, tenantId },
        select: { name: true },
      });
      if (!a) return null;
      return {
        docType: "documentos",
        path: P.accountGeneral(safeSegment(a.name, "Sin-cuenta")),
        entity: { type: "account", id: entityId },
      };
    }
    case "installation": {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: entityId, tenantId },
        select: { name: true, account: { select: { name: true } } },
      });
      if (!inst) return null;
      return {
        docType: "documentos",
        path: P.installationDocs(
          safeSegment(inst.account?.name, "Sin-cuenta"),
          safeSegment(inst.name, "General"),
        ),
        entity: { type: "installation", id: entityId },
      };
    }
    default:
      return null;
  }
}
