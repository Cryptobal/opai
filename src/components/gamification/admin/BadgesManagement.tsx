"use client";

import { useState, useEffect } from "react";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Award } from "lucide-react";
import { toast } from "sonner";

type BadgeRow = {
  id: string;
  icono?: string;
  nombre: string;
  categoria: string;
  puntosBonus?: number;
  secreto?: boolean;
};

export function BadgesManagement() {
  const [badges, setBadges] = useState<BadgeRow[]>([]);
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

  const columns: DataTableColumn<BadgeRow>[] = [
    {
      id: "icono",
      header: "Ícono",
      align: "center",
      width: "w-12",
      cell: (row) => <span className="text-lg">{row.icono || "🏅"}</span>,
    },
    { id: "nombre", header: "Nombre", cell: (row) => row.nombre },
    { id: "categoria", header: "Categoría", cell: (row) => row.categoria },
    {
      id: "puntosBonus",
      header: "Puntos",
      cell: (row) => (
        <span className="text-status-ok-fg font-medium">+{row.puntosBonus ?? 0}</span>
      ),
    },
    {
      id: "secreto",
      header: "Secreto",
      cell: (row) =>
        row.secreto ? (
          <span className="text-status-warn-fg text-xs">Sí</span>
        ) : (
          <span className="text-muted-foreground text-xs">No</span>
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
          Badges {!loading && `(${badges.length})`}
        </h2>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo Badge
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={badges}
        rowKey={(row) => row.id}
        loading={loading}
        empty={<EmptyState icon={Award} title="Sin badges" compact />}
      />
    </div>
  );
}
