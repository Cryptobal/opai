"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Receipt, DollarSign, CheckCircle2, Clock } from "lucide-react";

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

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Borrador",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  },
  SUBMITTED: {
    label: "Enviada",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  IN_APPROVAL: {
    label: "En aprobación",
    className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  APPROVED: {
    label: "Aprobada",
    className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  REJECTED: {
    label: "Rechazada",
    className: "bg-red-500/15 text-red-400 border-red-500/30",
  },
  PAID: {
    label: "Pagada",
    className: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
};

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
      <div className="grid gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Total rendiciones</p>
              <p className="text-lg font-semibold">{rendiciones.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">Monto aprobado</p>
              <p className="text-lg font-semibold">{formatCLP(approvedAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-purple-400" />
            <div>
              <p className="text-xs text-muted-foreground">Monto pagado</p>
              <p className="text-lg font-semibold">{formatCLP(paidAmount)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-400" />
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="text-lg font-semibold">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {rendiciones.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No hay rendiciones registradas para esta persona.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Historial de rendiciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Código</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Monto</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {rendiciones.map((r) => {
                    const cfg = STATUS_CONFIG[r.status] ?? {
                      label: r.status,
                      className: "bg-zinc-500/15 text-zinc-400",
                    };
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border/60 last:border-0 hover:bg-accent/30"
                      >
                        <td className="px-3 py-2">
                          <Link
                            href={`/finanzas/rendiciones/${r.id}`}
                            className="text-primary hover:underline"
                          >
                            {r.code}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {format(new Date(r.date), "dd/MM/yyyy", {
                            locale: es,
                          })}
                        </td>
                        <td className="px-3 py-2">
                          {TYPE_LABELS[r.type] || r.type}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {formatCLP(r.amount)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge className={cfg.className}>{cfg.label}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
