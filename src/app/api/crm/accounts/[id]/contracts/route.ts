import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { resolveDocument, buildEmpresaEntityData, buildQuoteEnrichedData, buildContractEntityData } from "@/lib/docs/token-resolver";
import { uploadFile } from "@/lib/storage";

/** Contract-type categories in CRM module */
const CONTRACT_CATEGORIES = [
  "contrato_cliente",
  "contrato_servicio",
  "contrato_confidencialidad",
  "acuerdo_nivel_servicio",
  "adendum",
];

/**
 * GET /api/crm/accounts/[id]/contracts
 * List all contracts for an account.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: accountId } = await params;

  try {
    // Find documents associated with this account that are contract-type
    const documents = await prisma.document.findMany({
      where: {
        tenantId: ctx.tenantId,
        module: "crm",
        category: { in: CONTRACT_CATEGORIES },
        associations: {
          some: {
            entityType: "crm_account",
            entityId: accountId,
          },
        },
      },
      include: {
        template: { select: { id: true, name: true } },
        associations: {
          where: {
            entityType: { in: ["crm_account", "crm_deal"] },
          },
        },
        signatureRequests: {
          select: {
            id: true,
            status: true,
            completedAt: true,
            recipients: {
              select: { id: true, name: true, email: true, status: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Enrich with deal info
    const dealIds = documents.flatMap((d) =>
      d.associations
        .filter((a) => a.entityType === "crm_deal")
        .map((a) => a.entityId)
    );
    const deals =
      dealIds.length > 0
        ? await prisma.crmDeal.findMany({
            where: { id: { in: dealIds }, tenantId: ctx.tenantId },
            select: { id: true, title: true },
          })
        : [];
    const dealMap = new Map(deals.map((d) => [d.id, d]));

    const data = documents.map((doc) => {
      const dealAssoc = doc.associations.find(
        (a) => a.entityType === "crm_deal"
      );
      const deal = dealAssoc ? dealMap.get(dealAssoc.entityId) : null;
      const sigReq = doc.signatureRequests[0] ?? null;

      return {
        id: doc.id,
        uniqueId: doc.uniqueId,
        title: doc.title,
        category: doc.category,
        status: doc.status,
        effectiveDate: doc.effectiveDate,
        expirationDate: doc.expirationDate,
        alertDaysBefore: doc.alertDaysBefore,
        pdfUrl: doc.pdfUrl,
        portalVisible: doc.portalVisible,
        templateName: doc.template?.name ?? null,
        deal: deal ? { id: deal.id, title: deal.title } : null,
        signatureStatus: sigReq?.status ?? null,
        signatureRecipients: sigReq?.recipients ?? [],
        createdAt: doc.createdAt,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching account contracts:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contratos" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crm/accounts/[id]/contracts
 * Create a contract — either from template or by uploading a PDF.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { id: accountId } = await params;

  try {
    const contentType = request.headers.get("content-type") ?? "";

    // ─── Mode: Upload PDF ─────────────────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const title = (formData.get("title") as string) ?? "";
      const category = (formData.get("category") as string) ?? "contrato_cliente";
      const effectiveDate = formData.get("effectiveDate") as string | null;
      const expirationDate = formData.get("expirationDate") as string | null;
      const alertDaysBefore = Number(formData.get("alertDaysBefore")) || 30;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "Archivo PDF requerido" },
          { status: 400 }
        );
      }
      if (!title.trim()) {
        return NextResponse.json(
          { success: false, error: "Título requerido" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadFile(
        buffer,
        file.name,
        file.type || "application/pdf",
        "contracts"
      );

      const document = await prisma.$transaction(async (tx) => {
        const doc = await tx.document.create({
          data: {
            tenantId: ctx.tenantId,
            title: title.trim(),
            content: { type: "doc", content: [] },
            module: "crm",
            category,
            status: "active",
            effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
            expirationDate: expirationDate ? new Date(expirationDate) : null,
            alertDaysBefore,
            pdfUrl: uploaded.publicUrl,
            createdBy: ctx.userId,
          },
        });

        await tx.docAssociation.create({
          data: {
            documentId: doc.id,
            entityType: "crm_account",
            entityId: accountId,
            role: "primary",
          },
        });

        await tx.docHistory.create({
          data: {
            documentId: doc.id,
            action: "created",
            details: { mode: "upload", fileName: file.name },
            createdBy: ctx.userId,
          },
        });

        return doc;
      });

      return NextResponse.json(
        { success: true, data: { id: document.id, uniqueId: document.uniqueId } },
        { status: 201 }
      );
    }

    // ─── Mode: Generate from Template ─────────────────────────────
    const body = await request.json();
    const {
      templateId,
      dealId,
      title,
      effectiveDate,
      expirationDate,
      alertDaysBefore = 30,
    } = body;

    if (!templateId) {
      return NextResponse.json(
        { success: false, error: "Template requerido" },
        { status: 400 }
      );
    }
    if (!dealId) {
      return NextResponse.json(
        { success: false, error: "Negocio requerido" },
        { status: 400 }
      );
    }

    // Fetch template
    const template = await prisma.docTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenantId },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template no encontrado" },
        { status: 404 }
      );
    }

    // Fetch deal (must be won and belong to this account)
    const deal = await prisma.crmDeal.findFirst({
      where: {
        id: dealId,
        accountId,
        tenantId: ctx.tenantId,
        stage: { isClosedWon: true },
      },
      include: {
        stage: true,
        quotes: { select: { quoteId: true } },
      },
    });
    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio ganado no encontrado para esta cuenta" },
        { status: 404 }
      );
    }

    // Resolve the active quote
    const activeQuoteId =
      deal.activeQuotationId ?? deal.quotes[0]?.quoteId ?? null;

    // Fetch all entity data in parallel
    const [account, primaryContact, empresaSettings, quoteData] =
      await Promise.all([
        prisma.crmAccount.findFirst({
          where: { id: accountId, tenantId: ctx.tenantId },
          include: {
            installations: {
              where: { isActive: true },
              select: { id: true, name: true, address: true, commune: true, city: true },
              take: 1,
            },
          },
        }),
        prisma.crmContact.findFirst({
          where: { accountId, tenantId: ctx.tenantId, isPrimary: true },
        }),
        prisma.setting.findMany({
          where: {
            tenantId: ctx.tenantId,
            key: { startsWith: "empresa." },
          },
        }),
        activeQuoteId ? buildQuoteEnrichedData(activeQuoteId) : null,
      ]);

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    const installation = account.installations[0] ?? null;

    // Build entities for token resolution
    const entities = {
      empresa: buildEmpresaEntityData(empresaSettings),
      account: account as any,
      contact: primaryContact
        ? {
            ...primaryContact,
            fullName: `${primaryContact.firstName ?? ""} ${primaryContact.lastName ?? ""}`.trim(),
          }
        : null,
      installation: installation as any,
      deal: deal as any,
      quote: quoteData ?? null,
      contract: buildContractEntityData({
        title: title || `Contrato - ${account.name}`,
        effectiveDate,
        expirationDate,
        durationMonths:
          effectiveDate && expirationDate
            ? Math.round(
                (new Date(expirationDate).getTime() -
                  new Date(effectiveDate).getTime()) /
                  (1000 * 60 * 60 * 24 * 30)
              )
            : null,
      }),
    };

    // Resolve tokens in template content
    const { resolvedContent, tokenValues } = resolveDocument(
      template.content,
      entities
    );

    // Create document in transaction
    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          templateId: template.id,
          title: (title || `Contrato - ${account.name}`).trim(),
          content: resolvedContent,
          tokenValues,
          module: "crm",
          category: template.category || "contrato_cliente",
          status: "draft",
          effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
          expirationDate: expirationDate ? new Date(expirationDate) : null,
          alertDaysBefore,
          createdBy: ctx.userId,
        },
      });

      // Create associations
      await tx.docAssociation.createMany({
        data: [
          {
            documentId: doc.id,
            entityType: "crm_account",
            entityId: accountId,
            role: "primary",
          },
          {
            documentId: doc.id,
            entityType: "crm_deal",
            entityId: dealId,
            role: "related",
          },
        ],
      });

      // Audit trail
      await tx.docHistory.create({
        data: {
          documentId: doc.id,
          action: "created",
          details: {
            mode: "template",
            templateId: template.id,
            templateName: template.name,
            dealId,
            dealTitle: deal.title,
            quoteId: activeQuoteId,
          },
          createdBy: ctx.userId,
        },
      });

      return doc;
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: document.id,
          uniqueId: document.uniqueId,
          title: document.title,
          status: document.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating contract:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear contrato" },
      { status: 500 }
    );
  }
}
