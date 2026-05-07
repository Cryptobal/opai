import { SalesMatrixPdf } from "./SalesMatrixPdf";
import type { FinanceMatrixResult } from "../../shared/types";

export function PurchasesMatrixPdf({
  data,
  tenantName,
}: {
  data: FinanceMatrixResult;
  tenantName: string;
}) {
  return SalesMatrixPdf({
    data,
    tenantName,
    accent: "#F43F5E",
    title: "Compras por centro de costo",
  });
}
