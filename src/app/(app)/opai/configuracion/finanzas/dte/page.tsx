import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  resolvePagePerms,
  hasModuleAccess,
  canView,
} from "@/lib/permissions-server";
import { prisma } from "@/lib/prisma";
import { ConfigPageLayout } from "@/components/configuracion/ConfigPageLayout";
import { FileText } from "lucide-react";
import { DteConfigClient } from "@/components/finance/DteConfigClient";

export default async function DteConfigPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/opai/configuracion/finanzas/dte");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!canView(perms, "finance", "configuracion")) redirect("/finanzas");

  const tenantId = session.user.tenantId;

  const [config, cert, cafs] = await Promise.all([
    prisma.tenantDteConfig.findUnique({ where: { tenantId } }),
    prisma.tenantDteCertificate.findUnique({
      where: { tenantId },
      select: {
        id: true,
        fileName: true,
        rutTitular: true,
        nombreTitular: true,
        emisorCert: true,
        notBefore: true,
        notAfter: true,
        fingerprint: true,
        uploadedAt: true,
      },
    }),
    prisma.tenantDteCaf.findMany({
      where: { tenantId },
      orderBy: [{ dteType: "asc" }, { folioDesde: "asc" }],
      select: {
        id: true,
        dteType: true,
        folioDesde: true,
        folioHasta: true,
        rutEmisor: true,
        fechaAutorizacion: true,
        fileName: true,
        isActive: true,
        uploadedAt: true,
      },
    }),
  ]);

  // Serialize Date fields → Server Components no pueden enviar Date directo a
  // Client Components sin perder type-safety en el border.
  const initialConfig = config
    ? {
        ...config,
        resolFecha: config.resolFecha ? config.resolFecha.toISOString() : null,
        createdAt: config.createdAt.toISOString(),
        updatedAt: config.updatedAt.toISOString(),
        lastRcvSyncAt: config.lastRcvSyncAt
          ? config.lastRcvSyncAt.toISOString()
          : null,
      }
    : null;

  const initialCertificate = cert
    ? {
        ...cert,
        notBefore: cert.notBefore.toISOString(),
        notAfter: cert.notAfter.toISOString(),
        uploadedAt: cert.uploadedAt.toISOString(),
      }
    : null;

  const initialCafs = cafs.map((c) => ({
    ...c,
    fechaAutorizacion: c.fechaAutorizacion.toISOString(),
    uploadedAt: c.uploadedAt.toISOString(),
  }));

  return (
    <ConfigPageLayout
      title="DTE — Facturación Electrónica"
      description="Datos del emisor, certificado digital y archivos CAF para emitir facturas electrónicas al SII."
      icon={<FileText className="h-[18px] w-[18px]" />}
      backHref="/opai/configuracion/finanzas"
      backLabel="Finanzas"
    >
      <DteConfigClient
        initialConfig={initialConfig}
        initialCertificate={initialCertificate}
        initialCafs={initialCafs}
      />
    </ConfigPageLayout>
  );
}
