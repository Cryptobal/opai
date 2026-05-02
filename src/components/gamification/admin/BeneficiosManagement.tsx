"use client";

import { useState, useEffect } from "react";
import { DataTable, type DataTableColumn } from "@/components/opai-ds/DataTableLegacy";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

export function BeneficiosManagement() {
  const [beneficios, setBeneficios] = useState<any[]>([]);
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

  const columns: DataTableColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "categoria", label: "Categoría" },
    {
      key: "costoPuntos",
      label: "Costo",
      render: (v: number) => (
        <span className="font-medium">{v ?? 0} pts</span>
      ),
    },
    { key: "proveedor", label: "Proveedor" },
    {
      key: "disponible",
      label: "Activo",
      className: "w-16 text-center",
      render: (v: boolean) =>
        v ? (
          <Check className="h-4 w-4 text-status-ok-fg mx-auto" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground mx-auto" />
        ),
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
          Beneficios {!loading && `(${beneficios.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Beneficio
        </Button>
      </div>
      <DataTable columns={columns} data={beneficios} loading={loading} compact />
    </div>
  );
}
