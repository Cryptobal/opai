import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";
import {
  resolveDocument,
  buildEmpresaEntityData,
  buildQuoteEnrichedData,
  buildContractEntityData,
} from "@/lib/docs/token-resolver";
import type { EntityData } from "@/lib/docs/token-resolver";
import { tiptapToPreviewHtml } from "@/lib/docs/tiptap-to-html";
import { TOKEN_MODULES } from "@/lib/docs/token-registry";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";

/** Tokens that are determined at contract signing, not by the client. */
const CONTRACT_SIGNING_TOKENS = new Set([
  "contract.effectiveDate",
  "contract.expirationDate",
  "contract.title",
]);

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
      name: true,
      currency: true,
      parameters: {
        select: { contractMonths: true },
      },
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

  // Account + related representantes/personería for fallback enrichment
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
      representantesLegales: {
        select: { nombre: true, rut: true },
        orderBy: { createdAt: "asc" as const },
        take: 1,
      },
      personeria: {
        select: { fechaEscritura: true, tipoEscritura: true, notaria: true },
      },
    },
  });

  // Enrich account with data from related tables when crmAccount fields are empty
  const accountData = account ? { ...account } as Record<string, any> : null;
  if (accountData && account) {
    const firstRep = account.representantesLegales?.[0];
    if (!accountData.legalRepresentativeName && firstRep?.nombre) {
      accountData.legalRepresentativeName = firstRep.nombre;
    }
    if (!accountData.legalRepresentativeRut && firstRep?.rut) {
      accountData.legalRepresentativeRut = firstRep.rut;
    }
    if (!accountData.notaryName && account.personeria?.notaria) {
      accountData.notaryName = account.personeria.notaria;
    }
    if (!accountData.notaryDate && account.personeria?.fechaEscritura) {
      accountData.notaryDate = account.personeria.fechaEscritura
        .toISOString()
        .slice(0, 10);
    }
  }

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

  // Quote enriched data (buildQuoteEnrichedData computes salePriceUF internally
  // for UF quotes via fxUfRate). For CLP quotes we still compute the UF
  // equivalent here for portal preview display.
  let ufValue: number | null = null;
  try { ufValue = await getUfValue(); } catch { ufValue = null; }
  const quoteData = await buildQuoteEnrichedData(quoteId, { ufValue });
  if (
    quoteData.currency === "CLP" &&
    quoteData.salePriceMonthly &&
    (!quoteData.salePriceUF || quoteData.salePriceUF === "")
  ) {
    if (ufValue && ufValue > 0) {
      const uf = clpToUf(Number(quoteData.salePriceMonthly), ufValue);
      quoteData.salePriceUF = uf.toFixed(2);
    }
  }

  // First installation for the account (active preferred, fallback to prospect)
  const installation = await prisma.crmInstallation.findFirst({
    where: { accountId: quote.accountId!, status: { in: ["active", "prospect"] } },
    select: { name: true, address: true, commune: true, city: true },
    orderBy: { status: "asc" }, // "active" sorts before "prospect"
  });

  // Contract entity data (derive duration from quote parameters)
  const contractMonths = quote.parameters?.contractMonths ?? quoteData.contractMonths ?? null;
  const contractData = buildContractEntityData({
    title: quote.name ?? undefined,
    durationMonths: contractMonths ? Number(contractMonths) : undefined,
  });

  /* ── 4. Assemble entities ── */
  const entities: EntityData = {
    empresa: buildEmpresaEntityData(empresaSettings),
    account: accountData ?? undefined,
    contact: contact ?? undefined,
    deal: deal ? { ...deal, amount: deal.amount ? Number(deal.amount) : null } : undefined,
    quote: quoteData,
    installation: installation ?? undefined,
    contract: contractData,
  };

  /* ── 5. Determine which tokens are missing ── */
  const tokensUsed = Array.isArray(template.tokensUsed)
    ? (template.tokensUsed as string[])
    : [];

  // Categorized missing fields
  const missingPortal: { key: string; label: string }[] = [];
  const missingContractual: { key: string; label: string }[] = [];

  for (const tokenKey of tokensUsed) {
    const [mod, field] = tokenKey.split(".");
    if (!mod || !field) continue;
    if (mod === "system" || mod === "signature") continue;

    const entity = entities[mod as keyof EntityData];

    // Special computed fields
    if (mod === "contact" && field === "fullName") {
      if (!entity || !(entity.firstName || entity.lastName)) {
        missingPortal.push({ key: tokenKey, label: "Nombre Completo Contacto" });
      }
      continue;
    }

    if (!entity) {
      const tokenDef = TOKEN_MODULES
        .find((m) => m.key === mod)
        ?.tokens.find((t) => t.key === tokenKey);
      const entry = { key: tokenKey, label: tokenDef?.label ?? tokenKey };
      if (CONTRACT_SIGNING_TOKENS.has(tokenKey)) {
        missingContractual.push(entry);
      } else if (mod === "account" || mod === "contact" || mod === "installation") {
        missingPortal.push(entry);
      } else {
        missingContractual.push(entry);
      }
      continue;
    }

    const value = entity[field];
    if (value === null || value === undefined || value === "") {
      const tokenDef = TOKEN_MODULES
        .find((m) => m.key === mod)
        ?.tokens.find((t) => t.key === tokenKey);
      const entry = { key: tokenKey, label: tokenDef?.label ?? field };
      if (CONTRACT_SIGNING_TOKENS.has(tokenKey)) {
        missingContractual.push(entry);
      } else if (mod === "account" || mod === "contact" || mod === "installation") {
        missingPortal.push(entry);
      } else {
        missingContractual.push(entry);
      }
    }
  }

  const allMissing = [...missingPortal, ...missingContractual];

  /* ── 6. Build placeholder-enriched entities for visual rendering ── */
  const entitiesForRender: EntityData = JSON.parse(JSON.stringify(entities));

  for (const missing of allMissing) {
    const [mod, field] = missing.key.split(".");
    if (!mod || !field) continue;

    // Contractual tokens get a softer placeholder
    const isContractual = CONTRACT_SIGNING_TOKENS.has(missing.key);
    const placeholder = isContractual
      ? `[A definir]`
      : `[${missing.label}]`;

    const entity = entitiesForRender[mod as keyof EntityData];
    if (entity) {
      (entity as Record<string, unknown>)[field] = placeholder;
    } else {
      (entitiesForRender as Record<string, unknown>)[mod] = { [field]: placeholder };
    }
  }

  /* ── 7. Resolve template with enriched entities ── */
  const content = template.content as { type: string; content: unknown[] };
  const { resolvedContent } = resolveDocument(content, entitiesForRender);

  /* ── 8. Convert to HTML ── */
  let html = tiptapToPreviewHtml(resolvedContent);

  // Highlight missing-portal placeholders in yellow
  for (const f of missingPortal) {
    const escaped = f.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp(`\\[${escaped}\\]`, "g"),
      `<span style="background:#fbbf24;color:#78350f;padding:2px 6px;border-radius:4px;font-size:0.85em;font-weight:600">[${f.label}]</span>`
    );
  }

  // Highlight contractual placeholders in subtle gray
  html = html.replace(
    /\[A definir\]/g,
    `<span style="background:#e2e8f0;color:#475569;padding:2px 6px;border-radius:4px;font-size:0.85em;font-style:italic">[A definir al firmar]</span>`
  );

  /* ── 9. Return response ── */
  return NextResponse.json({
    success: true,
    data: {
      templateName: template.name,
      html,
      missingFields: missingPortal,
      contractualFields: missingContractual,
      canCompleteInPortal: missingPortal.length > 0,
    },
  });
}
