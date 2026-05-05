import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePortalClienteAuth } from "@/lib/portal-cliente";
import { getWaTemplateAndUrl } from "@/lib/whatsapp-templates";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { prisma } from "@/lib/prisma";

const ALLOWED_SLUGS = new Set([
  "portal_consult_quote",
  "portal_consult_proposal",
  "portal_consult_general",
]);

const resolveSchema = z.object({
  slug: z.string().min(1),
  /** Code de cotización (opcional) — para slugs que lo necesitan */
  quoteCode: z.string().optional(),
});

/**
 * POST /api/portal/cliente/whatsapp/resolve
 *
 * Resuelve plantillas WhatsApp del portal cliente (cookie portal_cliente_session).
 * Solo permite slugs del grupo `portal_consult_*` para evitar exponer plantillas
 * de CRM/Ops/CPQ que requieren contexto interno.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePortalClienteAuth(request);
  if (!auth) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 });
  }
  const { slug, quoteCode } = parsed.data;

  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ success: false, error: "Slug no permitido" }, { status: 403 });
  }

  const tenantCfg = await getTenantCompanyConfig(auth.tenantId);
  // Cargar contacto y account del portal session para alimentar tokens.
  const contact = await prisma.crmContact.findUnique({
    where: { id: auth.contactId },
    select: { firstName: true, lastName: true, email: true, phone: true },
  });
  const account = await prisma.crmAccount.findUnique({
    where: { id: auth.accountId },
    select: { name: true, industry: true },
  });

  // Phone destino: el del tenant (cliente nos contacta).
  const phoneRaw = tenantCfg.phoneRaw?.trim() || null;

  const { message, url } = await getWaTemplateAndUrl(auth.tenantId, slug, {
    entities: {
      contact: contact || undefined,
      account: account || undefined,
      quote: quoteCode ? { code: quoteCode } : undefined,
      tenant: {
        commercialName: tenantCfg.commercialName,
        website: tenantCfg.website,
        phone: tenantCfg.phone,
        email: tenantCfg.email,
        whatsappLink: tenantCfg.whatsappLink,
      },
    },
    phone: phoneRaw,
  });

  return NextResponse.json({
    success: true,
    data: { message, url, phone: phoneRaw },
  });
}
