import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { cleanRut, toSiiRut, formatRut } from "@/lib/chile-rut";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        lines: true,
        // Notas de Crédito / Débito que referencian a este DTE (lado
        // INCOMING). Filtramos las anuladas — si una NC fue anulada con
        // ND, no debe contar como "factura ya tiene NC".
        referencedBy: {
          where: {
            dteType: { in: [56, 61] }, // ND o NC
            siiStatus: { not: "ANNULLED" },
          },
          select: {
            id: true,
            dteType: true,
            folio: true,
            date: true,
            netAmount: true,
            totalAmount: true,
            siiStatus: true,
            referenceCode: true,
            referenceReason: true,
            createdAt: true,
          },
          orderBy: { date: "desc" },
        },
      },
    });

    if (!dte) {
      return NextResponse.json(
        { success: false, error: "DTE no encontrado" },
        { status: 404 }
      );
    }

    // Enriquecimiento de centro de costo. crmAccountId/installationId son
    // FKs lógicas sin @relation en el schema, así que las resolvemos a mano.
    // Fallback por RUT cuando crmAccountId está vacío: muchos DTEs históricos
    // no llevan crmAccountId pero sí receiverRut → matcheamos por RUT contra
    // CrmAccount.
    const [crmAccount, crmAccountRutCandidates, installation, lastReconciliation] =
      await Promise.all([
        dte.crmAccountId
          ? prisma.crmAccount.findFirst({
              where: { id: dte.crmAccountId, tenantId: ctx.tenantId },
              select: { id: true, name: true, legalName: true, rut: true },
            })
          : Promise.resolve(null),
        // Fallback por RUT sin crmAccountId. La igualdad exacta fallaba cuando
        // el `receiverRut` guardado y el `rut` de la cuenta diferían en formato
        // o traían caracteres invisibles del XML SII. Traemos candidatos por
        // las variantes canónicas y elegimos abajo con `cleanRut` (JS).
        !dte.crmAccountId && dte.receiverRut
          ? prisma.crmAccount.findMany({
              where: {
                rut: {
                  in: Array.from(
                    new Set([
                      dte.receiverRut,
                      toSiiRut(dte.receiverRut),
                      formatRut(dte.receiverRut),
                      cleanRut(dte.receiverRut),
                    ]),
                  ).filter((r) => r.length > 0),
                },
                tenantId: ctx.tenantId,
              },
              select: { id: true, name: true, legalName: true, rut: true },
            })
          : Promise.resolve([]),
        dte.installationId
          ? prisma.crmInstallation.findFirst({
              where: { id: dte.installationId, tenantId: ctx.tenantId },
              select: { id: true, name: true, commune: true },
            })
          : Promise.resolve(null),
        // Última conciliación: último FinancePaymentAllocation que apunte
        // a este DTE, junto con su FinancePaymentRecord y la bank tx.
        prisma.financePaymentAllocation.findFirst({
          where: { dteId: dte.id },
          select: {
            payment: {
              select: {
                id: true,
                code: true,
                date: true,
                status: true,
                bankTransaction: {
                  select: {
                    id: true,
                    transactionDate: true,
                    reference: true,
                    description: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    // Elegir el candidato cuyo RUT normalizado coincide con el del receptor.
    const receiverKey = dte.receiverRut ? cleanRut(dte.receiverRut) : "";
    const crmAccountByRut =
      receiverKey.length > 0
        ? crmAccountRutCandidates.find((a) => cleanRut(a.rut ?? "") === receiverKey) ?? null
        : null;
    const enrichedAccount = crmAccount ?? crmAccountByRut;
    const lastReconciliationPayload = lastReconciliation
      ? {
          paymentId: lastReconciliation.payment.id,
          paymentCode: lastReconciliation.payment.code,
          paymentDate: lastReconciliation.payment.date.toISOString(),
          paymentStatus: lastReconciliation.payment.status,
          bankTransactionId:
            lastReconciliation.payment.bankTransaction?.id ?? null,
          bankTransactionDate:
            lastReconciliation.payment.bankTransaction?.transactionDate.toISOString() ??
            null,
          bankTransactionReference:
            lastReconciliation.payment.bankTransaction?.reference ?? null,
          bankTransactionDescription:
            lastReconciliation.payment.bankTransaction?.description ?? null,
        }
      : null;

    // Calcular agregados de NCs asociadas para que la UI muestre estado
    // sin tener que refacer el cálculo. `hasFullAnnulment` es lo que
    // bloquea la UI/backend de emitir otra NC tipo CodRef=1. `creditedNet`
    // es la suma de montos netos ya acreditados (CodRef=1 o 3 con estado
    // no rechazado), útil para mostrar saldo o limitar nuevas NC parciales.
    const ncs = dte.referencedBy ?? [];
    const activeForCredit = ncs.filter(
      (n) =>
        n.dteType === 61 &&
        ["ACCEPTED", "PENDING", "SENT", "WITH_OBJECTIONS"].includes(n.siiStatus),
    );
    const hasFullAnnulment = activeForCredit.some((n) => n.referenceCode === 1);
    const creditedNet = activeForCredit.reduce(
      (acc, n) => acc + Number(n.netAmount ?? 0),
      0,
    );

    // Precalcular `hasXml` antes de serializar a JSON. El campo
    // `dteXml` es Prisma `Bytes` (Buffer): cuando Next.js lo serializa,
    // queda como objeto JSON (`{ type: "Buffer", data: [...] }`) y el
    // cliente NO puede medir `.length` sobre eso → calcula `hasXml` mal
    // y muestra falso "Sin XML local" aunque la BD lo tenga (causa raíz
    // del bug "no puedo ceder a factoring después de emitir"). Excluimos
    // el buffer del payload (queda en el server) y mandamos boolean.
    const hasXml = dte.dteXml !== null && dte.dteXml.length > 0;
    const { dteXml: _dteXml, ...dteRest } = dte;
    void _dteXml;

    return NextResponse.json({
      success: true,
      data: {
        ...dteRest,
        hasXml,
        creditNotes: ncs,
        hasFullAnnulment,
        creditedNet,
        crmAccount: enrichedAccount,
        installation,
        lastReconciliation: lastReconciliationPayload,
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error getting DTE:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener DTE" },
      { status: 500 }
    );
  }
}
