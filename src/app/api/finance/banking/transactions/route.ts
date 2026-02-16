import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
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
    if (!canView(perms, "finance")) {
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

    const opts = {
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      page: searchParams.get("page")
        ? parseInt(searchParams.get("page")!)
        : undefined,
      pageSize: searchParams.get("pageSize")
        ? parseInt(searchParams.get("pageSize")!)
        : undefined,
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
    if (!hasCapability(perms, "rendicion_configure")) {
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
