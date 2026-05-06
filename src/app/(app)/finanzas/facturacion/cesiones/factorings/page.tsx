/**
 * Catálogo per-tenant de empresas de factoring (cesionarios).
 * Bloque 5 factoring v3 — UI con CRUD básico vía DataTable + Dialog.
 */

import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  hasFacturacionCapability,
  hasModuleAccess,
  resolvePagePerms,
} from "@/lib/permissions-server";
import { PageHero } from "@/components/opai-ds";
import { listFactoringCompanies } from "@/modules/finance/factoring/factoring-companies.service";
import { FactoringCompaniesClient } from "@/components/finance/factoring/FactoringCompaniesClient";

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
        icon={<Building2 />}
        iconTone="teal"
        eyebrow={["Finanzas", "Facturación", "Cesiones"]}
        title="Empresas de factoring"
        subtitle="Catálogo de cesionarios"
        description="Mantén el listado de empresas de factoring con las que cedés tus facturas y sus tasas habituales."
      />
      <FactoringCompaniesClient
        initialCompanies={initialCompanies}
        canManage={canManage}
      />
    </div>
  );
}
