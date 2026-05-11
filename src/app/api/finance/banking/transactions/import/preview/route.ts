import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { previewBankStatementImport } from "@/modules/finance/banking/bank-transaction.service";
import { parseCartolaUpload } from "@/modules/finance/banking/parse-cartola-upload";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/finance/banking/transactions/import/preview
 * Pre-chequeo de importación de cartola. Parsea el archivo y devuelve un
 * desglose de qué se importaría como nuevo vs qué ya existe en BD, sin
 * escribir nada. El cliente lo usa para mostrar el resumen y pedir
 * confirmación antes de llamar al endpoint de importación real.
 *
 * FormData igual que /import (file, bankAccountId, bankFormat).
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const parsedUpload = await parseCartolaUpload(formData);
    if (!parsedUpload.ok) return parsedUpload.response;
    const { bankAccountId, transactions, ...meta } = parsedUpload.data;

    // Warning si el número de cuenta del archivo no coincide con la cuenta
    // bancaria seleccionada. No bloqueamos — quizás el banco emite el número
    // con un prefijo distinto — pero la UI lo expone para que el usuario
    // confirme conscientemente.
    let accountMismatch = false;
    if (meta.accountNumber) {
      const account = await prisma.financeBankAccount.findFirst({
        where: { id: bankAccountId, tenantId: ctx.tenantId },
        select: { accountNumber: true },
      });
      if (account) {
        // Comparamos solo dígitos para tolerar formatos con/sin guiones.
        const fileDigits = meta.accountNumber.replace(/\D/g, "");
        const accountDigits = account.accountNumber.replace(/\D/g, "");
        accountMismatch =
          fileDigits.length > 0 &&
          accountDigits.length > 0 &&
          !fileDigits.endsWith(accountDigits) &&
          !accountDigits.endsWith(fileDigits);
      }
    }

    const preview = await previewBankStatementImport(
      ctx.tenantId,
      bankAccountId,
      transactions,
      {
        accountNumberInFile: meta.accountNumber,
        periodFrom: meta.periodFrom,
        periodTo: meta.periodTo,
        closingBalance: meta.closingBalance,
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        ...preview,
        accountMismatch,
      },
    });
  } catch (error) {
    console.error("[Finance BankTransactions ImportPreview] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error en el pre-chequeo";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
