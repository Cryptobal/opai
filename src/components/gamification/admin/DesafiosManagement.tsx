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

export function DesafiosManagement() {
  const [desafios, setDesafios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/desafios")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setDesafios(res.data ?? []);
        else toast.error("Error al cargar desafíos");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    { key: "nombre", label: "Nombre" },
    { key: "tipo", label: "Tipo" },
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
      key: "recompensaPuntos",
      label: "Puntos",
      render: (v: number) => (
        <span className="text-status-ok-fg font-medium">+{v ?? 0}</span>
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
          Desafíos {!loading && `(${desafios.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Desafío
        </Button>
      </div>
      <DataTable columns={columns} data={desafios} loading={loading} compact />
    </div>
  );
}
