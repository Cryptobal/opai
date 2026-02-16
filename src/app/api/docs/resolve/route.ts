/**
 * API Route: /api/docs/resolve
 * POST - Resolver tokens en un documento con datos reales de CRM/CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { resolveTokensSchema } from "@/lib/validations/docs";
import { resolveDocument, type EntityData } from "@/lib/docs/token-resolver";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const parsed = await parseBody(request, resolveTokensSchema);
    if (parsed.error) return parsed.error;

    const { content, accountId, contactId, installationId, dealId, quoteId } =
      parsed.data;

    // Fetch all entities in parallel
    const [account, contact, installation, deal, quote] = await Promise.all([
      accountId
        ? prisma.crmAccount.findFirst({
            where: { id: accountId, tenantId: ctx.tenantId },
          })
        : null,
      contactId
        ? prisma.crmContact.findFirst({
            where: { id: contactId, tenantId: ctx.tenantId },
          })
        : null,
      installationId
        ? prisma.crmInstallation.findFirst({
            where: { id: installationId, tenantId: ctx.tenantId },
            select: { id: true, name: true, address: true, city: true, commune: true },
          })
        : null,
      dealId
        ? prisma.crmDeal.findFirst({
            where: { id: dealId, tenantId: ctx.tenantId },
          })
        : null,
      quoteId
        ? prisma.cpqQuote.findFirst({
            where: { id: quoteId, tenantId: ctx.tenantId },
          })
        : null,
    ]);

    const entities: EntityData = {
      account: account as any,
      contact: contact as any,
      installation: installation as any,
      deal: deal as any,
      quote: quote as any,
    };

    const { resolvedContent, tokenValues } = resolveDocument(content, entities);

    return NextResponse.json({
      success: true,
      data: {
        resolvedContent,
        tokenValues,
        entities: {
          account: account ? { id: account.id, name: account.name } : null,
          contact: contact
            ? { id: contact.id, name: `${contact.firstName} ${contact.lastName}` }
            : null,
          installation: installation
            ? { id: installation.id, name: installation.name }
            : null,
          deal: deal ? { id: deal.id, title: deal.title } : null,
          quote: quote ? { id: quote.id, code: quote.code } : null,
        },
      },
    });
  } catch (error) {
    console.error("Error resolving tokens:", error);
    return NextResponse.json(
      { success: false, error: "Error al resolver tokens" },
      { status: 500 }
    );
  }
}
