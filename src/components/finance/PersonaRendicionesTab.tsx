"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Receipt, DollarSign, CheckCircle2, Clock } from "lucide-react";
import { getRendicionStatusConfig } from "@/lib/finance/rendicion-status";

interface PersonaRendicion {
  id: string;
  code: string;
  type: string;
  status: string;
  amount: number;
  date: string;
  description: string | null;
  documentType: string | null;
}

interface PersonaRendicionesTabProps {
  adminId: string; // The Admin.id associated with this persona
}

// Mapeo de estado movido a `@/lib/finance/rendicion-status`.

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: "Compra",
  MILEAGE: "Kilometraje",
};

const formatCLP = (amount: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);

export function PersonaRendicionesTab({ adminId }: PersonaRendicionesTabProps) {
  const [rendiciones, setRendiciones] = useState<PersonaRendicion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/finance/rendiciones?submitterId=${adminId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setRendiciones(data.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [adminId]);

  const totalAmount = rendiciones.reduce((sum, r) => sum + r.amount, 0);
  const approvedAmount = rendiciones
    .filter((r) => r.status === "APPROVED" || r.status === "PAID")
    .reduce((sum, r) => sum + r.amount, 0);
  const paidAmount = rendiciones
    .filter((r) => r.status === "PAID")
    .reduce((sum, r) => sum + r.amount, 0);
  const pendingCount = rendiciones.filter((r) =>
    ["SUBMITTED", "IN_APPROVAL"].includes(r.status)
  ).length;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-20 bg-muted rounded-lg" />
        <div className="h-40 bg-muted rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4 flex items-center gap-3 transition-colors hover:bg-card/60 hover:border-border">
          <Receipt className="h-5 w-5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Total rendiciones</p>
            <p className="text-lg font-semibold tabular-nums">{rendiciones.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4 flex items-center gap-3 transition-colors hover:bg-card/60 hover:border-border">
          <DollarSign className="h-5 w-5 text-status-ok-fg shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Monto aprobado</p>
            <p className="text-lg font-semibold tabular-nums">{formatCLP(approvedAmount)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4 flex items-center gap-3 transition-colors hover:bg-card/60 hover:border-border">
          <CheckCircle2 className="h-5 w-5 text-tint-violet-fg shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Monto pagado</p>
            <p className="text-lg font-semibold tabular-nums">{formatCLP(paidAmount)}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4 flex items-center gap-3 transition-colors hover:bg-card/60 hover:border-border">
          <Clock className="h-5 w-5 text-status-warn-fg shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Pendientes</p>
            <p className="text-lg font-semibold tabular-nums">{pendingCount}</p>
          </div>
        </div>
      </div>

      {rendiciones.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/40 py-10 text-center text-sm text-muted-foreground">
          No hay rendiciones registradas para esta persona.
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40">
            <p className="text-sm font-semibold text-foreground">Historial de rendiciones</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Código</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Tipo</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Monto</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rendiciones.map((r) => {
                  const cfg = getRendicionStatusConfig(r.status);
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/finanzas/rendiciones/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {r.code}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">
                        {format(new Date(r.date), "dd/MM/yyyy", {
                          locale: es,
                        })}
                      </td>
                      <td className="px-4 py-2.5">
                        {TYPE_LABELS[r.type] || r.type}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatCLP(r.amount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={cfg.className}>{cfg.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
