import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/finance/banking/imports/[id]
 * Detalle de una cartola importada con sus movimientos asociados.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const statementImport = await prisma.financeBankStatementImport.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountNumber: true },
        },
        transactions: {
          orderBy: { transactionDate: "asc" },
          select: {
            id: true,
            transactionDate: true,
            description: true,
            reference: true,
            amount: true,
            reconciliationStatus: true,
            hiddenAt: true,
          },
        },
      },
    });

    if (!statementImport) {
      return NextResponse.json(
        { success: false, error: "Importación no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: statementImport.id,
        bankAccountId: statementImport.bankAccountId,
        bankName: statementImport.bankAccount.bankName,
        accountNumber: statementImport.bankAccount.accountNumber,
        fileName: statementImport.fileName,
        fileSize: statementImport.fileSize,
        bankFormat: statementImport.bankFormat,
        accountNumberInFile: statementImport.accountNumberInFile,
        periodFrom:
          statementImport.periodFrom?.toISOString().slice(0, 10) ?? null,
        periodTo:
          statementImport.periodTo?.toISOString().slice(0, 10) ?? null,
        totalInFile: statementImport.totalInFile,
        importedCount: statementImport.importedCount,
        duplicateCount: statementImport.duplicateCount,
        closingBalance: statementImport.closingBalance?.toString() ?? null,
        createdAt: statementImport.createdAt.toISOString(),
        transactions: statementImport.transactions.map((t) => ({
          id: t.id,
          transactionDate: t.transactionDate.toISOString().slice(0, 10),
          description: t.description,
          reference: t.reference,
          amount: t.amount.toString(),
          reconciliationStatus: t.reconciliationStatus,
          hiddenAt: t.hiddenAt?.toISOString() ?? null,
        })),
      },
    });
  } catch (error) {
    console.error("[Finance Banking Import Detail] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error obteniendo importación";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
