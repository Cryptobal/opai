/**
 * Tool CPQ `manage_quote_lines` — LÍNEAS ADICIONALES facturables de la cotización
 * (`CpqQuoteAdditionalLine`, pestaña "Líneas adicionales" del workspace).
 *
 * El precio se persiste SIEMPRE en CLP entero (`Decimal(12,0)`), igual que la UI
 * (`LineasSection.tsx`). El precio de venta se deriva con la misma fórmula del
 * motor: `precioBase / (1 - marginPct/100)` cuando hay margen de línea.
 *
 * Cada escritura recalcula los totales de la cotización con `computeCpqQuoteCosts`
 * (fuente de verdad única) vía `recomputeQuoteTotals`.
 */
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { RolePermissions } from "@/lib/permissions";
import {
  hcAiLog,
  hcCanReadQuotes,
  hcCanWriteQuotes,
  hcMapQuoteResolveError,
  hcQuoteEconomicLock,
  recomputeQuoteTotals,
} from "@/lib/ai/help-chat-cpq-ai-shared";
import { resolveAiHelpChatCpqQuote } from "@/lib/ai/help-chat-ai-cpq-quote";

type PageCx = HelpChatPageContext | null | undefined;

const RECURRENCIAS = new Set(["mensual", "unico"]);

function asStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function numArg(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
}

/** Precio de venta de la línea — misma fórmula que `LineasSection.tsx`. */
function precioVenta(precio: number, cantidad: number, marginPct: number): number {
  const base = precio * cantidad;
  return marginPct > 0 && marginPct < 100 ? base / (1 - marginPct / 100) : base;
}

