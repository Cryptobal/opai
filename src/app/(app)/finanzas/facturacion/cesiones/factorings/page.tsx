/**
 * Catálogo per-tenant de empresas de factoring (cesionarios).
 * Bloque 5 factoring v3 — UI con CRUD básico vía DataTable + Dialog.
 *
 * Renderiza el mismo PageHero "Cesiones de facturas" + CesionesTabs que
 * /finanzas/facturacion/cesiones, para que se vea como una sub-sección
 * del mismo módulo.
 */

import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  hasFacturacionCapability,
  hasModuleAccess,
  resolvePagePerms,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { listFactoringCompanies } from "@/modules/finance/factoring/factoring-companies.service";
import { FactoringCompaniesClient } from "@/components/finance/factoring/FactoringCompaniesClient";
import { CesionesTabs } from "@/components/finance/factoring/CesionesTabs";

export default async function FactoringCompaniesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/opai/login?callbackUrl=/finanzas/facturacion/cesiones/factorings");
  }
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, "finance")) redirect("/hub");
  if (!hasFacturacionCapability(perms, "facturacion_view")) {
    redirect("/finanzas/facturacion");
  }
  const canManage = hasFacturacionCapability(perms, "facturacion_configure");

  const companies = await listFactoringCompanies(session.user.tenantId, {
    includeInactive: true,
  });

  // Decimals → numbers para hidratación cliente.
  const initialCompanies = companies.map((c) => ({
    id: c.id,
    rut: c.rut,
    rutFormatted: c.rutFormatted,
    razonSocial: c.razonSocial,
    direccion: c.direccion,
    comuna: c.comuna,
    ciudad: c.ciudad,
    email: c.email,
    contactName: c.contactName,
    contactEmail: c.contactEmail,
    contactPhone: c.contactPhone,
    defaultAdvanceRate:
      c.defaultAdvanceRate !== null ? Number(c.defaultAdvanceRate) : null,
    defaultInterestRate:
      c.defaultInterestRate !== null ? Number(c.defaultInterestRate) : null,
    defaultCommissionPct:
      c.defaultCommissionPct !== null ? Number(c.defaultCommissionPct) : null,
    notes: c.notes,
    isActive: c.isActive,
  }));

  return (
    <div className="space-y-6 min-w-0">
      <PageHero
        icon={<Coins />}
        iconTone="teal"
        eyebrow={["Finanzas", "Facturación"]}
        title="Cesiones de facturas"
        subtitle="Factoring electrónico"
        description="Administra el catálogo de empresas de factoring (cesionarios) y sus tasas habituales."
      />
      <CesionesTabs />
      <FactoringCompaniesClient
        initialCompanies={initialCompanies}
        canManage={canManage}
      />
    </div>
  );
}
