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

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
    };
    if (accountId === "NONE") {
      where.crmAccountId = null;
    } else if (accountId && accountId !== "ALL") {
      where.crmAccountId = accountId;
    }
    if (statusFilter === "draft") {
      where.siiStatus = "DRAFT";
    } else if (statusFilter !== "all") {
      where.siiStatus = { not: "DRAFT" };
    }
    if (search) {
      // Búsqueda fuzzy global: folio, RUT (con/sin guión), nombre, monto
      // exacto, o rango "1000-5000".
      const rutNeedle = search.replace(/[.\-\s]/g, "");
      const orClauses: Record<string, unknown>[] = [
        { receiverName: { contains: search, mode: "insensitive" } },
        { receiverRut: { contains: rutNeedle, mode: "insensitive" } },
      ];

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
    if (periodo && /^\d{4}-\d{2}$/.test(periodo)) {
      const [y, m] = periodo.split("-").map((s) => parseInt(s, 10));
      const from = new Date(Date.UTC(y, m - 1, 1));
      const to = new Date(Date.UTC(y, m, 1));
      where.date = { gte: from, lt: to };
    }

    const dtes = await prisma.financeDte.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: { lines: true },
    });

    const total = await prisma.financeDte.count({ where });

    // Enriquecer con cliente CRM + instalación (centro de costo).
    const accountIds = Array.from(
      new Set(dtes.map((d) => d.crmAccountId).filter((v): v is string => !!v)),
    );
    const installationIds = Array.from(
      new Set(dtes.map((d) => d.installationId).filter((v): v is string => !!v)),
    );
    const [accounts, installations] = await Promise.all([
      accountIds.length > 0
        ? prisma.crmAccount.findMany({
            where: { id: { in: accountIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true, legalName: true },
          })
        : Promise.resolve([]),
      installationIds.length > 0
        ? prisma.crmInstallation.findMany({
            where: { id: { in: installationIds }, tenantId: ctx.tenantId },
            select: { id: true, name: true, commune: true },
          })
        : Promise.resolve([]),
    ]);
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
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

    const dtesEnriched = dtes.map((d) => {
      const activeCession = cessionByDte.get(d.id) ?? null;
      const hasXml = d.dteXml !== null && d.dteXml.length > 0;
      const canBeCeded =
        CEDIBLE_TYPES.has(d.dteType) &&
        d.siiStatus === "ACCEPTED" &&
        hasXml &&
        activeCession === null;
      // Excluir el buffer XML del payload (queda en el server). El cliente
      // sólo necesita saber si existe vía `hasXml`.
      const { dteXml: _dteXml, ...rest } = d;
      void _dteXml;
      return {
        ...rest,
        hasXml,
        crmAccount: d.crmAccountId ? accountMap.get(d.crmAccountId) ?? null : null,
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

    const result = await issueDte(ctx.tenantId, ctx.userId, body);

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
