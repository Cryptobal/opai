"use client";

import { SalesMatrixClient } from "./SalesMatrixClient";
import type {
  FinanceMatrixResult,
  FinanceReportPeriod,
} from "@/modules/finance/reports/shared/types";

interface Props {
  initialPeriod: FinanceReportPeriod;
  initialData: FinanceMatrixResult;
}

export function PurchasesMatrixClient({ initialPeriod, initialData }: Props) {
  return (
    <SalesMatrixClient
      initialPeriod={initialPeriod}
      initialData={initialData}
      endpoint="/api/finance/reports/purchases-matrix"
      exportEndpoint="/api/finance/reports/purchases-matrix/export"
      accent="#F43F5E"
      drilldownBase="/finanzas/reportes/ventas"
      filenameBase="compras"
    />
  );
}
