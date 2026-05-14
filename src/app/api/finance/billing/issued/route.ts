import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { issueDteSchema } from "@/lib/validations/finance";
import { issueDte } from "@/modules/finance/billing/dte-issuer.service";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    // Cap defensivo: la UI solo ofrece hasta 200, pero un cliente
    // mal-formado podría pedir un take enorme. 500 es suficiente para
    // exports y recolección de filtros sin saturar el connection pool.
    const requestedPageSize = parseInt(url.searchParams.get("pageSize") || "20");
    const pageSize = Math.min(
      Math.max(1, Number.isFinite(requestedPageSize) ? requestedPageSize : 20),
      500
    );
    const periodo = url.searchParams.get("periodo") || undefined;
    // status=draft → solo DRAFT. status=all → DRAFT + emitidos.
    // sin status (default) → solo emitidos (excluye DRAFT).
    const statusFilter = url.searchParams.get("status") || undefined;
    // Búsqueda por nombre/RUT del receptor o folio. Server-side para que
    // la búsqueda atraviese todas las páginas, no solo la cargada.
    const search = url.searchParams.get("search")?.trim() || undefined;
    // Filtro por centro de costo (UX 2.6):
    //   - ?accountId=<uuid> → DTEs asignados a esa cuenta CRM.
    //   - ?accountId=NONE   → DTEs sin centro de costo asignado.
    //   - sin param          → todos.
    const accountId = url.searchParams.get("accountId") || undefined;
    const installationId = url.searchParams.get("installationId") || undefined;
    const sort = url.searchParams.get("sort") || "date_desc";

    // Filtros server-side adicionales (post 2026-05): antes vivían
    // sólo en cliente sobre la página actual, lo que hacía que `total`
    // y la paginación quedaran desincronizados. Aceptan listas
    // separadas por coma: `?paymentStatus=PAID,PARTIAL`.
    const csv = (k: string) =>
      (url.searchParams.get(k) ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    const paymentStatuses = csv("paymentStatus");
    const dteTypes = csv("dteType")
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n));
    const siiStatuses = csv("siiStatus");
    const flag = (k: string) => url.searchParams.get(k) === "1";
    const onlyCeded = flag("onlyCeded");
    const onlyWithCreditNotes = flag("onlyWithCreditNotes");
    const onlyEmailFailed = flag("onlyEmailFailed");
    const excludeDrafts = flag("excludeDrafts");
    const amountMinRaw = url.searchParams.get("amountMin");
    const amountMaxRaw = url.searchParams.get("amountMax");
    const amountMin = amountMinRaw != null ? Number(amountMinRaw) : null;
    const amountMax = amountMaxRaw != null ? Number(amountMaxRaw) : null;

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
    };
    if (accountId === "NONE") {
      where.crmAccountId = null;
    } else if (accountId && accountId !== "ALL") {
      where.crmAccountId = accountId;
    }
    if (installationId === "NONE") {
      where.installationId = null;
    } else if (installationId && installationId !== "ALL") {
      where.installationId = installationId;
    }
    // Drafts viven en la misma lista que los emitidos (UX 2026-05): el
    // usuario los ve marcados con badge "Borrador" en DTEs Emitidos. Si
    // se necesita la vista clásica que excluye drafts pasar
    // ?status=issued; ?status=draft trae solo borradores.
    // El flag ?excludeDrafts=1 (combinable con otros filtros) reemplaza
    // el toggle "Excluir borradores" del cliente.
    if (statusFilter === "draft") {
      where.siiStatus = "DRAFT";
    } else if (statusFilter === "issued") {
      where.siiStatus = { not: "DRAFT" };
    }
    // Flag para conciliación bancaria: cuando está activo, además de los
    // paymentStatus pedidos (típicamente UNPAID/PARTIAL/OVERDUE) también
    // incluye PAID sin link a movimiento bancario (caso bulk-mark-paid o
    // import Zoho — la factura figura cobrada pero falta cerrar el ciclo
    // en banca). Lo detectamos vía `paymentAllocations.none.payment.bankTransactionId IS NOT NULL`.
    const includePaidUnreconciled = flag("includePaidUnreconciled");
    if (paymentStatuses.length > 0) {
      if (includePaidUnreconciled && !paymentStatuses.includes("PAID")) {
        where.OR = [
          { paymentStatus: { in: paymentStatuses } },
          {
            paymentStatus: "PAID",
            paymentAllocations: {
              none: { payment: { bankTransactionId: { not: null } } },
            },
          },
        ];
      } else {
        where.paymentStatus = { in: paymentStatuses };
      }
    } else if (includePaidUnreconciled) {
      where.paymentAllocations = {
        none: { payment: { bankTransactionId: { not: null } } },
      };
    }
    if (dteTypes.length > 0) {
      where.dteType = { in: dteTypes };
    }
    if (siiStatuses.length > 0) {
      // Si ya hay un filtro de siiStatus por statusFilter, lo combinamos
      // con AND. (Ej: status=issued + siiStatus=ACCEPTED.)
      const prev = where.siiStatus;
      if (prev && typeof prev === "object" && "not" in prev) {
        where.AND = [
          ...(Array.isArray(where.AND) ? (where.AND as unknown[]) : []),
          { siiStatus: prev },
          { siiStatus: { in: siiStatuses } },
        ];
        delete where.siiStatus;
      } else {
        where.siiStatus = { in: siiStatuses };
      }
    } else if (excludeDrafts && !statusFilter) {
      // No double-filter si statusFilter ya lo excluyó.
      where.siiStatus = { not: "DRAFT" };
    }
    if (amountMin != null && Number.isFinite(amountMin)) {
      where.totalAmount = { ...(where.totalAmount as object | undefined), gte: amountMin };
    }
    if (amountMax != null && Number.isFinite(amountMax)) {
      where.totalAmount = { ...(where.totalAmount as object | undefined), lte: amountMax };
    }
    if (onlyEmailFailed) {
      where.emailStatus = "FAILED";
    }
    // onlyCeded y onlyWithCreditNotes requieren joins por relación
    // implícita; los aplicamos vía sub-queries.
    if (onlyCeded) {
      const cedidos = await prisma.financeFactoringOperation.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"] },
        },
        select: { dteId: true },
      });
      const cedidosIds = Array.from(
        new Set(cedidos.map((c) => c.dteId).filter((x): x is string => !!x))
      );
      where.id = { in: cedidosIds };
    }
    if (onlyWithCreditNotes) {
      const ncs = await prisma.financeDte.findMany({
        where: {
          tenantId: ctx.tenantId,
          dteType: 61,
          siiStatus: { not: "ANNULLED" },
          referenceDteId: { not: null },
        },
        select: { referenceDteId: true },
      });
      const refIds = Array.from(
        new Set(
          ncs.map((n) => n.referenceDteId).filter((x): x is string => !!x)
        )
      );
      // Combinar con onlyCeded si ambos están activos: intersección.
      if (onlyCeded && Array.isArray((where.id as { in?: string[] })?.in)) {
        const a = new Set(((where.id as { in: string[] }).in));
        const intersection = refIds.filter((id) => a.has(id));
        where.id = { in: intersection };
      } else {
        where.id = { in: refIds };
      }
    }
    if (search) {
      // Búsqueda fuzzy global: folio, RUT (con/sin guión), razón social,
      // nombre de fantasía del CRM, monto exacto, o rango "1000-5000".
      const rutNeedle = search.replace(/[.\-\s]/g, "");
      const orClauses: Record<string, unknown>[] = [
        { receiverName: { contains: search, mode: "insensitive" } },
        { receiverRut: { contains: rutNeedle, mode: "insensitive" } },
      ];

      // Búsqueda por nombre de fantasía / razón social en CRM accounts.
      // crmAccountId es FK lógica (sin @relation), por eso resolvemos
      // los matching IDs en una sub-query y los inyectamos al OR.
      // Además matcheamos por receiverRut == account.rut para cubrir
      // DTEs sin crmAccountId poblado (importados o emitidos antes de
      // la integración con CRM).
      const matchingAccounts = await prisma.crmAccount.findMany({
        where: {
          tenantId: ctx.tenantId,
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { legalName: { contains: search, mode: "insensitive" } },
          ],
        },
        select: { id: true, rut: true },
        take: 500,
      });
      if (matchingAccounts.length > 0) {
        orClauses.push({
          crmAccountId: { in: matchingAccounts.map((a) => a.id) },
        });
        const matchingRuts = matchingAccounts
          .map((a) => a.rut)
          .filter((r): r is string => !!r);
        if (matchingRuts.length > 0) {
          orClauses.push({ receiverRut: { in: matchingRuts } });
        }
      }

      // Folio exacto si el input es íntegro (sin punto, sin guión, sin comas).
      if (/^\d+$/.test(search.trim())) {
        const folioNum = parseInt(search.trim(), 10);
        if (!Number.isNaN(folioNum)) orClauses.push({ folio: folioNum });
      }

      // Monto exacto: el input es un número (con puntos como sep. de miles).
      const amountStr = search.replace(/[.\s]/g, "").replace(",", ".");
      if (/^\d+(\.\d+)?$/.test(amountStr)) {
        const amountNum = parseFloat(amountStr);
        if (!Number.isNaN(amountNum) && amountNum > 0) {
          orClauses.push({ totalAmount: amountNum });
        }
      }

      // Rango de monto: "1000-5000" → totalAmount entre min y max.
      const rangeMatch = search.match(/^([\d.]+)\s*-\s*([\d.]+)$/);
      if (rangeMatch) {
        const min = parseFloat(rangeMatch[1].replace(/\./g, ""));
        const max = parseFloat(rangeMatch[2].replace(/\./g, ""));
        if (!Number.isNaN(min) && !Number.isNaN(max) && min <= max) {
          orClauses.push({ totalAmount: { gte: min, lte: max } });
        }
      }

      where.OR = orClauses;
    }
    if (periodo === "CURRENT_MONTH") {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const to = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      where.date = { gte: from, lt: to };
    } else if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
      const [y, m] = periodo.split("-").map((s) => parseInt(s, 10));
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      where.date = { gte: from, lt: to };
    }

    const dtes = await prisma.financeDte.findMany({
      where,
      orderBy: getDteOrderBy(sort),
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: { lines: true },
    });

    const total = await prisma.financeDte.count({ where });

    // Enriquecer con cliente CRM + instalación (centro de costo).
    // Fallback por RUT: muchos DTEs históricos no tienen `crmAccountId`
    // poblado (importados del SII o emitidos antes de la integración con
    // CRM). Si encontramos un CrmAccount con el mismo `receiverRut`,
    // usamos ese para tener el nombre de fantasía visible.
    const accountIds = Array.from(
      new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => !!v)),
    );
    const receiverRuts = Array.from(
      new Set(dtes.map((d) => d.receiverRut).filter((v): v is string => !!v)),
    );
    const installationIds = Array.from(
      new Set(dtes.map((d) => d.installationId).filter((v): v is string => !!v)),
    );
    const [accountsById, accountsByRut, installations] = await Promise.all([
      accountIds.length > 0
        ? prisma.crmAccount.findMany({
            where: { id: { in: accountIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true, legalName: true, rut: true },
          })
        : Promise.resolve([]),
      receiverRuts.length > 0
        ? prisma.crmAccount.findMany({
            where: { rut: { in: receiverRuts }, tenantId: ctx.tenantId },
            select: { id: true, name: true, legalName: true, rut: true },
          })
        : Promise.resolve([]),
      installationIds.length > 0
        ? prisma.crmInstallation.findMany({
            where: { id: { in: installationIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true, commune: true },
          })
        : Promise.resolve([]),
    ]);
    const accountById = new Map(accountsById.map((a) => [a.id, a]));
    const accountByRut = new Map(
      accountsByRut.filter((a) => !!a.rut).map((a) => [a.rut as string, a]),
    );
    const installationMap = new Map(installations.map((i) => [i.id, i]));

    // Factoring: marcar cuáles son cedibles + adjuntar cesión activa si existe.
    // Tipos cedibles según Ley 19.983: 33, 34, 43, 46.
    const CEDIBLE_TYPES = new Set([33, 34, 43, 46]);
    const dteIds = dtes.map((d) => d.id);
    const activeCessions = dteIds.length > 0
      ? await prisma.financeFactoringOperation.findMany({
          where: {
            tenantId: ctx.tenantId,
            dteId: { in: dteIds },
            status: { in: ["SUBMITTED", "APPROVED", "FUNDED", "COLLECTED", "CLOSED"] },
          },
          select: {
            id: true,
            code: true,
            status: true,
            dteId: true,
            factoringCompany: true,
          },
        })
      : [];
    const cessionByDte = new Map(activeCessions.map((c) => [c.dteId, c]));

    // NCs asociadas: para cada DTE de la lista, buscar las NCs que lo
    // referencian (lado INCOMING). Una sola query batch por dteIds para
    // no hacer N+1. Solo nos interesan NCs (61) no anuladas — si una NC
    // se anuló con ND, no cuenta como "ya tiene NC".
    const linkedCreditNotes = dteIds.length > 0
      ? await prisma.financeDte.findMany({
          where: {
            tenantId: ctx.tenantId,
            dteType: 61,
            referenceDteId: { in: dteIds },
            siiStatus: { not: "ANNULLED" },
          },
          select: {
            id: true,
            folio: true,
            netAmount: true,
            siiStatus: true,
            referenceCode: true,
            referenceDteId: true,
          },
        })
      : [];

    // Conciliación con cartola: último FinancePaymentRecord asociado a
    // cada DTE. Sirve para mostrar la columna "Pago / Conciliación" con
    // tooltip "Conciliado el {fecha} con mov. {referencia}". Se hace en
    // un único query batched filtrando por allocations de los DTE listados.
    const allocations = dteIds.length > 0
      ? await prisma.financePaymentAllocation.findMany({
          where: { dteId: { in: dteIds } },
          select: {
            dteId: true,
            amount: true,
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
        })
      : [];
    // Último pago por DTE (ya viene ordenado desc por createdAt).
    const lastPaymentByDte = new Map<
      string,
      {
        paymentId: string;
        paymentCode: string;
        paymentDate: string;
        paymentStatus: string;
        bankTransactionId: string | null;
        bankTransactionDate: string | null;
        bankTransactionReference: string | null;
        bankTransactionDescription: string | null;
      }
    >();
    for (const a of allocations) {
      if (lastPaymentByDte.has(a.dteId)) continue;
      lastPaymentByDte.set(a.dteId, {
        paymentId: a.payment.id,
        paymentCode: a.payment.code,
        paymentDate: a.payment.date.toISOString(),
        paymentStatus: a.payment.status,
        bankTransactionId: a.payment.bankTransaction?.id ?? null,
        bankTransactionDate:
          a.payment.bankTransaction?.transactionDate.toISOString() ?? null,
        bankTransactionReference: a.payment.bankTransaction?.reference ?? null,
        bankTransactionDescription:
          a.payment.bankTransaction?.description ?? null,
      });
    }
    // Agrupar por dte original. Reduce la pasada a O(1) durante el map.
    const ncsByDte = new Map<string, typeof linkedCreditNotes>();
    for (const nc of linkedCreditNotes) {
      if (!nc.referenceDteId) continue;
      const arr = ncsByDte.get(nc.referenceDteId) ?? [];
      arr.push(nc);
      ncsByDte.set(nc.referenceDteId, arr);
    }

    const dtesEnriched = dtes.map((d) => {
      const activeCession = cessionByDte.get(d.id) ?? null;
      const hasXml = d.dteXml !== null && d.dteXml.length > 0;
      const CEDIBLE_SII_STATUSES = new Set(["ACCEPTED", "SENT", "PENDING", "WITH_OBJECTIONS"]);
      const canBeCeded =
        CEDIBLE_TYPES.has(d.dteType) &&
        CEDIBLE_SII_STATUSES.has(d.siiStatus) &&
        hasXml &&
        activeCession === null;

      // NC asociada (sólo aplica a tipos que pueden recibirla: 33/34/39/41/56).
      const ncs = ncsByDte.get(d.id) ?? [];
      const activeNcs = ncs.filter((n) =>
        ["ACCEPTED", "PENDING", "SENT", "WITH_OBJECTIONS"].includes(n.siiStatus),
      );
      const hasFullAnnulment = activeNcs.some((n) => n.referenceCode === 1);
      const creditedNet = activeNcs.reduce(
        (acc, n) => acc + Number(n.netAmount ?? 0),
        0,
      );
      const linkedCreditNote = activeNcs.length > 0
        ? {
            count: activeNcs.length,
            hasFullAnnulment,
            creditedNet,
            primaryFolio:
              activeNcs.find((n) => n.referenceCode === 1)?.folio ??
              activeNcs[0].folio,
          }
        : null;

      // Excluir el buffer XML del payload (queda en el server). El cliente
      // sólo necesita saber si existe vía `hasXml`.
      const { dteXml: _dteXml, ...rest } = d;
      void _dteXml;
      const enrichedAccount =
        (d.crmAccountId ? accountById.get(d.crmAccountId) ?? null : null) ??
        (d.receiverRut ? accountByRut.get(d.receiverRut) ?? null : null);
      return {
        ...rest,
        hasXml,
        crmAccount: enrichedAccount
          ? {
              id: enrichedAccount.id,
              name: enrichedAccount.name,
              legalName: enrichedAccount.legalName,
            }
          : null,
        installation: d.installationId
          ? installationMap.get(d.installationId) ?? null
          : null,
        canBeCeded,
        activeCession: activeCession
          ? {
              id: activeCession.id,
              code: activeCession.code,
              status: activeCession.status,
              factoringCompany: activeCession.factoringCompany,
            }
          : null,
        linkedCreditNote,
        // Última conciliación con cartola — null si nunca se conció con
        // un FinancePaymentRecord (ya sea porque está UNPAID o porque
        // se marcó pagado vía bulk-mark-paid sin asociar mov. bancario).
        lastReconciliation: lastPaymentByDte.get(d.id) ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        dtes: dtesEnriched,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      },
    });
  } catch (error) {
    console.error("[Finance/Billing] Error listing DTEs:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar DTEs" },
      { status: 500 }
    );
  }
}

