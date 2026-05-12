import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { createBankTransactionSchema } from "@/lib/validations/finance";
import {
  listBankTransactions,
  createBankTransaction,
} from "@/modules/finance/banking/bank-transaction.service";

/**
 * GET /api/finance/banking/transactions
 * List bank transactions for a bank account with optional date filters
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get("bankAccountId");

    if (!bankAccountId) {
      return NextResponse.json(
        { success: false, error: "bankAccountId es requerido" },
        { status: 400 }
      );
    }

    const sortByRaw = searchParams.get("sortBy");
    const sortDirRaw = searchParams.get("sortDir");
    const sortBy: "transactionDate" | "description" | "amount" | undefined =
      sortByRaw === "transactionDate" ||
      sortByRaw === "description" ||
      sortByRaw === "amount"
        ? sortByRaw
        : undefined;
    const sortDir: "asc" | "desc" | undefined =
      sortDirRaw === "asc" || sortDirRaw === "desc" ? sortDirRaw : undefined;

    const visibilityRaw = searchParams.get("visibility");
    const visibility: "visible" | "hidden" | "all" | undefined =
      visibilityRaw === "visible" ||
      visibilityRaw === "hidden" ||
      visibilityRaw === "all"
        ? visibilityRaw
        : undefined;

    const tabRaw = searchParams.get("tab");
    const tab:
      | "all"
      | "recognized"
      | "unrecognized"
      | "matched"
      | undefined =
      tabRaw === "all" ||
      tabRaw === "recognized" ||
      tabRaw === "unrecognized" ||
      tabRaw === "matched"
        ? tabRaw
        : undefined;

    // Filtro por signo del monto (post 2026-05). "inflow" = ingresos
    // (amount > 0), "outflow" = egresos (amount < 0). Antes este filtro
    // no existía y el usuario tenía que mirar el color de cada fila.
    const directionRaw = searchParams.get("direction");
    const direction: "inflow" | "outflow" | "all" | undefined =
      directionRaw === "inflow" ||
      directionRaw === "outflow" ||
      directionRaw === "all"
        ? directionRaw
        : undefined;

    // Cap defensivo de pageSize: la UI ofrece hasta 200 (PaginationControls),
    // pero un cliente mal formado podría pedir un take enorme y saturar el
    // pool de Neon. 500 es suficiente para exports puntuales.
    const pageSizeRaw = searchParams.get("pageSize");
    const requestedPageSize = pageSizeRaw ? parseInt(pageSizeRaw) : undefined;
    const pageSize =
      requestedPageSize != null && Number.isFinite(requestedPageSize)
        ? Math.min(Math.max(1, requestedPageSize), 500)
        : undefined;

    const opts = {
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      search: searchParams.get("search") || undefined,
      sortBy,
      sortDir,
      visibility,
      tab,
      direction,
      page: searchParams.get("page")
        ? parseInt(searchParams.get("page")!)
        : undefined,
      pageSize,
    };

    const data = await listBankTransactions(ctx.tenantId, bankAccountId, opts);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance BankTransactions] GET Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener movimientos bancarios" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/finance/banking/transactions
 * Create a single bank transaction (manual entry)
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createBankTransactionSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const transaction = await createBankTransaction(ctx.tenantId, body);
    return NextResponse.json(
      { success: true, data: transaction },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance BankTransactions] POST Error:", error);
    const message =
      error instanceof Error ? error.message : "Error al crear movimiento bancario";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
