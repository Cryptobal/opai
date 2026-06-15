import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { clearTenantEmailConfigCache, clearTenantEmailRoutingCache } from "@/lib/resend";
import { clearTenantCompanyConfigCache } from "@/lib/tenant-config";
import { clearTenantPresentationCache } from "@/lib/tenant-presentation";

const EMPRESA_KEYS = [
  "empresa.razonSocial",
  "empresa.rut",
  "empresa.direccion",
  "empresa.comuna",
  "empresa.ciudad",
  "empresa.telefono",
  "empresa.repLegalNombre",
  "empresa.repLegalRut",
  "empresa.repLegalEmail",
  "empresa.repLegalFirma",
  "empresa.fechaEscrituraPublica",
  "empresa.nombreNotaria",
  "empresa.autoFirmaRepLegalContratos",
  "empresa.emailFrom",
  "empresa.emailFromName",
  "empresa.emailReplyTo",
  // Nuevos campos para multi-tenant
  "empresa.companyName",
  "empresa.commercialName",
  "empresa.brandNameUpper",
  "empresa.website",
  "empresa.logoUrl",
  "empresa.email",
  "empresa.emailOps",
  "empresa.emailFinance",
  "empresa.emailContact",
  "empresa.phone",
  "empresa.phoneRaw",
  "empresa.whatsappLink",
  // Portales (rondas/acceso)
  "portales.logoutPin",
  // Routing CCO por módulo
  "empresa.cco.commercial.enabled",
  "empresa.cco.commercial.emails",
  "empresa.cco.commercial.replyTo",
  "empresa.cco.operations.enabled",
  "empresa.cco.operations.emails",
  "empresa.cco.operations.replyTo",
  "empresa.cco.finance.enabled",
  "empresa.cco.finance.emails",
  "empresa.cco.finance.replyTo",
  "empresa.cco.system.enabled",
  "empresa.cco.system.emails",
  "empresa.cco.system.replyTo",
  // Branding / Imagen corporativa
  "empresa.branding.logoFull",
  "empresa.branding.logoIcon",
  "empresa.branding.logoWhite",
  "empresa.branding.logoDark",
  "empresa.branding.favicon",
  "empresa.branding.primaryColor",
  "empresa.branding.secondaryColor",
  "empresa.branding.accentColor",
  "empresa.branding.appName",
  "empresa.branding.tagline",
  // Presentación de empresa (portal). stats/sections/serviceIncludes = JSON.
  "empresa.presentacion.valueProp",
  "empresa.presentacion.stats",
  "empresa.presentacion.sections",
  "empresa.presentacion.serviceIncludes",
  // Propuesta Técnica (PDF). Cifras/métricas (vacío = se omiten) + exclusión de clientes.
  "empresa.proposal.yearsInOperation",
  "empresa.proposal.activeGuards",
  "empresa.proposal.protectedFacilities",
  "empresa.proposal.regionsCount",
  "empresa.proposal.metricIncidentReduction",
  "empresa.proposal.metricRoundsCompliance",
  "empresa.proposal.metricDocumented",
  "empresa.proposal.metricRenewalRate",
  "empresa.proposal.metricSatisfaction",
  "empresa.proposal.excludedAccountIds", // JSON array de IDs de cuenta a ocultar
];

function settingKey(tenantId: string, key: string): string {
  return `empresa:${tenantId}:${key}`;
}

/**
 * GET /api/configuracion/empresa — Get company settings (por tenant)
 * Soporta keys nuevas (empresa:tenantId:empresa.xxx) y antiguas (empresa.xxx) para migración.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const newKeys = EMPRESA_KEYS.map((k) => settingKey(ctx.tenantId, k));
    let settings = await prisma.setting.findMany({
      where: { tenantId: ctx.tenantId, key: { in: newKeys } },
    });

    if (settings.length === 0) {
      settings = await prisma.setting.findMany({
        where: { tenantId: ctx.tenantId, key: { in: EMPRESA_KEYS } },
      });
    }

    const data: Record<string, string> = {};
    for (const s of settings) {
      const shortKey = s.key.includes(":") ? s.key.replace(`empresa:${ctx.tenantId}:`, "") : s.key;
      data[shortKey] = s.value;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CONFIG] Error loading empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar la configuración" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/configuracion/empresa — Update company settings (por tenant)
 * Body: { "empresa.razonSocial": "...", "empresa.emailFrom": "...", ... }
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar esta configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    for (const shortKey of EMPRESA_KEYS) {
      if (body[shortKey] !== undefined) {
        const key = settingKey(ctx.tenantId, shortKey);
        // Normalize the logout PIN: keep digits only, max 4 chars. Mirrors
        // the regex used by the config UI input. Defends against accidental
        // whitespace / CRLF / zero-width chars on paste.
        const rawValue = String(body[shortKey]);
        const value =
          shortKey === "portales.logoutPin"
            ? rawValue.replace(/[^0-9]/g, "").slice(0, 4)
            : rawValue;
        await prisma.setting.upsert({
          where: { tenantId_key: { tenantId: ctx.tenantId, key } },
          create: {
            key,
            value,
            type: "string",
            category: "empresa",
            tenantId: ctx.tenantId,
          },
          update: {
            value,
          },
        });
      }
    }

    clearTenantEmailConfigCache(ctx.tenantId);
    clearTenantEmailRoutingCache(ctx.tenantId);
    clearTenantCompanyConfigCache(ctx.tenantId);
    clearTenantPresentationCache(ctx.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CONFIG] Error updating empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la configuración" },
      { status: 500 }
    );
  }
}
