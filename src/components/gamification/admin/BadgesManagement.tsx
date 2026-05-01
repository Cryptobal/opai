"use client";

import { useState, useEffect } from "react";
import { DataTable, type DataTableColumn } from "@/components/opai/DataTable";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function BadgesManagement() {
  const [badges, setBadges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/gamification/badges")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setBadges(res.data ?? []);
        else toast.error("Error al cargar badges");
      })
      .catch(() => toast.error("Error de conexión"))
      .finally(() => setLoading(false));
  }, []);

  const columns: DataTableColumn[] = [
    {
      key: "icono",
      label: "Ícono",
      className: "w-12 text-center",
      render: (v: string) => <span className="text-lg">{v || "🏅"}</span>,
    },
    { key: "nombre", label: "Nombre" },
    { key: "categoria", label: "Categoría" },
    {
      key: "puntosBonus",
      label: "Puntos",
      render: (v: number) => (
        <span className="text-status-ok-fg font-medium">+{v ?? 0}</span>
      ),
    },
    {
      key: "secreto",
      label: "Secreto",
      render: (v: boolean) =>
        v ? (
          <span className="text-status-warn-fg text-xs">Sí</span>
        ) : (
          <span className="text-muted-foreground text-xs">No</span>
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
          Badges {!loading && `(${badges.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Badge
        </Button>
      </div>
      <DataTable columns={columns} data={badges} loading={loading} compact />
    </div>
  );
}
