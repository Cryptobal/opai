"use client";

import { useState, useEffect } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, PiggyBank } from "lucide-react";
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

type FondoRow = {
  id: string;
  nombre: string;
  tipo: string;
  monto?: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
};

export function FondosManagement() {
  const [fondos, setFondos] = useState<FondoRow[]>([]);
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

  const columns: DataTableColumn<FondoRow>[] = [
    { id: "nombre", header: "Nombre", cell: (row) => row.nombre },
    { id: "tipo", header: "Tipo", cell: (row) => row.tipo },
    {
      id: "monto",
      header: "Monto",
      align: "right",
      cell: (row) => formatMoney(row.monto),
    },
    {
      id: "fechaInicio",
      header: "Inicio",
      cell: (row) => formatDate(row.fechaInicio),
    },
    {
      id: "fechaFin",
      header: "Fin",
      cell: (row) => formatDate(row.fechaFin),
    },
    {
      id: "_actions",
      header: "",
      width: "w-20",
      cell: () => (
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
      <DataTable
        columns={columns}
        rows={fondos}
        rowKey={(row) => row.id}
        loading={loading}
        empty={<EmptyState icon={PiggyBank} title="Sin fondos" compact />}
      />
    </div>
  );
}
