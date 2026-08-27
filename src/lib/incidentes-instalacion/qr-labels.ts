import { todayInChile } from "@/lib/dates-cl";

export const REPORT_QR_STATUS = {
  unassigned: "unassigned",
  assigned: "assigned",
  retired: "retired",
} as const;

export type ReportQrStatus = (typeof REPORT_QR_STATUS)[keyof typeof REPORT_QR_STATUS];

export const REPORT_QR_EVENT = {
  assign: "assign",
  reassign: "reassign",
  unassign: "unassign",
  retire: "retire",
} as const;

export const MIN_LOTE_QUANTITY = 1;
export const MAX_LOTE_QUANTITY = 100;
export const MIGRATION_LOTE_CODE = "L-MIGRACION";

export function formatSerialLabel(serial: number): string {
  return `QR-${String(serial).padStart(5, "0")}`;
}

export function parseSerialLabel(label: string): number | null {
  const m = /^QR-(\d{1,8})$/i.exec(label.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Código de lote `L-YYYYMM-001` en zona Chile. */
export function formatLoteCode(seqInMonth: number, now = new Date()): string {
  const ymd = todayInChile(now);
  const ym = ymd.slice(0, 7).replace("-", "");
  return `L-${ym}-${String(seqInMonth).padStart(3, "0")}`;
}

export function nextLoteSeqFromCodes(codes: string[], now = new Date()): number {
  const prefix = formatLoteCode(1, now).slice(0, -3);
  let max = 0;
  for (const code of codes) {
    if (!code.startsWith(prefix)) continue;
    const n = Number(code.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max + 1;
}

export function assertLoteQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < MIN_LOTE_QUANTITY || quantity > MAX_LOTE_QUANTITY) {
    throw new Error(`La cantidad debe ser un entero entre ${MIN_LOTE_QUANTITY} y ${MAX_LOTE_QUANTITY}.`);
  }
}

export function isReportQrStatus(value: string): value is ReportQrStatus {
  return value === "unassigned" || value === "assigned" || value === "retired";
}
