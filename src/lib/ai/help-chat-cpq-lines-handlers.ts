/**
 * Tool MCP/chat para LÍNEAS ADICIONALES facturables (CpqQuoteAdditionalLine).
 * Distinto de manage_quote_extras (costos/uniformes/exámenes): estas líneas
 * aparecen en la pestaña Líneas y se suman al total de venta con margen propio.
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
} from "@/lib/ai/help-chat-cpq-ai-shared";
import { resolveAiHelpChatCpqQuote } from "@/lib/ai/help-chat-ai-cpq-quote";
import { recomputeQuoteTotals } from "@/lib/ai/help-chat-cpq-extras-handlers";

type PageCx = HelpChatPageContext | null | undefined;

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

/** Misma fórmula de venta que LineasSection.tsx (precioBase / (1 − marginPct/100)). */
function salePriceClp(precio: number, cantidad: number, marginPct: number | null): number {
  const base = Math.round(precio) * Math.max(1, Math.round(cantidad));
  const m = marginPct == null ? 0 : Number(marginPct);
  if (m > 0 && m < 100) return Math.round(base / (1 - m / 100));
  return base;
}

function mapLine(l: {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: { toString(): string } | number;
  cantidad: number;
  tipo: string;
  recurrencia: string;
  marginPct: { toString(): string } | number | null;
  orden: number;
}) {
  const precio = Math.round(Number(l.precio));
  const cantidad = Number(l.cantidad) || 1;
  const marginPct = l.marginPct == null ? null : Number(l.marginPct);
  return {
    id: l.id,
    nombre: l.nombre,
    descripcion: l.descripcion,
    precio,
    cantidad,
    tipo: l.tipo,
    recurrencia: l.recurrencia,
    marginPct,
    orden: l.orden,
    precioVenta: salePriceClp(precio, cantidad, marginPct),
  };
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
    await hcAiLog({
      tenantId,
      userId,
      toolName: TOOL,
      args,
      status: "validation_error",
      errorMessage: code,
      startedAt: t0,
    });
    return { ok: false as const, error: msg };
  };

  try {
    const quote = await resolveAiHelpChatCpqQuote(tenantId, asStr(args, "quoteIdOrCode"), pageContext);

    if (action === "list") {
      const rows = await prisma.cpqQuoteAdditionalLine.findMany({
        where: { quoteId: quote.id },
        orderBy: { orden: "asc" },
      });
      await hcAiLog({
        tenantId,
        userId,
        toolName: TOOL,
        args,
        status: "success",
        resultEntityId: quote.id,
        resultEntityType: "cpq_quote",
        startedAt: t0,
      });
      return {
        ok: true,
        data: {
          quoteId: quote.id,
          quoteCode: quote.code,
          lines: rows.map(mapLine),
          note: "precio es CLP entero (también en cotizaciones UF).",
        },
      };
    }

    if (!new Set(["add", "update", "remove"]).has(action)) {
      return await val("Acción inválida. Usa action: list | add | update | remove.", "action");
    }

    if (action === "add") {
      const nombre = asStr(args, "nombre") ?? asStr(args, "name");
      if (!nombre) return await val("Indica nombre de la línea (ej. 'Arriendo de dron').", "nombre");
      const precioRaw = numArg(args, "precio");
      if (precioRaw == null) return await val("Indica precio en CLP enteros (≥ 0).", "precio");
      const precio = Math.round(precioRaw);
      if (precio < 0) return await val("precio debe ser ≥ 0 (CLP enteros).", "precio");
      const cantidadRaw = numArg(args, "cantidad") ?? 1;
      const cantidad = Math.round(cantidadRaw);
      if (cantidad < 1) return await val("cantidad debe ser ≥ 1.", "cantidad");
      const marginRaw = numArg(args, "marginPct");
      let marginPct: number | null = null;
      if (marginRaw != null) {
        if (marginRaw < 0 || marginRaw >= 100) {
          return await val("marginPct debe estar en [0, 99].", "marginPct");
        }
        marginPct = marginRaw;
      }
      const recurrencia = (asStr(args, "recurrencia") ?? "mensual").toLowerCase();
      if (recurrencia !== "mensual" && recurrencia !== "unico") {
        return await val("recurrencia debe ser 'mensual' o 'unico'.", "recurrencia");
      }
      const tipo = (asStr(args, "tipo") ?? "servicio").slice(0, 30);
      const descripcion = asStr(args, "descripcion") ?? null;
      const maxOrden = await prisma.cpqQuoteAdditionalLine.aggregate({
        where: { quoteId: quote.id },
        _max: { orden: true },
      });
      const orden = numArg(args, "orden") ?? (maxOrden._max.orden ?? -1) + 1;

      await prisma.cpqQuoteAdditionalLine.create({
        data: {
          quoteId: quote.id,
          nombre: nombre.slice(0, 200),
          descripcion,
          precio,
          cantidad,
          tipo,
          recurrencia,
          marginPct,
          orden: Math.round(orden),
        },
      });
    } else {
      const lineId = asStr(args, "lineId") ?? asStr(args, "itemId");
      if (!lineId) return await val("Indica lineId (usa action=list).", "lineId");
      const existing = await prisma.cpqQuoteAdditionalLine.findFirst({
        where: { id: lineId, quoteId: quote.id },
      });
      if (!existing) return await val("No encontré esa línea en la cotización.", "notfound");

      if (action === "remove") {
        await prisma.cpqQuoteAdditionalLine.deleteMany({ where: { id: lineId, quoteId: quote.id } });
      } else {
        const data: Prisma.CpqQuoteAdditionalLineUpdateManyMutationInput = {};
        const nombre = asStr(args, "nombre") ?? asStr(args, "name");
        if (nombre) data.nombre = nombre.slice(0, 200);
        if (Object.prototype.hasOwnProperty.call(args, "descripcion")) {
          data.descripcion = asStr(args, "descripcion") ?? null;
        }
        const precioRaw = numArg(args, "precio");
        if (precioRaw != null) {
          const precio = Math.round(precioRaw);
          if (precio < 0) return await val("precio debe ser ≥ 0 (CLP enteros).", "precio");
          data.precio = precio;
        }
        const cantidadRaw = numArg(args, "cantidad");
        if (cantidadRaw != null) {
          const cantidad = Math.round(cantidadRaw);
          if (cantidad < 1) return await val("cantidad debe ser ≥ 1.", "cantidad");
          data.cantidad = cantidad;
        }
        if (Object.prototype.hasOwnProperty.call(args, "marginPct")) {
          if (args.marginPct === null || args.marginPct === "") {
            data.marginPct = null;
          } else {
            const marginRaw = numArg(args, "marginPct");
            if (marginRaw == null || marginRaw < 0 || marginRaw >= 100) {
              return await val("marginPct debe estar en [0, 99] o null.", "marginPct");
            }
            data.marginPct = marginRaw;
          }
        }
        const recurrencia = asStr(args, "recurrencia");
        if (recurrencia) {
          const r = recurrencia.toLowerCase();
          if (r !== "mensual" && r !== "unico") {
            return await val("recurrencia debe ser 'mensual' o 'unico'.", "recurrencia");
          }
          data.recurrencia = r;
        }
        const tipo = asStr(args, "tipo");
        if (tipo) data.tipo = tipo.slice(0, 30);
        const orden = numArg(args, "orden");
        if (orden != null) data.orden = Math.round(orden);

        if (Object.keys(data).length === 0) {
          return await val("Indica al menos un campo a actualizar.", "nofields");
        }
        await prisma.cpqQuoteAdditionalLine.updateMany({
          where: { id: lineId, quoteId: quote.id },
          data,
        });
      }
    }

    const summary = await recomputeQuoteTotals(quote.id);
    const rows = await prisma.cpqQuoteAdditionalLine.findMany({
      where: { quoteId: quote.id },
      orderBy: { orden: "asc" },
    });
    await hcAiLog({
      tenantId,
      userId,
      toolName: TOOL,
      args,
      status: "success",
      resultEntityId: quote.id,
      resultEntityType: "cpq_quote",
      startedAt: t0,
    });
    return {
      ok: true,
      data: {
        quoteId: quote.id,
        quoteCode: quote.code,
        action,
        monthlyTotal: summary.monthlyTotal,
        lines: rows.map(mapLine),
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    await hcAiLog({
      tenantId,
      userId,
      toolName: TOOL,
      args,
      status: "internal_error",
      errorMessage: raw,
      startedAt: t0,
    });
    return { ok: false, error: hcMapQuoteResolveError(e) };
  }
}
