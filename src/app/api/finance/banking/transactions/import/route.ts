import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { parseSantanderCartola } from "@/modules/finance/banking/santander-parser";
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
    if (!hasCapability(perms, "rendicion_configure")) {
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
    const arrayBuffer = await file.arrayBuffer();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json(
        { success: false, error: "El archivo no contiene hojas de calculo" },
        { status: 400 }
      );
    }

    // Normalize an exceljs cell value into the shape the Santander parser expects
    // (string | number | null). Dates are emitted as DD/MM/YYYY so the parser's
    // existing regex matching keeps working.
    const normalizeCell = (v: unknown): string | number | null => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v === "number" || typeof v === "string") return v;
      if (v instanceof Date) {
        const d = String(v.getUTCDate()).padStart(2, "0");
        const m = String(v.getUTCMonth() + 1).padStart(2, "0");
        const y = v.getUTCFullYear();
        return `${d}/${m}/${y}`;
      }
      if (typeof v === "object" && "richText" in (v as object)) {
        const rt = (v as { richText: { text: string }[] }).richText;
        return rt.map((r) => r.text).join("");
      }
      if (typeof v === "object" && "result" in (v as object)) {
        return normalizeCell((v as { result: unknown }).result);
      }
      if (typeof v === "object" && "text" in (v as object)) {
        return String((v as { text: unknown }).text);
      }
      return String(v);
    };

    const rows: (string | number | null)[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const values = row.values as unknown[];
      const rowArr: (string | number | null)[] = [];
      for (let i = 1; i < values.length; i++) {
        rowArr.push(normalizeCell(values[i]));
      }
      rows.push(rowArr);
    });

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
    const result = await importBankTransactions(
      ctx.tenantId,
      bankAccountId,
      parsed.transactions,
      parsed.closingBalance
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
