"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, ExternalLink } from "lucide-react";
import { es } from "date-fns/locale";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
import { EmptyState } from "@/components/opai-ds/EmptyState";
import { Skeleton } from "@/components/opai-ds/Skeleton";
import { formatCalendarDateDisplay } from "@/lib/fx-date";

/**
 * Sección "Facturas recurrentes" del panel de registros asociados de una
 * cuenta CRM. Lista las plantillas `FinanceDteRecurringTemplate` cuyo
 * `crmAccountId` coincide con la cuenta, con su frecuencia y próxima
 * ejecución. El clic lleva a la programación general (no hay ruta por
 * plantilla; la edición es un modal en esa página).
 *
 * El endpoint requiere `facturacion_view`: si el rol no lo tiene (403) la
 * sección se oculta en silencio en vez de mostrar un error.
 */

const FREQ_LABELS: Record<string, string> = {
  monthly: "Mensual",
  biweekly: "Quincenal",
  weekly: "Semanal",
  yearly: "Anual",
};

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

type RecurringRow = {
  id: string;
  name: string;
  isActive: boolean;
  frequency: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
  nextRunAt: string | null;
  crmAccountId: string | null;
};

function formatFrequency(t: RecurringRow): string {
  const base = FREQ_LABELS[t.frequency] ?? t.frequency;
  if (t.frequency === "monthly") {
    if (t.dayOfMonth === -1) return `${base} · último día`;
    return `${base} · día ${t.dayOfMonth ?? 1}`;
  }
  if (t.frequency === "weekly" || t.frequency === "biweekly") {
    return `${base} · ${DOW_LABELS[t.dayOfWeek ?? 1]}`;
  }
  if (t.frequency === "yearly") {
    return `${base} · ${t.monthOfYear ?? 1}/${t.dayOfMonth ?? 1}`;
  }
  return base;
}

function formatRunDate(iso: string | null): string {
  if (!iso) return "—";
  return formatCalendarDateDisplay(iso, "dd MMM yyyy", es);
}

const PROGRAMACION_HREF = "/finanzas/facturacion/programacion";

export function AssociatedRecurringSection({ accountId }: { accountId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/finance/billing/recurring")
      .then(async (r) => {
        if (r.status === 403) {
          if (!cancelled) setHidden(true);
          return null;
        }
        return r.json();
      })
      .then((j) => {
        if (cancelled || j === null) return;
        if (!j?.success) {
          setError("No se pudieron cargar las facturas recurrentes");
          return;
        }
        const all: RecurringRow[] = j.data?.templates ?? [];
        setRows(all.filter((t) => t.crmAccountId === accountId));
      })
      .catch(() => !cancelled && setError("No se pudieron cargar las facturas recurrentes"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  if (hidden) return null;

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-ds-md border border-status-danger-border bg-status-danger-soft p-3 text-xs text-status-danger-fg">
        {error}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-8 w-8" />}
        title="Sin facturas recurrentes"
        description="No hay programación de facturas recurrentes para esta cuenta."
        compact
      />
    );
  }

  return (
    <div className="space-y-3">
      <CrmRelatedRecordGrid className="!grid-cols-1">
        {rows.map((t) => (
          <CrmRelatedRecordCard
            key={t.id}
            module="quotes"
            title={t.name}
            subtitle={formatFrequency(t)}
            meta={t.nextRunAt ? `Próxima: ${formatRunDate(t.nextRunAt)}` : undefined}
            badge={
              t.isActive
                ? { label: "Activa", variant: "success" }
                : { label: "Pausada", variant: "secondary" }
            }
            href={PROGRAMACION_HREF}
          />
        ))}
      </CrmRelatedRecordGrid>
      <div className="flex items-center justify-end">
        <Link
          href={PROGRAMACION_HREF}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Ver programación <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
