"use client";

import { useState, useEffect } from "react";
import { DataTable, type DataTableColumn } from "@/components/opai/DataTable";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatMoney(amount?: number | null): string {
  if (amount == null) return "$0";
  return `$${amount.toLocaleString("es-CL")}`;
}

export function FondosManagement() {
  const [fondos, setFondos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/fondos")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setFondos(res.data ?? []);
        else toast.error("Error al cargar fondos");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "tipo", label: "Tipo" },
    {
      key: "monto",
      label: "Monto",
      render: (v: number) => formatMoney(v),
    },
    {
      key: "fechaInicio",
      label: "Inicio",
      render: (v: string) => formatDate(v),
    },
    {
      key: "fechaFin",
      label: "Fin",
      render: (v: string) => formatDate(v),
    },
    {
      key: "_actions",
      label: "",
      className: "w-20",
      render: (_: any, row: any) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-status-danger-fg hover:text-status-danger-fg">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Fondos {!loading && `(${fondos.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Fondo
        </Button>
      </div>
      <DataTable columns={columns} data={fondos} loading={loading} compact />
    </div>
  );
}
