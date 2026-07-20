import { prisma } from "@/lib/prisma";

function seg(name: string | null | undefined, fallback: string): string {
  const raw = (name || fallback).trim() || fallback;
  return raw.replace(/[\\/]/g, "-").slice(0, 80);
}

export type CrmFileTarget = { docType: string; path: string };

/**
 * Resuelve docType (gate del mirrorConfig) + carpeta Drive destino para un
 * archivo adjunto a una entidad CRM:
 *   deal         → Negocios/{Año}/{NombreDeal}/            (docType "negocios")
 *   contact      → Clientes/{Cuenta}/Personas/{Contacto}/ (docType "personas")
 *   account      → Clientes/{Cuenta}/General/Documentos/  (docType "documentos")
 *   installation → Clientes/{Cuenta}/{Instalación}/Documentos/
 * lead/guardia u otros → null (no se espejan).
 */
export async function resolveCrmFileTarget(
  tenantId: string,
  entityType: string,
  entityId: string,
): Promise<CrmFileTarget | null> {
  const year = String(new Date().getFullYear());
  switch (entityType) {
    case "deal": {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: entityId, tenantId },
        select: { title: true },
      });
      if (!deal) return null;
      return { docType: "negocios", path: `Negocios/${year}/${seg(deal.title, entityId)}` };
    }
    case "contact": {
      const c = await prisma.crmContact.findFirst({
        where: { id: entityId, tenantId },
        select: { firstName: true, lastName: true, account: { select: { name: true } } },
      });
      if (!c) return null;
      const nombre = seg(`${c.firstName} ${c.lastName}`.trim(), entityId);
      return {
        docType: "personas",
        path: `Clientes/${seg(c.account?.name, "Sin-cuenta")}/Personas/${nombre}`,
      };
    }
    case "account": {
      const a = await prisma.crmAccount.findFirst({
        where: { id: entityId, tenantId },
        select: { name: true },
      });
      if (!a) return null;
      return { docType: "documentos", path: `Clientes/${seg(a.name, "Sin-cuenta")}/General/Documentos` };
    }
    case "installation": {
      const inst = await prisma.crmInstallation.findFirst({
        where: { id: entityId, tenantId },
        select: { name: true, account: { select: { name: true } } },
      });
      if (!inst) return null;
      return {
        docType: "documentos",
        path: `Clientes/${seg(inst.account?.name, "Sin-cuenta")}/${seg(inst.name, "General")}/Documentos`,
      };
    }
    default:
      return null;
  }
}
