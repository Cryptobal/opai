import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { parseSantanderCartola } from "@/modules/finance/banking/santander-parser";
import { loadXlsxRows } from "@/modules/finance/banking/xlsx-loader";
import { importBankTransactions } from "@/modules/finance/banking/bank-transaction.service";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const SUPPORTED_FORMATS = ["SANTANDER"] as const;
type BankFormat = (typeof SUPPORTED_FORMATS)[number];

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

    // --- Parse FormData ---
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bankAccountId = formData.get("bankAccountId") as string | null;
    const bankFormat = (
      (formData.get("bankFormat") as string) || "SANTANDER"
    ).toUpperCase() as BankFormat;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "Archivo es requerido" },
        { status: 400 }
      );
    }

    if (!bankAccountId) {
      return NextResponse.json(
        { success: false, error: "bankAccountId es requerido" },
        { status: 400 }
      );
    }

    if (!SUPPORTED_FORMATS.includes(bankFormat)) {
      return NextResponse.json(
        {
          success: false,
          error: `Formato no soportado. Formatos disponibles: ${SUPPORTED_FORMATS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el tamano maximo de 5MB" },
        { status: 400 }
      );
    }

    // --- Read Excel file ---
    // Usamos un loader propio (JSZip + fast-xml-parser) en vez de exceljs porque
    // Santander emite XLSX no-estándar (paths con `/` inicial, sheet.xml en vez
    // de sheet1.xml, namespace `x:`) y exceljs revienta con
    // "Cannot read properties of undefined (reading 'sheets')".
    const arrayBuffer = await file.arrayBuffer();
    let rows: (string | number | null)[][];
    try {
      const loaded = await loadXlsxRows(new Uint8Array(arrayBuffer));
      rows = loaded.rows;
    } catch (err) {
      console.error("[Finance BankTransactions Import] XLSX load error:", err);
      return NextResponse.json(
        {
          success: false,
          error:
            "No se pudo leer el archivo. Verifica que sea el Excel descargado desde Santander (Historial de Cuenta).",
        },
        { status: 400 }
      );
    }
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "El archivo no contiene datos" },
        { status: 400 }
      );
    }

    // --- Parse with the appropriate parser ---
    let parsed;
    switch (bankFormat) {
      case "SANTANDER":
        parsed = parseSantanderCartola(rows);
        break;
      default:
        return NextResponse.json(
          { success: false, error: "Formato no implementado" },
          { status: 400 }
        );
    }

    if (parsed.transactions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se encontraron transacciones en el archivo",
        },
        { status: 400 }
      );
    }

    // --- Import transactions ---
    // Pasamos userId para que importBankTransactions corra auto-match
    // contra DTEs pendientes después del bulk insert. Cobros con monto
    // exacto + RUT detectado en cartola pasan a PAID automáticamente.
    const result = await importBankTransactions(
      ctx.tenantId,
      bankAccountId,
      parsed.transactions,
      parsed.closingBalance,
      ctx.userId,
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          importedCount: result.importedCount,
          totalInFile: parsed.transactions.length,
          accountNumber: parsed.accountNumber,
          periodFrom: parsed.periodFrom,
          periodTo: parsed.periodTo,
          // Resumen del auto-match para que la UI pueda mostrar
          // "X transacciones importadas, Y conciliadas automáticamente,
          // Z requieren revisión manual".
          autoMatch: result.autoMatch ?? null,
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
