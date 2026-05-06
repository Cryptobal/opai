"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  Clock,
  Coins,
  TrendingUp,
} from "lucide-react";
import {
  DataTable,
  EmptyState,
  KPICard,
  KPIGrid,
  Tag,
  type DataTableColumn,
  type TagVariant,
} from "@/components/opai-ds";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FinanceFactoringStatus } from "@prisma/client";

export interface OperationRow {
  id: string;
  code: string;
  status: FinanceFactoringStatus;
  fechaCesion: string | null;
  submittedAt: string | null;
  factoringCompany: string;
  factoringCompanyId: string | null;
  factoringRazonSocial: string;
  invoiceAmount: number;
  montoCesion: number | null;
  netAdvance: number;
  plazoDias: number | null;
  aecTrackId: string | null;
  cessionSiiStatus: string | null;
  dteType: number;
  dteFolio: number;
  dteReceiverName: string;
}

interface KpiPayload {
  periodo: string;
  volumeMes: number;
  operationsCount: number;
  costoFinanciero: number;
  plazoPromedio: number;
  pendingApprovedAmount: number;
  pendingApprovedCount: number;
}

interface Props {
  initialOperations: OperationRow[];
  initialKpis: KpiPayload;
  initialPeriodo: string;
  initialTotal: number;
  factoringOptions: { id: string; label: string }[];
}

const STATUS_VARIANT: Record<FinanceFactoringStatus, TagVariant> = {
  SIMULATED: "neutral",
  SUBMITTED: "info",
  APPROVED: "ok",
  FUNDED: "ok",
  COLLECTED: "ok",
  CLOSED: "neutral",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<FinanceFactoringStatus, string> = {
  SIMULATED: "Simulada",
  SUBMITTED: "Enviada",
  APPROVED: "Aprobada",
  FUNDED: "Girada",
  COLLECTED: "Cobrada",
  CLOSED: "Cerrada",
  CANCELLED: "Cancelada",
};

function formatCLP(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CL")}`;
}

function buildPeriodoOptions(now: Date): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - i);
    const v = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push({
      value: v,
      label: d.toLocaleDateString("es-CL", { year: "numeric", month: "long" }),
    });
  }
  return out;
}

