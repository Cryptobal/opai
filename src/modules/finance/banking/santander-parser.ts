/**
 * Santander Cartola (Bank Statement) Excel Parser
 *
 * Parses the Santander Chile bank statement Excel format.
 * Header rows: 0-12 (account info, dates, currency)
 * Data rows: 13-247 (transactions)
 * Footer: "Saldos diarios" section (daily balances)
 *
 * Columns layout:
 *   0: MONTO (amount, negative = cargo)
 *   1: DESCRIPCION
 *   2: (empty)
 *   3: FECHA (DD/MM/YYYY)
 *   4: N DOC (reference)
 *   5: SUCURSAL (branch)
 *   6: (empty)
 *   7: CARGO/ABONO (C or A)
 */

export interface ParsedBankTransaction {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  amount: number;
  branch: string | null;
}

export interface ParsedBankStatement {
  accountNumber: string | null;
  currency: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: ParsedBankTransaction[];
}

/**
 * Convert DD/MM/YYYY to YYYY-MM-DD
 */
function convertDate(dateStr: string): string | null {
  const match = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

/**
 * Safely parse a numeric value from a cell
 */
function parseNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  // Remove thousands separators (dots) and convert comma to period for decimals
  const cleaned = String(value).replace(/\./g, "").replace(",", ".").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract text from a header row that matches a pattern
 */
function extractHeaderValue(
  rows: (string | number | null)[][],
  pattern: RegExp,
  maxRow: number = 12
): string | null {
  for (let i = 0; i <= maxRow && i < rows.length; i++) {
    for (const cell of rows[i]) {
      if (cell !== null && cell !== undefined) {
        const text = String(cell).trim();
        const match = text.match(pattern);
        if (match) return match[1];
      }
    }
  }
  return null;
}

/**
 * Parse Santander cartola Excel rows into structured data
 */
export function parseSantanderCartola(
  rows: (string | number | null)[][]
): ParsedBankStatement {
  const result: ParsedBankStatement = {
    accountNumber: null,
    currency: null,
    periodFrom: null,
    periodTo: null,
    openingBalance: null,
    closingBalance: null,
    transactions: [],
  };

  if (!rows || rows.length === 0) {
    return result;
  }

  // --- Parse header (rows 0-12) ---

  // Account number: "Cuenta X-XXX-XXXXXXX-X" or "Cuenta Corriente N ..."
  result.accountNumber =
    extractHeaderValue(rows, /Cuenta\s+(?:Corriente\s+N?\s*)?(\S[\d\-]+\S)/i) ??
    extractHeaderValue(rows, /Cuenta\s+(.+)/i);

  // Currency: "Moneda: PESOS DE CHILE" / "Moneda: DOLARES"
  result.currency = extractHeaderValue(rows, /Moneda:\s*(.+)/i);

  // Period dates: "Fecha desde: DD/MM/YYYY" and "Fecha hasta: DD/MM/YYYY"
  const fromDateStr = extractHeaderValue(rows, /Fecha\s+desde[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  const toDateStr = extractHeaderValue(rows, /Fecha\s+hasta[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
  if (fromDateStr) result.periodFrom = convertDate(fromDateStr);
  if (toDateStr) result.periodTo = convertDate(toDateStr);

  // --- Find transaction start row ---
  // Look for header row containing "MONTO" in column 0
  let dataStartRow = -1;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const firstCell = String(rows[i]?.[0] ?? "").trim().toUpperCase();
    if (firstCell === "MONTO" || firstCell.includes("MONTO")) {
      dataStartRow = i + 1;
      break;
    }
  }

  // Fallback: start at row 13 (typical Santander format)
  if (dataStartRow === -1) {
    dataStartRow = 13;
  }

  // --- Parse opening balance ---
  // Look for "SALDO INICIAL" in the header area or first data rows
  for (let i = 0; i < Math.min(rows.length, dataStartRow + 3); i++) {
    for (const cell of rows[i]) {
      const text = String(cell ?? "").toUpperCase();
      if (text.includes("SALDO INICIAL")) {
        // Balance value is typically in column 0 of the same row or next
        const balVal = parseNumber(rows[i]?.[0]);
        if (balVal !== null) {
          result.openingBalance = balVal;
        }
        break;
      }
    }
  }

  // --- Parse transactions ---
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    // Stop at "Saldos diarios" footer section
    const firstCell = String(row[0] ?? "").trim();
    const secondCell = String(row[1] ?? "").trim();
    if (
      firstCell.toLowerCase().includes("saldos diarios") ||
      secondCell.toLowerCase().includes("saldos diarios")
    ) {
      // Try to extract closing balance from footer
      for (let j = i + 1; j < rows.length; j++) {
        const footerRow = rows[j];
        if (!footerRow) continue;
        const footerText = String(footerRow[1] ?? "").toUpperCase();
        if (footerText.includes("SALDO FINAL") || footerText.includes("CIERRE")) {
          const closingVal = parseNumber(footerRow[0]);
          if (closingVal !== null) result.closingBalance = closingVal;
          break;
        }
        // Last row with a balance value can serve as closing balance
        const lastBalVal = parseNumber(footerRow[0]);
        if (lastBalVal !== null) result.closingBalance = lastBalVal;
      }
      break;
    }

    // Parse transaction row
    const amount = parseNumber(row[0]);
    const description = String(row[1] ?? "").trim();
    const dateStr = String(row[3] ?? "").trim();
    const refRaw = String(row[4] ?? "").trim();
    const branch = String(row[5] ?? "").trim() || null;

    // Skip rows without valid amount or date
    if (amount === null || !dateStr) continue;

    const transactionDate = convertDate(dateStr);
    if (!transactionDate) continue;

    // Reference: treat "000000000" or all-zeros as null
    const reference =
      refRaw && !/^0+$/.test(refRaw) ? refRaw : null;

    result.transactions.push({
      transactionDate,
      description,
      reference,
      amount,
      branch,
    });
  }

  return result;
}
