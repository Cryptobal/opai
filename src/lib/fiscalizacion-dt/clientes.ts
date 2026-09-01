import { prisma } from "@/lib/prisma";
import { FISCALIZACION_DT_PUBLIC_URL } from "@/lib/app-version";

export type DtClienteArt26 = {
  id: string;
  razonSocial: string;
  nombreFantasia: string;
  domicilioCasaMatriz: string;
  rut: string;
  tipoServicio: string;
  urlFiscalizacion: string;
  vigenciaInicio: string | null;
  vigenciaTermino: string | null;
  activo: boolean;
};

async function mapTenant(t: {
  id: string;
  name: string;
  legalName: string | null;
  fantasyName: string | null;
  hqAddress: string | null;
  companyRut: string | null;
  dtServiceType: string;
  dtContractStart: Date | null;
  dtContractEnd: Date | null;
}): Promise<DtClienteArt26> {
  return {
    id: t.id,
    razonSocial: t.legalName || t.name,
    nombreFantasia: t.fantasyName || t.name,
    domicilioCasaMatriz: t.hqAddress || "",
    rut: t.companyRut || "",
    tipoServicio: t.dtServiceType || "cloud",
    urlFiscalizacion: FISCALIZACION_DT_PUBLIC_URL,
    vigenciaInicio: t.dtContractStart ? t.dtContractStart.toISOString().slice(0, 10) : null,
    vigenciaTermino: t.dtContractEnd ? t.dtContractEnd.toISOString().slice(0, 10) : null,
    activo: t.dtContractEnd == null,
  };
}

export async function listDtClientesArt26(): Promise<{
  vigentes: DtClienteArt26[];
  desvinculados: DtClienteArt26[];
}> {
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      legalName: true,
      fantasyName: true,
      hqAddress: true,
      companyRut: true,
      dtServiceType: true,
      dtContractStart: true,
      dtContractEnd: true,
    },
    orderBy: { name: "asc" },
  });

  const mapped = await Promise.all(tenants.map(mapTenant));
  mapped.sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, "es", { sensitivity: "base" }));

  return {
    vigentes: mapped.filter((c) => c.activo),
    desvinculados: mapped.filter((c) => !c.activo),
  };
}
