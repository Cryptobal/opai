import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { importBankTransactions } from "@/modules/finance/banking/bank-transaction.service";
import { parseCartolaUpload } from "@/modules/finance/banking/parse-cartola-upload";

/**
 * POST /api/finance/banking/transactions/import
 * Import bank transactions from an Excel bank statement file.
 *
 * FormData fields:
 *   file: Excel file (.xlsx / .xls)
 *   bankAccountId: UUID of the target bank account
 *   bankFormat: parser format (default "SANTANDER")
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

    const formData = await request.formData();
    const parsedUpload = await parseCartolaUpload(formData);
    if (!parsedUpload.ok) return parsedUpload.response;
    const { file, bankAccountId, bankFormat, transactions, ...meta } =
      parsedUpload.data;

    // Pasamos userId para que importBankTransactions corra auto-match
    // contra DTEs pendientes después del bulk insert. Cobros con monto
    // exacto + RUT detectado en cartola pasan a PAID automáticamente.
    const result = await importBankTransactions(
      ctx.tenantId,
      bankAccountId,
      transactions,
      meta.closingBalance,
      ctx.userId,
      {
        fileName: file.name,
        fileSize: file.size,
        bankFormat,
        accountNumberInFile: meta.accountNumber,
        periodFrom: meta.periodFrom,
        periodTo: meta.periodTo,
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          importId: result.importId,
          importedCount: result.importedCount,
          duplicateCount: result.duplicateCount,
          totalInFile: transactions.length,
          accountNumber: meta.accountNumber,
          periodFrom: meta.periodFrom,
          periodTo: meta.periodTo,
          // Resumen del auto-match para que la UI pueda mostrar
          // "X transacciones importadas, Y conciliadas automáticamente,
          // Z requieren revisión manual".
          autoMatch: result.autoMatch ?? null,
          reachedAutoMatchCap: result.reachedAutoMatchCap ?? false,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Finance BankTransactions Import] Error:", error);
    const message =
      error instanceof Error
        ? error.message
        : "Error al importar movimientos bancarios";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
