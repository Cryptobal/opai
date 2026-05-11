/**
 * Helper común para los endpoints /import/preview e /import:
 * recibe el FormData, valida y parsea la cartola, devuelve un payload
 * normalizado o un Response de error listo para retornar.
 */

import { NextResponse } from "next/server";
import { parseSantanderCartola } from "./santander-parser";
import { loadXlsxRows } from "./xlsx-loader";
import type { ImportTransactionInput } from "./bank-transaction.service";

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const SUPPORTED_FORMATS = ["SANTANDER"] as const;
export type BankFormat = (typeof SUPPORTED_FORMATS)[number];

export interface ParsedCartolaUpload {
  file: File;
  bankAccountId: string;
  bankFormat: BankFormat;
  transactions: ImportTransactionInput[];
  accountNumber: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  closingBalance: number | null;
}

type Failure = { ok: false; response: NextResponse };
type Success = { ok: true; data: ParsedCartolaUpload };

export async function parseCartolaUpload(
  formData: FormData,
): Promise<Failure | Success> {
  const file = formData.get("file") as File | null;
  const bankAccountId = formData.get("bankAccountId") as string | null;
  const bankFormat = (
    (formData.get("bankFormat") as string) || "SANTANDER"
  ).toUpperCase() as BankFormat;

  if (!file) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "Archivo es requerido" },
        { status: 400 },
      ),
    };
  }
  if (!bankAccountId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "bankAccountId es requerido" },
        { status: 400 },
      ),
    };
  }
  if (!SUPPORTED_FORMATS.includes(bankFormat)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: `Formato no soportado. Formatos disponibles: ${SUPPORTED_FORMATS.join(", ")}`,
        },
        { status: 400 },
      ),
    };
  }
  if (file.size > MAX_FILE_SIZE) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "El archivo excede el tamano maximo de 5MB" },
        { status: 400 },
      ),
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  let rows: (string | number | null)[][];
  try {
    const loaded = await loadXlsxRows(new Uint8Array(arrayBuffer));
    rows = loaded.rows;
  } catch (err) {
    console.error("[parseCartolaUpload] XLSX load error:", err);
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            "No se pudo leer el archivo. Verifica que sea el Excel descargado desde Santander (Historial de Cuenta).",
        },
        { status: 400 },
      ),
    };
  }
  if (rows.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: "El archivo no contiene datos" },
        { status: 400 },
      ),
    };
  }

  let parsed;
  switch (bankFormat) {
    case "SANTANDER":
      parsed = parseSantanderCartola(rows);
      break;
    default:
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: "Formato no implementado" },
          { status: 400 },
        ),
      };
  }

  if (parsed.transactions.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: "No se encontraron transacciones en el archivo",
        },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    data: {
      file,
      bankAccountId,
      bankFormat,
      transactions: parsed.transactions,
      accountNumber: parsed.accountNumber ?? null,
      periodFrom: parsed.periodFrom ?? null,
      periodTo: parsed.periodTo ?? null,
      closingBalance: parsed.closingBalance ?? null,
    },
  };
}
