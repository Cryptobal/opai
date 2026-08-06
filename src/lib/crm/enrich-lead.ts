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
import { enrichCompanyFromWebsite, isNotAvailable } from "@/lib/company-enrich";
import {
  isUsableCompanyNameForWebDiscovery,
  websiteFromEmail,
} from "@/lib/company-enrich-guards";

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

    const rawCompanyName = (lead.companyName || "").trim();
    // Solo usar el nombre para descubrir web si parece un nombre comercial real
    // (no un RUT tipo "65192734k" pegado desde el cotizador).
    const companyName = isUsableCompanyNameForWebDiscovery(rawCompanyName) ? rawCompanyName : "";
    let website = (lead.website || "").trim();
    if (!website) website = websiteFromEmail(lead.email);

    // Sin sitio ni nombre usable no hay nada que resolver de forma confiable.
    // Con email personal (Gmail/etc.) y sin web/nombre, no inventamos dominio.
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