function getDteOrderBy(sort: string): Record<string, "asc" | "desc">[] {
  switch (sort) {
    case "date_asc":
      return [{ date: "asc" }, { folio: "asc" }];
    case "created_desc":
      return [{ createdAt: "desc" }];
    case "created_asc":
      return [{ createdAt: "asc" }];
    case "total_desc":
      return [{ totalAmount: "desc" }, { date: "desc" }];
    case "total_asc":
      return [{ totalAmount: "asc" }, { date: "desc" }];
    case "date_desc":
    default:
      return [{ date: "desc" }, { folio: "desc" }];
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_issue")) {
      return NextResponse.json(
        {
          success: false,
          error: "No tiene permiso para emitir facturas",
        },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, issueDteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // ufOverride viaja en el body pero NO es parte del input del issuer:
    // se pasa como opción para que el cálculo use ese valor en vez del UF
    // del día. El emisor lo lee aparte para no contaminar el shape del DTE.
    const { ufOverride, ...issueInput } = body;
    const result = await issueDte(ctx.tenantId, ctx.userId, issueInput, {
      ufOverride: ufOverride ?? undefined,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error issuing DTE:", error);
    // Propagar el mensaje del servicio (no enmascarar) para que el cliente
    // pueda mostrar la causa real (ej: "Falta CAF tipo 33", "SimpleAPI HTTP 401",
    // "Certificado expirado", etc).
    const message =
      error instanceof Error ? error.message : "Error al emitir DTE";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
