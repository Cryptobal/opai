import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import {
  resolveDocument,
  buildEmpresaEntityData,
  buildQuoteEnrichedData,
} from "@/lib/docs/token-resolver";
import type { EntityData } from "@/lib/docs/token-resolver";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { TOKEN_MODULES } from "@/lib/docs/token-registry";

/**
 * GET /api/portal/cliente/cotizaciones/[id]/contrato-borrador
 *
 * Returns the contract draft HTML rendered from the tenant's default
 * contract template, with the client's data pre-filled.
 * Tokens that couldn't be resolved are shown as visible placeholders.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) {
    return NextResponse.json({ error: "No session" }, { status: 401 });
  }

  const { id: quoteId } = await params;

  /* ── 1. Fetch the quote and verify access ── */
  const quote = await prisma.cpqQuote.findFirst({
    where: {
      id: quoteId,
      accountId: session.accountId,
      tenantId: session.tenantId,
      ...cpqQuoteListedInClientPortalWhere(),
    },
    select: {
      id: true,
      accountId: true,
      tenantId: true,
      dealId: true,
      code: true,
    },
  });

  if (!quote || !quote.accountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /* ── 2. Find the default contract template for this tenant ── */
  const template = await prisma.docTemplate.findFirst({
    where: {
      tenantId: session.tenantId,
      module: "crm",
      category: { in: ["contrato_servicio", "contrato_cliente"] },
      isActive: true,
      isDefault: true,
    },
    select: { id: true, name: true, content: true, tokensUsed: true },
  });

  if (!template) {
    return NextResponse.json(
      { error: "No hay plantilla de contrato configurada" },
      { status: 404 }
    );
  }

  /* ── 3. Build entity data ── */

  // Account
  const account = await prisma.crmAccount.findUnique({
    where: { id: quote.accountId! },
    select: {
      name: true,
      rut: true,
      legalName: true,
      legalRepresentativeName: true,
      legalRepresentativeRut: true,
      address: true,
      commune: true,
      industry: true,
      segment: true,
      size: true,
      website: true,
      notaryName: true,
      notaryDate: true,
    },
  });

  // Primary contact
  const contact = await prisma.crmContact.findFirst({
    where: { accountId: quote.accountId!, tenantId: session.tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      roleTitle: true,
    },
  });

  // Deal (if linked)
  const deal = quote.dealId
    ? await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: {
          title: true,
          amount: true,
          expectedCloseDate: true,
          service: true,
        },
      })
    : null;

  // Empresa settings (new format empresa:tenantId:empresa.xxx or legacy empresa.xxx)
  let rawEmpresa = await prisma.setting.findMany({
    where: { tenantId: session.tenantId, key: { startsWith: `empresa:${session.tenantId}:` } },
    select: { key: true, value: true },
  });
  if (rawEmpresa.length === 0) {
    rawEmpresa = await prisma.setting.findMany({
      where: { tenantId: session.tenantId, key: { startsWith: "empresa." } },
      select: { key: true, value: true },
    });
  }
  const empresaSettings = rawEmpresa.map((s) => ({
    key: s.key.includes(":") ? s.key.replace(`empresa:${session.tenantId}:`, "") : s.key,
    value: s.value,
  }));

  // Quote enriched data
  const quoteData = await buildQuoteEnrichedData(quoteId);

  // First installation for the account
  const installation = await prisma.crmInstallation.findFirst({
    where: { accountId: quote.accountId!, status: "active" },
    select: { name: true, address: true, commune: true, city: true },
  });

  /* ── 4. Assemble entities ── */
  const entities: EntityData = {
    empresa: buildEmpresaEntityData(empresaSettings),
    account: account ?? undefined,
    contact: contact ?? undefined,
    deal: deal ? { ...deal, amount: deal.amount ? Number(deal.amount) : null } : undefined,
    quote: quoteData,
    installation: installation ?? undefined,
  };

  /* ── 5. Determine which tokens are missing ── */
  const tokensUsed = Array.isArray(template.tokensUsed)
    ? (template.tokensUsed as string[])
    : [];

  const missingFields: { key: string; label: string }[] = [];

  for (const tokenKey of tokensUsed) {
    const [mod, field] = tokenKey.split(".");
    if (!mod || !field) continue;
    if (mod === "system" || mod === "signature") continue;

    const entity = entities[mod as keyof EntityData];
    if (!entity) {
      // Entire module missing
      const tokenDef = TOKEN_MODULES
        .find((m) => m.key === mod)
        ?.tokens.find((t) => t.key === tokenKey);
      missingFields.push({
        key: tokenKey,
        label: tokenDef?.label ?? tokenKey,
      });
      continue;
    }

    // Special computed fields
    if (mod === "contact" && field === "fullName") {
      const hasName = entity.firstName || entity.lastName;
      if (!hasName) {
        missingFields.push({ key: tokenKey, label: "Nombre Completo Contacto" });
      }
      continue;
    }

    const value = entity[field];
    if (value === null || value === undefined || value === "") {
      const tokenDef = TOKEN_MODULES
        .find((m) => m.key === mod)
        ?.tokens.find((t) => t.key === tokenKey);
      missingFields.push({
        key: tokenKey,
        label: tokenDef?.label ?? field,
      });
    }
  }

  /* ── 6. Build placeholder-enriched entities for visual rendering ── */
  // For tokens that resolve to empty, inject a visible placeholder
  const entitiesForRender: EntityData = JSON.parse(JSON.stringify(entities));

  for (const missing of missingFields) {
    const [mod, field] = missing.key.split(".");
    if (!mod || !field) continue;
    const entity = entitiesForRender[mod as keyof EntityData];
    if (entity) {
      (entity as Record<string, unknown>)[field] = `[${missing.label}]`;
    } else {
      // Create a stub entity with the placeholder
      (entitiesForRender as Record<string, unknown>)[mod] = { [field]: `[${missing.label}]` };
    }
  }

  /* ── 7. Resolve template with enriched entities ── */
  const content = template.content as { type: string; content: unknown[] };
  const { resolvedContent } = resolveDocument(content, entitiesForRender);

  /* ── 8. Convert to HTML ── */
  let html = tiptapToPreviewHtml(resolvedContent);

  // Highlight placeholders: wrap [Campo] markers with styled spans
  html = html.replace(
    /\[([^\]]+)\]/g,
    (match, label) => {
      // Only highlight if it matches a known missing field label
      const isMissing = missingFields.some((f) => f.label === label);
      if (!isMissing) return match;
      return `<span style="background:#fbbf24;color:#78350f;padding:2px 6px;border-radius:4px;font-size:0.85em;font-weight:600">[${label}]</span>`;
    }
  );

  /* ── 9. Return response ── */
  return NextResponse.json({
    success: true,
    data: {
      templateName: template.name,
      html,
      missingFields,
      canCompleteInPortal: missingFields.some((f) =>
        f.key.startsWith("account.") || f.key.startsWith("contact.")
      ),
    },
  });
}
