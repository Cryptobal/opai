"use client";

import { useState, useTransition } from "react";
import type {
  FinanceReportPeriod,
  LedgerEntry,
  LedgerResult,
} from "@/modules/finance/reports/shared/types";
import {
  KPICard,
  KPIGrid,
  Surface,
  DataTable,
  type DataTableColumn,
  EmptyState,
} from "@/components/opai-ds";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportsPeriodPicker } from "./ReportsPeriodPicker";
import { ExportMenu } from "./ExportMenu";

interface Props {
  accountId: string;
  initialPeriod: FinanceReportPeriod;
  initialData: LedgerResult;
}

const fmtCLP = (n: number): string =>
  "$" + new Intl.NumberFormat("es-CL").format(Math.round(n));

const fmtCLPShort = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}MM`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs}`;
};

export function AccountDrillClient({ accountId, initialPeriod, initialData }: Props) {
  const [period, setPeriod] = useState(initialPeriod);
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();

  const refetch = (p: FinanceReportPeriod) => {
    setPeriod(p);
    startTransition(async () => {
      const res = await fetch("/api/finance/reports/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, period: p, filters: {} }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) setData(json.data);
      }
    });
  };

  const columns: DataTableColumn<LedgerEntry>[] = [
    {
      id: "date",
      header: "Fecha",
      align: "left",
      width: "w-24",
      cell: (e) => <span className="text-ds-text-2 ds-num">{e.date}</span>,
    },
    {
      id: "num",
      header: "N°",
      align: "right",
      width: "w-12",
      cell: (e) => <span className="text-ds-text-3 font-mono">{e.entryNumber}</span>,
    },
    {
      id: "desc",
      header: "Descripción",
      align: "left",
      cell: (e) => <span className="text-ds-text-1">{e.description}</span>,
    },
    {
      id: "ref",
      header: "Ref",
      align: "left",
      width: "w-24",
      hideOnMobile: true,
      cell: (e) => (
        <span className="text-ds-text-3 font-mono text-xs">{e.reference ?? "—"}</span>
      ),
    },
    {
      id: "cc",
      header: "CC",
      align: "left",
      hideOnMobile: true,
      cell: (e) => (
        <span className="text-ds-text-3 truncate">{e.costCenterName ?? "—"}</span>
      ),
    },
    {
      id: "debit",
      header: "Debe",
      align: "right",
      cell: (e) => (
        <span className="text-status-ok-fg" title={e.debit ? fmtCLP(e.debit) : ""}>
          {e.debit ? fmtCLPShort(e.debit) : ""}
        </span>
      ),
    },
    {
      id: "credit",
      header: "Haber",
      align: "right",
      cell: (e) => (
        <span className="text-status-danger-fg" title={e.credit ? fmtCLP(e.credit) : ""}>
          {e.credit ? fmtCLPShort(e.credit) : ""}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Saldo",
      align: "right",
      cell: (e) => (
        <span className="text-ds-text-1 font-semibold" title={fmtCLP(e.runningBalance)}>
          {fmtCLPShort(e.runningBalance)}
        </span>
      ),
    },
  ];

  return (
    <div className={cn("space-y-5", isPending && "opacity-70")}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ReportsPeriodPicker value={period} onChange={refetch} />
        <ExportMenu
          endpoint="/api/finance/reports/ledger/export"
          payload={{ accountId, period, filters: {} }}
          filenameBase={`mayor-${data.account.code}-${period.from}-${period.to}`}
        />
      </div>

      <KPIGrid>
        <KPICard
          label="Saldo inicial"
          value={
            <span title={fmtCLP(data.openingBalance)}>{fmtCLPShort(data.openingBalance)}</span>
          }
          variant="brand"
        />
        <KPICard
          label="Total débitos"
          value={
            <span title={fmtCLP(data.totalDebit)}>{fmtCLPShort(data.totalDebit)}</span>
          }
          iconTone="emerald"
          variant="ok"
        />
        <KPICard
          label="Total créditos"
          value={
            <span title={fmtCLP(data.totalCredit)}>{fmtCLPShort(data.totalCredit)}</span>
          }
          iconTone="rose"
          variant="danger"
        />
        <KPICard
          label="Saldo final"
          value={
            <span title={fmtCLP(data.closingBalance)}>{fmtCLPShort(data.closingBalance)}</span>
          }
          hint={`${data.entries.length} mov.`}
          variant={data.closingBalance >= 0 ? "ok" : "danger"}
        />
      </KPIGrid>

      {data.entries.length === 0 ? (
        <Surface padding="lg">
          <EmptyState
            icon={BookOpen}
            title="Sin movimientos en el período"
            description="No hay asientos posted para esta cuenta dentro del rango seleccionado."
          />
        </Surface>
      ) : (
        <DataTable
          columns={columns}
          rows={data.entries}
          rowKey={(_, i) => `entry-${i}`}
        />
      )}
    </div>
  );
}
