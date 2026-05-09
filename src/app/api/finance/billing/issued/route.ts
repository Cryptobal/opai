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
    const pageSize = parseInt(url.searchParams.get("pageSize") || "20");
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
    if (statusFilter === "draft") {
      where.siiStatus = "DRAFT";
    } else if (statusFilter === "issued") {
      where.siiStatus = { not: "DRAFT" };
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
          select: { id: true, code: true, status: true, dteId: true },
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
      const canBeCeded =
        CEDIBLE_TYPES.has(d.dteType) &&
        d.siiStatus === "ACCEPTED" &&
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
            }
          : null,
        linkedCreditNote,
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
