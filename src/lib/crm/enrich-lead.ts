/**
 * lib/crm/enrich-lead
 * Auto-enriquecimiento de un lead recién creado a partir de su sitio web
 * (o del dominio del email, o por búsqueda del nombre de empresa).
 *
 * Guarda el resultado en `metadata.companyEnrichment` — el mismo slot que el
 * detalle del lead (CrmLeadDetailClient) lee para prellenar el formulario de
 * "Verificar y aprobar". Así el ejecutivo abre el lead con los datos ya cargados.
 *
 * Pensado para correr en background vía `after()` de Next, sin bloquear la
 * respuesta al cliente. Nunca lanza: cualquier fallo se loguea y se ignora.
 */

import { prisma } from "@/lib/prisma";
import { enrichCompanyFromWebsite, isNotAvailable, websiteFromEmail } from "@/lib/company-enrich";

export async function enrichLeadFromWebsite(leadId: string, tenantId: string): Promise<void> {
  try {
    const lead = await prisma.crmLead.findFirst({ where: { id: leadId, tenantId } });
    if (!lead) return;

    // No re-enriquecer si ya hay un enrichment automático guardado.
    const existingMeta =
      lead.metadata && typeof lead.metadata === "object" && !Array.isArray(lead.metadata)
        ? (lead.metadata as Record<string, unknown>)
        : {};
    const prev = existingMeta.companyEnrichment;
    if (prev && typeof prev === "object") return;

    const companyName = (lead.companyName || "").trim();
    let website = (lead.website || "").trim();
    if (!website) website = websiteFromEmail(lead.email);
    // Sin sitio ni nombre no hay nada que resolver.
    if (!website && !companyName) return;

    const result = await enrichCompanyFromWebsite({ website, companyName, tenantId });

    const pick = (v: string): string | null => (isNotAvailable(v) ? null : v);

    const companyEnrichment = {
      website: result.websiteNormalized,
      accountRut: pick(result.companyRut),
      legalName: pick(result.legalName),
      legalRepresentativeName: pick(result.legalRepresentativeName),
      legalRepresentativeRut: pick(result.legalRepresentativeRut),
      industry: pick(result.industry),
      segment: pick(result.segment),
      accountLogoUrl: result.localLogoUrl || result.logoUrl || null,
      accountNotes: pick(result.summary),
      companyNameDetected: pick(result.companyNameDetected),
      source: "auto_web",
      capturedAt: new Date().toISOString(),
    };

    await prisma.crmLead.update({
      where: { id: lead.id },
      data: {
        // Completa columnas vacías sin pisar lo que el cliente ya envió.
        ...(lead.website ? {} : { website: result.websiteNormalized }),
        ...(lead.industry || isNotAvailable(result.industry) ? {} : { industry: result.industry }),
        metadata: { ...existingMeta, companyEnrichment },
      },
    });
  } catch (err) {
    console.warn("[enrich-lead] auto-enriquecimiento falló:", err);
  }
}
