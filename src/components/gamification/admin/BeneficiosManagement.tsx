"use client";

import { useState, useEffect } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X, Gift } from "lucide-react";
import { toast } from "sonner";

type BeneficioRow = {
  id: string;
  nombre: string;
  categoria: string;
  costoPuntos?: number;
  proveedor: string;
  disponible?: boolean;
};

export function BeneficiosManagement() {
  const [beneficios, setBeneficios] = useState<BeneficioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/beneficios")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setBeneficios(res.data ?? []);
        else toast.error("Error al cargar beneficios");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn<BeneficioRow>[] = [
    { id: "nombre", header: "Nombre", cell: (row) => row.nombre },
    { id: "categoria", header: "Categoría", cell: (row) => row.categoria },
    {
      id: "costoPuntos",
      header: "Costo",
      cell: (row) => (
        <span className="font-medium">{row.costoPuntos ?? 0} pts</span>
      ),
    },
    { id: "proveedor", header: "Proveedor", cell: (row) => row.proveedor },
    {
      id: "disponible",
      header: "Activo",
      align: "center",
      width: "w-16",
      cell: (row) =>
        row.disponible ? (
          <Check className="h-4 w-4 text-status-ok-fg mx-auto" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground mx-auto" />
        ),
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
          Beneficios {!loading && `(${beneficios.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Beneficio
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={beneficios}
        rowKey={(row) => row.id}
        loading={loading}
        empty={<EmptyState icon={Gift} title="Sin beneficios" compact />}
      />
    </div>
  );
}
