"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Surface } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Lock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface UnassignedTx {
  id: string;
  transactionDate: string;
  description: string;
  amount: number;
  accountPlanCode: string | null;
}

interface UnfulfilledProj {
  occurrenceId: string;
  itemName: string;
  installationName: string | null;
  scheduledDate: string;
  amountClp: number;
  kind: "INCOME" | "EXPENSE";
  categoryCode: string;
}

interface Snapshot {
  weekStartDate: string;
  weekEndDate: string;
  bankBalanceClp: number;
  projectedBalanceClp: number;
  varianceClp: number;
  unassignedBank: UnassignedTx[];
  unfulfilledProj: UnfulfilledProj[];
}

interface HistEntry {
  id: string;
  weekEndDate: string;
  bankBalanceClp: number;
  varianceClp: number;
  closedAt: string;
}

interface Props {
  initialSnapshot: Snapshot;
  initialHistory: HistEntry[];
  canManage: boolean;
}

const fmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

export function WeeklyCloseClient({ initialSnapshot, initialHistory, canManage }: Props) {
  const router = useRouter();
  const [snapshot] = useState<Snapshot>(initialSnapshot);
  const [closing, setClosing] = useState(false);

  const weekEnd = new Date(snapshot.weekEndDate);
  const variance = snapshot.varianceClp;
  const varianceTone =
    Math.abs(variance) < 50_000
      ? "text-status-ok-fg"
      : variance > 0
      ? "text-status-info-fg"
      : "text-status-warn-fg";

  const close = async () => {
    if (
      !confirm(
        `¿Cerrar la semana al ${weekEnd.toLocaleDateString("es-CL")}? Esto persiste el snapshot pero no bloquea ediciones.`,
      )
    )
      return;
    setClosing(true);
    try {
      const res = await fetch("/api/finance/cashflow/weekly-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekEnd: snapshot.weekEndDate }),
      });
      const j = await res.json();
      if (!j?.success) throw new Error(j?.error ?? "Error");
      toast.success("Semana cerrada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setClosing(false);
    }
  };

  return (
    <Surface className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="Saldo banco al cierre"
          value={fmt.format(snapshot.bankBalanceClp)}
          sub={`Cierre ${weekEnd.toLocaleDateString("es-CL")}`}
        />
        <KpiCard
          label="Saldo proyectado"
          value={fmt.format(snapshot.projectedBalanceClp)}
          sub="apertura + ingresos − egresos"
        />
        <KpiCard
          label="Varianza"
          value={`${variance > 0 ? "+" : ""}${fmt.format(variance)}`}
          sub={`${snapshot.unassignedBank.length + snapshot.unfulfilledProj.length} excepciones`}
          tone={varianceTone}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ExceptionList
          title="Movimientos sin asignar"
          subtitle="Banco tiene, flujo no"
          tone="warn"
          count={snapshot.unassignedBank.length}
          totalClp={snapshot.unassignedBank.reduce((s, t) => s + Math.abs(t.amount), 0)}
        >
          {snapshot.unassignedBank.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 p-3 border-t border-border first:border-t-0"
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium truncate">{t.description}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {new Date(t.transactionDate).toLocaleDateString("es-CL")} ·{" "}
                  {t.accountPlanCode ?? "sin cuenta"}
                </div>
              </div>
              <div
                className={`text-[13px] font-mono font-semibold ${t.amount > 0 ? "text-status-ok-fg" : "text-status-warn-fg"}`}
              >
                {t.amount > 0 ? "+" : ""}
                {fmt.format(t.amount)}
              </div>
            </li>
          ))}
          {snapshot.unassignedBank.length === 0 && <EmptyOk label="Todos asignados ✓" />}
        </ExceptionList>

        <ExceptionList
          title="Proyecciones sin ejecutar"
          subtitle="Flujo tiene, banco no"
          tone="info"
          count={snapshot.unfulfilledProj.length}
          totalClp={snapshot.unfulfilledProj.reduce((s, p) => s + p.amountClp, 0)}
        >
          {snapshot.unfulfilledProj.map((p) => (
            <li
              key={p.occurrenceId}
              className="flex items-center justify-between gap-3 p-3 border-t border-border first:border-t-0"
            >
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium truncate">
                  {p.itemName}
                  {p.installationName ? ` · ${p.installationName}` : ""}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {new Date(p.scheduledDate).toLocaleDateString("es-CL")} · {p.categoryCode}
                </div>
              </div>
              <div
                className={`text-[13px] font-mono font-semibold ${p.kind === "INCOME" ? "text-status-ok-fg" : "text-status-warn-fg"}`}
              >
                {p.kind === "INCOME" ? "+" : "−"}
                {fmt.format(p.amountClp)}
              </div>
            </li>
          ))}
          {snapshot.unfulfilledProj.length === 0 && <EmptyOk label="Todas ejecutadas ✓" />}
        </ExceptionList>
      </div>

      {canManage && (
        <div className="flex justify-end pt-4 border-t border-border">
          <Button onClick={close} disabled={closing}>
            {closing ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
            ) : (
              <Lock className="h-3 w-3 mr-1.5" />
            )}
            Cerrar semana
          </Button>
        </div>
      )}

      {initialHistory.length > 0 && (
        <details className="border border-border rounded-md p-3">
          <summary className="text-[12px] text-muted-foreground cursor-pointer">
            Historial de cierres · {initialHistory.length}
          </summary>
          <ul className="mt-2 space-y-1">
            {initialHistory.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between text-[11.5px] font-mono py-1 border-t border-border/40 first:border-0"
              >
                <span>{new Date(h.weekEndDate).toLocaleDateString("es-CL")}</span>
                <span>saldo {fmt.format(h.bankBalanceClp)}</span>
                <span
                  className={
                    Math.abs(h.varianceClp) < 50_000
                      ? "text-status-ok-fg"
                      : "text-status-warn-fg"
                  }
                >
                  Δ {h.varianceClp > 0 ? "+" : ""}
                  {fmt.format(h.varianceClp)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Surface>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-[10px] uppercase tracking-[0.08em] font-mono text-muted-foreground">
        {label}
      </div>
      <div className={`text-[24px] font-mono font-semibold mt-1.5 ${tone ?? ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function ExceptionList({
  title,
  subtitle,
  tone,
  count,
  totalClp,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "warn" | "info";
  count: number;
  totalClp: number;
  children: React.ReactNode;
}) {
  const toneClass = tone === "warn" ? "text-status-warn-fg" : "text-status-info-fg";
  return (
    <section className="rounded-md border border-border bg-card overflow-hidden">
      <header className="p-3 border-b border-border flex items-center justify-between">
        <div>
          <div className={`text-[9.5px] uppercase font-mono tracking-[0.08em] ${toneClass}`}>
            {subtitle}
          </div>
          <h3 className="text-[14px] font-semibold">
            {title} · <span className="font-mono">{count}</span>
          </h3>
        </div>
        <span className="text-[11px] font-mono text-muted-foreground">{fmt.format(totalClp)}</span>
      </header>
      <ul>{children}</ul>
    </section>
  );
}

function EmptyOk({ label }: { label: string }) {
  return (
    <div className="p-6 text-center text-[12px] text-status-ok-fg">
      <CheckCircle2 className="h-4 w-4 inline-block mr-1.5" /> {label}
    </div>
  );
}