async function listLines(quoteId: string) {
  const rows = await prisma.cpqQuoteAdditionalLine.findMany({
    where: { quoteId },
    orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((l) => {
    const precio = Number(l.precio);
    const marginPct = l.marginPct == null ? 0 : Number(l.marginPct);
    return {
      lineId: l.id,
      nombre: l.nombre,
      descripcion: l.descripcion,
      precio,
      cantidad: l.cantidad,
      tipo: l.tipo,
      recurrencia: l.recurrencia,
      marginPct,
      orden: l.orden,
      precioVenta: Math.round(precioVenta(precio, l.cantidad, marginPct)),
    };
  });
}

export async function aiTool_manage_quote_lines(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
  pageContext: PageCx,
): Promise<unknown> {
  const t0 = Date.now();
  const TOOL = "manage_quote_lines";
  const action = typeof args.action === "string" ? args.action.trim().toLowerCase() : "";
  const isWrite = action !== "list";

  if (isWrite ? !hcCanWriteQuotes(perms) : !hcCanReadQuotes(perms)) {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "denied", errorMessage: "perm", startedAt: t0 });
    return { ok: false, error: "Sin permiso para editar cotizaciones." };
  }

  const val = async (msg: string, code: string) => {
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "validation_error", errorMessage: code, startedAt: t0 });
    return { ok: false as const, error: msg };
  };

  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);

    if (action === "list") {
      const lines = await listLines(quote.id);
      await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
      return { ok: true, data: { quoteId: quote.id, quoteCode: quote.code, lines } };
    }

    if (!new Set(["add", "update", "remove"]).has(action)) {
      return await val("Acción inválida. Usa action: list | add | update | remove.", "action");
    }

    const locked = await hcQuoteEconomicLock(tenantId, quote.id);
    if (locked) return await val(locked, "locked");

    // ── Validaciones comunes de campos económicos ──
    const nombre = asStr(args, "nombre");
    const precioRaw = numArg(args, "precio");
    const cantidadRaw = numArg(args, "cantidad");
    const marginPctRaw = numArg(args, "marginPct");
    const recurrencia = asStr(args, "recurrencia")?.toLowerCase();
    const tipo = asStr(args, "tipo")?.toLowerCase();
    const ordenRaw = numArg(args, "orden");

    if (precioRaw != null && (!(precioRaw >= 0) || !Number.isFinite(precioRaw))) {
      return await val("precio debe ser un monto CLP mayor o igual a 0.", "precio");
    }
    if (cantidadRaw != null && (!Number.isFinite(cantidadRaw) || cantidadRaw < 1)) {
      return await val("cantidad debe ser un entero mayor o igual a 1.", "cantidad");
    }
    if (marginPctRaw != null && (!Number.isFinite(marginPctRaw) || marginPctRaw < 0 || marginPctRaw > 99)) {
      return await val("marginPct debe estar entre 0 y 99.", "marginPct");
    }
    if (recurrencia != null && !RECURRENCIAS.has(recurrencia)) {
      return await val("recurrencia debe ser 'mensual' o 'unico'.", "recurrencia");
    }

    const precio = precioRaw != null ? Math.round(precioRaw) : undefined;
    const cantidad = cantidadRaw != null ? Math.trunc(cantidadRaw) : undefined;

    if (action === "add") {
      if (!nombre) return await val("Indica nombre de la línea (ej. 'Arriendo de dron').", "nombre");
      if (precio == null) return await val("Indica precio (CLP) de la línea.", "precio");
      const last = await prisma.cpqQuoteAdditionalLine.findFirst({
        where: { quoteId: quote.id },
        orderBy: { orden: "desc" },
        select: { orden: true },
      });
      await prisma.cpqQuoteAdditionalLine.create({
        data: {
          quoteId: quote.id,
          nombre: nombre.slice(0, 200),
          descripcion: asStr(args, "descripcion")?.slice(0, 2000) ?? null,
          precio,
          cantidad: cantidad ?? 1,
          tipo: (tipo ?? "servicio").slice(0, 30),
          recurrencia: recurrencia ?? "mensual",
          marginPct: marginPctRaw != null ? marginPctRaw : null,
          orden: ordenRaw != null ? Math.trunc(ordenRaw) : (last?.orden ?? -1) + 1,
        },
      });
    } else {
      const lineId = asStr(args, "lineId");
      if (!lineId) return await val("Indica lineId (usa action=list para verlo).", "lineId");
      const existing = await prisma.cpqQuoteAdditionalLine.findFirst({
        where: { id: lineId, quoteId: quote.id },
        select: { id: true },
      });
      if (!existing) return await val("No encontré esa línea adicional en la cotización.", "notfound");

      if (action === "remove") {
        await prisma.cpqQuoteAdditionalLine.deleteMany({ where: { id: lineId, quoteId: quote.id } });
      } else {
        const data: Prisma.CpqQuoteAdditionalLineUpdateManyMutationInput = {};
        if (nombre) data.nombre = nombre.slice(0, 200);
        if (has(args, "descripcion")) data.descripcion = asStr(args, "descripcion")?.slice(0, 2000) ?? null;
        if (precio != null) data.precio = precio;
        if (cantidad != null) data.cantidad = cantidad;
        if (tipo) data.tipo = tipo.slice(0, 30);
        if (recurrencia) data.recurrencia = recurrencia;
        if (has(args, "marginPct")) data.marginPct = marginPctRaw ?? null;
        if (ordenRaw != null) data.orden = Math.trunc(ordenRaw);
        if (Object.keys(data).length === 0) {
          return await val(
            "Indica al menos un campo a cambiar (nombre, descripcion, precio, cantidad, tipo, recurrencia, marginPct, orden).",
            "nofields",
          );
        }
        await prisma.cpqQuoteAdditionalLine.updateMany({ where: { id: lineId, quoteId: quote.id }, data });
      }
    }

    const summary = await recomputeQuoteTotals(quote.id);
    const lines = await listLines(quote.id);
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "success", resultEntityId: quote.id, resultEntityType: "cpq_quote", startedAt: t0 });
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        quoteCode: quote.code,
        action,
        lines,
        // El mensual del costeo NO incluye las líneas adicionales (se cobran aparte).
        monthlyTotal: summary.monthlyTotal,
        additionalLinesMonthly: summary.additionalLinesTotalWithMargin,
        additionalLinesOneTime: summary.additionalLinesOneTimeWithMargin,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({ tenantId, userId, toolName: TOOL, args, status: "internal_error", errorMessage: raw, startedAt: t0 });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}