export function FactoringOperationsClient({
  initialOperations,
  initialKpis,
  initialPeriodo,
  initialTotal,
  factoringOptions,
}: Props) {
  const [operations, setOperations] = useState(initialOperations);
  const [kpis, setKpis] = useState(initialKpis);
  const [periodo, setPeriodo] = useState(initialPeriodo);
  const [factoringFilter, setFactoringFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(initialTotal);
  const periodOptions = buildPeriodoOptions(new Date());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ periodo, page: "1", pageSize: "20" });
      if (factoringFilter !== "all") params.set("factoringCompanyId", factoringFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const [opsRes, kpisRes] = await Promise.all([
        fetch(`/api/finance/factoring/operations?${params.toString()}`),
        fetch(`/api/finance/factoring/kpis?periodo=${periodo}`),
      ]);
      const opsJson = await opsRes.json();
      const kpisJson = await kpisRes.json();
      if (opsJson.success) {
        setOperations(opsJson.operations.map(adaptOp));
        setTotal(opsJson.total);
      }
      if (kpisJson.success) setKpis(kpisJson.kpis);
    } finally {
      setLoading(false);
    }
  }, [periodo, factoringFilter, statusFilter]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, factoringFilter, statusFilter]);

  const columns: DataTableColumn<OperationRow>[] = [
    {
      id: "code",
      header: "Código",
      cell: (o) => (
        <Link
          href={`/finanzas/facturacion/cesiones/${o.id}`}
          className="font-medium text-primary hover:underline font-mono text-sm"
        >
          {o.code}
        </Link>
      ),
    },
    {
      id: "fecha",
      header: "Fecha",
      hideOnMobile: true,
      cell: (o) => (
        <span className="text-sm text-ds-text-2">
          {o.fechaCesion ?? "—"}
        </span>
      ),
    },
    {
      id: "factoring",
      header: "Factoring",
      cell: (o) => (
        <span className="text-sm text-ds-text-1 truncate block max-w-[180px]">
          {o.factoringRazonSocial}
        </span>
      ),
    },
    {
      id: "dte",
      header: "DTE",
      hideOnMobile: true,
      cell: (o) => (
        <span className="text-sm text-ds-text-2 font-mono">
          {o.dteType}-{o.dteFolio}
          <span className="text-ds-text-3"> · {o.dteReceiverName.slice(0, 24)}</span>
        </span>
      ),
    },
    {
      id: "monto",
      header: "Monto",
      align: "right",
      cell: (o) => (
        <span className="text-sm text-ds-text-1 font-mono">
          {formatCLP(o.invoiceAmount)}
        </span>
      ),
    },
    {
      id: "anticipo",
      header: "Neto a girar",
      align: "right",
      hideOnMobile: true,
      cell: (o) => (
        <span className="text-sm text-ds-text-2 font-mono">
          {formatCLP(o.netAdvance)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Estado",
      cell: (o) => (
        <Tag variant={STATUS_VARIANT[o.status]} size="sm">
          {STATUS_LABEL[o.status]}
        </Tag>
      ),
    },
    {
      id: "go",
      header: "",
      cell: () => <ChevronRight className="h-4 w-4 text-ds-text-3" />,
    },
  ];

  return (
    <div className="space-y-4">
      <KPIGrid lgCols={4}>
        <KPICard
          label="Volumen del mes"
          value={formatCLP(kpis.volumeMes)}
          hint={`${kpis.operationsCount} operaciones`}
          icon={Coins}
          iconTone="teal"
        />
        <KPICard
          label="Pendientes de giro"
          value={formatCLP(kpis.pendingApprovedAmount)}
          hint={`${kpis.pendingApprovedCount} aprobadas sin fondear`}
          icon={Clock}
          iconTone="amber"
        />
        <KPICard
          label="Costo financiero"
          value={formatCLP(kpis.costoFinanciero)}
          hint="Intereses + comisiones del mes"
          icon={TrendingUp}
          iconTone="rose"
        />
        <KPICard
          label="Plazo promedio"
          value={kpis.plazoPromedio || 0}
          hint="días de financiamiento"
          icon={kpis.plazoPromedio > 60 ? ArrowUp : ArrowDown}
          iconTone="violet"
        />
      </KPIGrid>

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {periodOptions.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={factoringFilter} onValueChange={setFactoringFilter}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-56">
            <SelectValue placeholder="Todos los factorings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los factorings</SelectItem>
            {factoringOptions.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-10 sm:h-9 w-full sm:w-44">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.keys(STATUS_LABEL) as FinanceFactoringStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-ds-text-3 ml-auto">
          {loading ? "Cargando…" : `${total} operaciones`}
        </span>
      </div>

      {operations.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="Sin cesiones en este período"
          description="Cuando cedas una factura desde la ficha del DTE aparecerá acá con su trazabilidad SII."
        />
      ) : (
        <DataTable columns={columns} rows={operations} rowKey={(o) => o.id} />
      )}
    </div>
  );
}

interface RawOp {
  id: string;
  code: string;
  status: FinanceFactoringStatus;
  fechaCesion?: string | Date | null;
  submittedAt?: string | Date | null;
  factoringCompany: string;
  factoringCompanyId: string | null;
  factoringCompanyRel?: { razonSocial: string } | null;
  invoiceAmount: number | string;
  montoCesion?: number | string | null;
  netAdvance: number | string;
  plazoDias: number | null;
  aecTrackId: string | null;
  cessionSiiStatus: string | null;
  dte: { dteType: number; folio: number; receiverName: string | null };
}

function adaptOp(o: RawOp): OperationRow {
  return {
    id: o.id,
    code: o.code,
    status: o.status,
    fechaCesion: o.fechaCesion
      ? typeof o.fechaCesion === "string"
        ? o.fechaCesion.slice(0, 10)
        : o.fechaCesion.toISOString().slice(0, 10)
      : null,
    submittedAt: o.submittedAt
      ? typeof o.submittedAt === "string"
        ? o.submittedAt
        : o.submittedAt.toISOString()
      : null,
    factoringCompany: o.factoringCompany,
    factoringCompanyId: o.factoringCompanyId,
    factoringRazonSocial: o.factoringCompanyRel?.razonSocial ?? o.factoringCompany,
    invoiceAmount: Number(o.invoiceAmount),
    montoCesion: o.montoCesion !== null && o.montoCesion !== undefined ? Number(o.montoCesion) : null,
    netAdvance: Number(o.netAdvance),
    plazoDias: o.plazoDias,
    aecTrackId: o.aecTrackId,
    cessionSiiStatus: o.cessionSiiStatus,
    dteType: o.dte.dteType,
    dteFolio: o.dte.folio,
    dteReceiverName: o.dte.receiverName ?? "",
  };
}
