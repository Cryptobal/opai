"use client";

/**
 * DtePaymentTag — badge de "Pago / Conciliación" para listados de DTE
 * (emitidos y recibidos).
 *
 * Combina dos señales:
 *   1. `paymentStatus` del DTE: UNPAID | PARTIAL | PAID | OVERDUE |
 *      WRITTEN_OFF | CEDED → variante de color.
 *   2. `lastReconciliation` opcional (post 2026-05): si el DTE fue
 *      conciliado contra un movimiento bancario, agrega tooltip
 *      "Conciliado el {fecha} con mov. {referencia/descripción}".
 *
 * Nada de hex hardcoded: todo via tokens del DS (`<Tag>`).
 */

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Tag } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

export interface DtePaymentTagProps {
  paymentStatus: string | null | undefined;
  totalAmount: number;
  amountPaid?: number;
  amountPending?: number;
  lastReconciliation?: {
    paymentCode: string;
    paymentDate: string;
    bankTransactionDate: string | null;
    bankTransactionReference: string | null;
    bankTransactionDescription: string | null;
  } | null;
  size?: "sm" | "md";
  className?: string;
}

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function DtePaymentTag({
  paymentStatus,
  totalAmount,
  amountPaid,
  amountPending,
  lastReconciliation,
  size = "sm",
  className,
}: DtePaymentTagProps) {
  if (!paymentStatus) {
    // DTE sin paymentStatus poblado (raro, datos legacy).
    return (
      <Tag variant="neutral" size={size} className={className}>
        —
      </Tag>
    );
  }

  let variant: "ok" | "warn" | "danger" | "info" | "neutral" | "brand" =
    "neutral";
  let label = paymentStatus;
  switch (paymentStatus) {
    case "PAID":
      variant = "ok";
      label = "Pagado";
      break;
    case "PARTIAL":
      variant = "warn";
      label =
        amountPaid != null && amountPending != null
          ? `Parcial ${fmtCLP.format(amountPaid)}/${fmtCLP.format(totalAmount)}`
          : "Parcial";
      break;
    case "UNPAID":
      variant = "neutral";
      label = "Sin pagar";
      break;
    case "OVERDUE":
      variant = "danger";
      label = "Vencido";
      break;
    case "CEDED":
      variant = "brand";
      label = "Cedido";
      break;
    case "WRITTEN_OFF":
      variant = "neutral";
      label = "Castigado";
      break;
    default:
      variant = "neutral";
      label = paymentStatus;
  }

  // Tooltip: si hay conciliación con cartola, mostramos el detalle del
  // movimiento; si solo hay pago formal sin tx bancaria (ej. bulk-mark-paid),
  // mostramos código y fecha del recibo. Si no hay ninguno, solo el label.
  let title = label;
  if (lastReconciliation?.bankTransactionDate) {
    const txDate = format(
      new Date(lastReconciliation.bankTransactionDate),
      "dd MMM yyyy",
      { locale: es }
    );
    const txRef =
      lastReconciliation.bankTransactionReference ??
      lastReconciliation.bankTransactionDescription ??
      "movimiento bancario";
    title = `Conciliado el ${txDate} con ${txRef} · Recibo ${lastReconciliation.paymentCode}`;
  } else if (lastReconciliation) {
    const payDate = format(
      new Date(lastReconciliation.paymentDate),
      "dd MMM yyyy",
      { locale: es }
    );
    title = `Pagado el ${payDate} · Recibo ${lastReconciliation.paymentCode}`;
  }

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1",
        paymentStatus === "WRITTEN_OFF" && "line-through opacity-70",
        className,
      )}
    >
      <Tag variant={variant} size={size}>
        {label}
      </Tag>
    </span>
  );
}
