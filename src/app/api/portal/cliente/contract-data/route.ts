/**
 * POST /api/portal/cliente/contract-data
 * Receives company + billing data after a quote is approved.
 * Creates a Document from the contract template, associates it with
 * the account, and generates a DocSignatureRequest + DocSignatureRecipient.
 */

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { cpqQuoteListedInClientPortalWhere } from "@/lib/cpq-portal-visibility";

type ContractDataBody = {
  quoteId: string;
  companyRut: string;
  legalName: string;
  legalAddress: string;
  billingData?: {
    email?: string;
    contact?: string;
    paymentMethod?: string;
  };
  operativeContacts?: Array<{
    name: string;
    email: string;
    phone?: string;
    role?: string;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    // ── Session ──────────────────────────────────────────────
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No session" }, { status: 401 });
    }

    // ── Body ─────────────────────────────────────────────────
    let body: ContractDataBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const { quoteId, companyRut, legalName, legalAddress, billingData, operativeContacts } = body;

    if (!quoteId || !companyRut || !legalName) {
      return NextResponse.json(
        { error: "quoteId, companyRut y legalName son requeridos" },
        { status: 400 }
      );
    }

    // ── 1. Verify quote ownership ─────────────────────────────
    const quote = await prisma.cpqQuote.findFirst({
      where: {
        id: quoteId,
        accountId: session.accountId,
        tenantId: session.tenantId,
        ...cpqQuoteListedInClientPortalWhere(),
      },
      select: { id: true, name: true, code: true },
    });

    if (!quote) {
      return NextResponse.json({ error: "Cotizacion no encontrada" }, { status: 404 });
    }

    // ── 2. Update CrmAccount with legal data ─────────────────
    // Store billing / operative contacts in portalConfig JSON
    const portalConfigUpdate = {
      contractData: {
        companyRut,
        legalName,
        legalAddress,
        billingData: billingData ?? null,
        operativeContacts: operativeContacts ?? [],
        submittedAt: new Date().toISOString(),
      },
    };

    await prisma.crmAccount.update({
      where: { id: session.accountId },
      data: {
        rut: companyRut,
        legalName,
        address: legalAddress,
        portalConfig: portalConfigUpdate as Prisma.InputJsonValue,
      },
    });

    // ── 3. Find contract template ─────────────────────────────
    const template = await prisma.docTemplate.findFirst({
      where: {
        tenantId: session.tenantId,
        isActive: true,
        OR: [
          { usageSlug: "contrato_cliente" },
          { usageSlug: "contrato" },
        ],
      },
    });

    if (!template) {
      // No template — return success without document
      return NextResponse.json({ success: true, documentId: null, signatureToken: null });
    }

    // ── 4. Create Document from template ─────────────────────
    const uniqueId = `CONTRACT-${session.accountId.slice(-6).toUpperCase()}-${Date.now()}`;

    const document = await prisma.document.create({
      data: {
        tenantId: session.tenantId,
        uniqueId,
        templateId: template.id,
        title: `Contrato de Servicio — ${session.accountName}`,
        content: template.content as Prisma.InputJsonValue,
        module: "crm",
        category: "contrato_cliente",
        status: "draft",
        portalVisible: true,
        signatureStatus: "pending",
        createdBy: session.contactId,
      },
    });

    // ── 5. Create DocAssociation ──────────────────────────────
    await prisma.docAssociation.create({
      data: {
        documentId: document.id,
        entityType: "crm_account",
        entityId: session.accountId,
        role: "contract",
      },
    });

    // ── 6. Create DocSignatureRequest ─────────────────────────
    const signatureRequest = await prisma.docSignatureRequest.create({
      data: {
        tenantId: session.tenantId,
        documentId: document.id,
        status: "pending",
        message: "Por favor firma el contrato de servicio",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        createdBy: session.contactId,
      },
    });

    // ── 7. Create DocSignatureRecipient ───────────────────────
    const recipientToken = randomUUID();

    await prisma.docSignatureRecipient.create({
      data: {
        requestId: signatureRequest.id,
        token: recipientToken,
        name: `${session.firstName} ${session.lastName}`.trim(),
        email: session.email ?? "",
        rut: companyRut,
        role: "signer",
        signingOrder: 1,
        status: "pending",
      },
    });

    return NextResponse.json({
      success: true,
      documentId: document.id,
      signatureToken: recipientToken,
    });
  } catch (error) {
    console.error("[Portal Cliente] contract-data error:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
