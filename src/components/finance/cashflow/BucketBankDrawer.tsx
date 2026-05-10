"use client";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Loader2 } from "lucide-react";

const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

interface BankTx {
  id: string;
  date: string;
  description: string;
  amount: number;
  reconciliationStatus: string;
  bankAccountName: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketKey: string | null;
  granularity: "weekly" | "monthly";
}

export function BucketBankDrawer({ open, onOpenChange, bucketKey, granularity }: Props) {
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<BankTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bucketLabel, setBucketLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !bucketKey) return;
    setLoading(true);
    setError(null);
    setTxs(null);
    fetch(
      `/api/finance/cashflow/bucket-bank?key=${encodeURIComponent(bucketKey)}&granularity=${granularity}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) {
          setTxs(j.data.transactions);
          const start = new Date(j.data.start);
          const end = new Date(j.data.end);
          const f = new Intl.DateTimeFormat("es-CL", {
            day: "2-digit",
            month: "short",
          });
          setBucketLabel(`${f.format(start)} – ${f.format(end)}`);
        } else {
          setError(j?.error ?? "Error al cargar movimientos");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error de red"))
      .finally(() => setLoading(false));
  }, [open, bucketKey, granularity]);

  const totalCredit = (txs ?? []).filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalDebit = (txs ?? []).filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Movimientos del bucket</SheetTitle>
          {bucketLabel && (
            <p className="text-[12px] text-ds-text-3">
              {bucketKey} · {bucketLabel}
            </p>
          )}
        </SheetHeader>

        {loading && (
          <div className="flex items-center gap-2 mt-4 text-[13px] text-ds-text-3">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando...
          </div>
        )}

        {error && (
          <p className="mt-4 text-[13px] text-status-warn-fg">{error}</p>
        )}

        {!loading && txs && txs.length === 0 && (
          <p className="mt-4 text-[13px] text-ds-text-3">
            No hay movimientos bancarios en este bucket.
          </p>
        )}

        {!loading && txs && txs.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-2 mt-4 mb-3">
              <div className="rounded-ds-md bg-status-ok-soft p-2">
                <p className="text-[12px] text-status-ok-fg">Créditos</p>
                <p className="font-mono text-[14px] font-semibold text-status-ok-fg">
                  {fmt.format(totalCredit)}
                </p>
              </div>
              <div className="rounded-ds-md bg-status-warn-soft p-2">
                <p className="text-[12px] text-status-warn-fg">Débitos</p>
                <p className="font-mono text-[14px] font-semibold text-status-warn-fg">
                  {fmt.format(totalDebit)}
                </p>
              </div>
            </div>
            <ul className="space-y-1.5">
              {txs.map((tx) => {
                const isCredit = tx.amount > 0;
                const tone = isCredit ? "text-status-ok-fg" : "text-status-warn-fg";
                const dateStr = new Date(tx.date).toLocaleDateString("es-CL", {
                  day: "2-digit",
                  month: "2-digit",
                });
                return (
                  <li
                    key={tx.id}
                    className="flex items-start justify-between gap-2 p-2 rounded-ds-sm bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] truncate" title={tx.description}>
                        {tx.description}
                      </p>
                      <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                        {dateStr} · {tx.bankAccountName ?? "—"} ·{" "}
                        {tx.reconciliationStatus}
                      </p>
                    </div>
                    <p className={`font-mono text-[13px] shrink-0 ${tone}`}>
                      {isCredit ? "+" : "−"}
                      {fmt.format(Math.abs(tx.amount))}
                    </p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
