import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView, requireCrmEdit } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import { uploadFile, getFileUrl } from "@/lib/storage";
import { requireTenantModule } from "@/lib/require-module";
import {
  CONTRACT_CATEGORIES,
  uploadContractSchema,
  computeExpirationFromDuration,
} from "@/lib/validations/docs";

const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * GET /api/crm/accounts/[id]/contracts
 * List all contracts for an account (no change from previous behavior).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId } = await params;

  try {
    const documents = await prisma.document.findMany({
      where: {
        tenantId: ctx.tenantId,
        module: "crm",
        category: { in: [...CONTRACT_CATEGORIES] },
        associations: {
          some: { entityType: "crm_account", entityId: accountId },
        },
      },
      include: {
        template: { select: { id: true, name: true } },
        associations: {
          where: { entityType: { in: ["crm_account", "crm_deal", "crm_installation"] } },
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
      // Order by urgency: nearest expiration first, then by createdAt.
      orderBy: [
        { expirationDate: { sort: "asc", nulls: "last" } },
        { createdAt: "desc" },
      ],
    });

    // Enrich with deal info
    const dealIds = documents.flatMap((d) =>
      d.associations
        .filter((a) => a.entityType === "crm_deal")
        .map((a) => a.entityId),
    );
    const deals =
      dealIds.length > 0
        ? await prisma.crmDeal.findMany({
            where: { id: { in: dealIds }, tenantId: ctx.tenantId },
            select: { id: true, title: true },
          })
        : [];
    const dealMap = new Map(deals.map((d) => [d.id, d]));

    // Cashflow items vinculados (los que creamos al subir con `addToCashflow`).
    // Indexamos por sourceRefId = document.id para mostrar el monto mensual
    // en la tarjeta del contrato.
    const cashflowItems = await prisma.financeCashflowItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        source: "OTHER",
        sourceRefId: { in: documents.map((d) => d.id) },
        isActive: true,
      },
      select: {
        id: true,
        sourceRefId: true,
        amount: true,
        currency: true,
        dayOfMonth: true,
        installationId: true,
      },
    });
    const cashflowByDoc = new Map(
      cashflowItems.map((i) => [i.sourceRefId ?? "", i]),
    );

    const data = documents.map((doc) => {
      const dealAssoc = doc.associations.find(
        (a) => a.entityType === "crm_deal",
      );
      const deal = dealAssoc ? dealMap.get(dealAssoc.entityId) : null;
      const sigReq = doc.signatureRequests[0] ?? null;

      // Derive: signature kind = internal request | external (manual upload) | none
      const signatureStatus =
        sigReq?.status ??
        (doc.signatureStatus === "external" ? "external" : null);

      const cashflow = cashflowByDoc.get(doc.id);
      const installAssocs = doc.associations.filter(
        (a) => a.entityType === "crm_installation",
      );
      const installAssoc = installAssocs[0];
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
        signedAt: doc.signedAt,
        signedBy: doc.signedBy,
        signatureStatus,
        signatureRecipients: sigReq?.recipients ?? [],
        createdAt: doc.createdAt,
        installationId: installAssoc?.entityId ?? null,
        installationIds: installAssocs.map((a) => a.entityId),
        cashflow: cashflow
          ? {
              itemId: cashflow.id,
              amountClp: Number(cashflow.amount),
              currency: cashflow.currency,
              dayOfMonth: cashflow.dayOfMonth,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching account contracts:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener contratos" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/crm/accounts/[id]/contracts
 *
 * Single mode: upload an externally signed/produced contract PDF.
 * To generate a new contract from a template, use the CPQ flow:
 *   POST /api/cpq/quotes/[id]/generate-contract
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmEdit(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id: accountId } = await params;
  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const isMultipart = contentType.includes("multipart/form-data");

  if (!isJson && !isMultipart) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Solo se acepta multipart/form-data o application/json. Para generar un contrato desde plantilla, usa el flujo CPQ desde una cotización.",
      },
      { status: 400 },
    );
  }

  try {
    // Verify account exists and belongs to tenant
    const account = await prisma.crmAccount.findFirst({
      where: { id: accountId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta no encontrada" },
        { status: 404 },
      );
    }

    // Extraer campos según content-type. En el flujo JSON el archivo ya
    // está en R2 (subida directa vía presigned URL — evita el límite de
    // body de Vercel) y sólo recibimos `storageKey`.
    let rawFields: Record<string, unknown> = {};
    let file: File | null = null;
    let presignedStorageKey: string | null = null;

    if (isMultipart) {
      const formData = await request.formData();
      file = formData.get("file") as File | null;
      for (const [key, value] of formData.entries()) {
        if (key === "file") continue;
        if (typeof value === "string") {
          rawFields[key] = value === "" ? undefined : value;
        }
      }
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      presignedStorageKey =
        typeof body.storageKey === "string" ? body.storageKey : null;
      rawFields = { ...body };
      delete rawFields.storageKey;
      delete rawFields.fileName;
      delete rawFields.fileSize;
    }

    const parsed = uploadContractSchema.safeParse(rawFields);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos inválidos",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const {
      title,
      category,
      effectiveDate,
      expirationDate: explicitExpiration,
      durationMonths,
      alertDaysBefore,
      signedExternally,
      signedAt,
      signedBy,
      notes,
      installationId,
      installationIds,
      addToCashflow,
      monthlyAmountClp,
      currency,
      paymentDay,
    } = parsed.data;

    // Multi-instalación (Fase C): si vienen N, las usamos. Si sólo viene
    // el legacy `installationId`, lo envolvemos como array de 1.
    const installationList =
      installationIds && installationIds.length > 0
        ? installationIds
        : installationId
          ? [installationId]
          : [];
    // El item de cashflow guarda installationId sólo si es 1 instalación.
    // Con 2+, queda null (vive a nivel cuenta) y la UI lista las
    // instalaciones desde las DocAssociations.
    const itemInstallationId =
      installationList.length === 1 ? installationList[0] : null;

    // Derive expirationDate: explicit value wins; else compute from effective + duration.
    const computedExpiration =
      explicitExpiration ??
      computeExpirationFromDuration(effectiveDate, durationMonths);

    let uploadedPublicUrl: string;
    if (isMultipart) {
      if (!file) {
        return NextResponse.json(
          { success: false, error: "Archivo PDF requerido" },
          { status: 400 },
        );
      }
      if (file.size === 0) {
        return NextResponse.json(
          { success: false, error: "El archivo está vacío" },
          { status: 400 },
        );
      }
      if (file.size > MAX_PDF_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: "El archivo supera el límite de 25 MB" },
          { status: 400 },
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const header = buffer.subarray(0, 5).toString("ascii");
      if (header !== "%PDF-") {
        return NextResponse.json(
          { success: false, error: "El archivo no es un PDF válido" },
          { status: 400 },
        );
      }
      const uploaded = await uploadFile(
        buffer,
        file.name,
        file.type || "application/pdf",
        "contracts",
        ctx.tenantId,
      );
      uploadedPublicUrl = uploaded.publicUrl;
    } else {
      if (!presignedStorageKey) {
        return NextResponse.json(
          {
            success: false,
            error: "storageKey requerido cuando se usa subida pre-firmada",
          },
          { status: 400 },
        );
      }
      // Validamos que la key sea del tenant + el prefix esperado para
      // evitar que un atacante reuse keys de otro tenant.
      const expectedPrefix = `${ctx.tenantId}/contracts/`;
      if (!presignedStorageKey.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { success: false, error: "storageKey no pertenece a este tenant" },
          { status: 400 },
        );
      }
      uploadedPublicUrl = getFileUrl(presignedStorageKey);
    }

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId: ctx.tenantId,
          title,
          content: { type: "doc", content: [] },
          module: "crm",
          category,
          status: "active", // uploaded PDFs are considered live
          effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
          expirationDate: computedExpiration ? new Date(computedExpiration) : null,
          alertDaysBefore,
          pdfUrl: uploadedPublicUrl,
          portalVisible: true,
          // External-signature metadata
          signatureStatus: signedExternally ? "external" : null,
          signedAt: signedExternally && signedAt ? new Date(signedAt) : null,
          signedBy: signedExternally ? signedBy ?? null : null,
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

      // Asociaciones N:M con instalaciones (Fase C). Cada instalación
      // queda como DocAssociation(entityType=crm_installation), lo que
      // permite navegar desde el detalle de cada instalación de vuelta
      // al contrato y agruparlas en la UI.
      if (installationList.length > 0) {
        await tx.docAssociation.createMany({
          data: installationList.map((instId) => ({
            documentId: doc.id,
            entityType: "crm_installation",
            entityId: instId,
            role: "related",
          })),
          skipDuplicates: true,
        });
      }

      // Vinculación con Flujo de Caja: si el usuario marcó el toggle, se
      // crea un FinanceCashflowItem mensual con sourceRefId=document.id.
      // source=OTHER porque no es CpqQuote (que es lo que maneja
      // sales-contract-sync). La categoría es la misma ING_VENTA_CONTRATO
      // para que aparezca en la sección "Ventas por contrato".
      if (addToCashflow && monthlyAmountClp && paymentDay !== null && paymentDay !== undefined && effectiveDate) {
        const cat = await tx.financeCashflowCategory.findFirst({
          where: { tenantId: ctx.tenantId, code: "ING_VENTA_CONTRATO", isActive: true },
          select: { id: true },
        });
        if (cat) {
          const dom =
            paymentDay === -1 ? -1 : Math.min(Math.max(paymentDay, 1), 28);
          await tx.financeCashflowItem.create({
            data: {
              tenantId: ctx.tenantId,
              createdBy: ctx.userId ?? undefined,
              categoryId: cat.id,
              kind: "INCOME",
              source: "OTHER",
              sourceRefId: doc.id,
              name: title,
              description: `Contrato ${title}`,
              amount: monthlyAmountClp,
              currency: currency,
              recurrence: "MONTHLY",
              dayOfMonth: dom,
              startDate: new Date(effectiveDate),
              endDate: computedExpiration ? new Date(computedExpiration) : null,
              installationId: itemInstallationId,
              crmAccountId: accountId,
              isActive: true,
            },
          });
        }
      }

      await tx.docHistory.create({
        data: {
          documentId: doc.id,
          action: "created",
          details: {
            mode: "upload",
            fileName: file?.name ?? presignedStorageKey?.split("/").pop() ?? "—",
            fileSize: file?.size ?? null,
            category,
            durationMonths: durationMonths ?? null,
            computedExpiration: !explicitExpiration && computedExpiration ? true : false,
            signedExternally,
            notes: notes ?? null,
          },
          createdBy: ctx.userId,
        },
      });

      if (signedExternally) {
        await tx.docHistory.create({
          data: {
            documentId: doc.id,
            action: "external_signature_recorded",
            details: { signedAt, signedBy },
            createdBy: ctx.userId,
          },
        });
      }

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
          expirationDate: document.expirationDate,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error creating contract:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear contrato" },
      { status: 500 },
    );
  }
}
