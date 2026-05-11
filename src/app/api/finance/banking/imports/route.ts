import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/finance/banking/imports
 * Lista las últimas cartolas importadas del tenant, opcionalmente filtradas
 * por cuenta bancaria. Ordenadas por createdAt desc.
 *
 * Query: ?bankAccountId=<uuid>&limit=20
 */
export async function GET(request: NextRequest) {
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

    const url = new URL(request.url);
    const bankAccountId = url.searchParams.get("bankAccountId");
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 1),
      100,
    );

    const imports = await prisma.financeBankStatementImport.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(bankAccountId ? { bankAccountId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountNumber: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: imports.map((i) => ({
        id: i.id,
        bankAccountId: i.bankAccountId,
        bankName: i.bankAccount.bankName,
        accountNumber: i.bankAccount.accountNumber,
        fileName: i.fileName,
        fileSize: i.fileSize,
        bankFormat: i.bankFormat,
        accountNumberInFile: i.accountNumberInFile,
        periodFrom: i.periodFrom?.toISOString().slice(0, 10) ?? null,
        periodTo: i.periodTo?.toISOString().slice(0, 10) ?? null,
        totalInFile: i.totalInFile,
        importedCount: i.importedCount,
        duplicateCount: i.duplicateCount,
        closingBalance: i.closingBalance?.toString() ?? null,
        createdAt: i.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[Finance Banking Imports List] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error listando importaciones";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
