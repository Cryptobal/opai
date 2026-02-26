"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ProgramacionForm } from "@/components/ops/rondas/programacion-form";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/opai";
import type { DataTableColumn } from "@/components/opai";

interface ProgramacionItem {
  id: string;
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  toleranciaMinutos: number;
  isActive: boolean;
  rondaTemplate?: { name: string } | null;
}

export function RondasProgramacionClient({
  templates,
  initialRows,
}: {
  templates: { id: string; name: string }[];
  initialRows: ProgramacionItem[];
}) {
  const [rows, setRows] = useState(initialRows);

  const columns: DataTableColumn[] = [
    {
      key: "rondaTemplate",
      label: "Plantilla",
      render: (_v, row) => row.rondaTemplate?.name ?? row.rondaTemplateId,
    },
    { key: "diasSemana", label: "Días", render: (v) => v.join(",") },
    {
      key: "horario",
      label: "Horario",
      render: (_v, row) => `${row.horaInicio} - ${row.horaFin}`,
    },
    { key: "frecuenciaMinutos", label: "Frecuencia", render: (v) => `${v} min` },
    { key: "isActive", label: "Estado", render: (v) => (v ? "Activa" : "Inactiva") },
    {
      key: "actions",
      label: "Acciones",
      className: "text-right",
      render: (_v, row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={async () => {
              const res = await fetch("/api/ops/rondas/ejecuciones", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ programacionId: row.id }),
              });
              const json = await res.json();
              if (!res.ok || !json.success) {
                toast.error(json.error ?? "No se pudieron generar ejecuciones");
                return;
              }
              toast.success(`Generadas: ${json.data.created}`);
            }}
          >
            Generar 24h
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={async () => {
              const res = await fetch(`/api/ops/rondas/programacion/${row.id}`, { method: "DELETE" });
              const json = await res.json();
              if (!res.ok || !json.success) {
                toast.error(json.error ?? "No se pudo eliminar");
                return;
              }
              setRows((prev) => prev.filter((it) => it.id !== row.id));
              toast.success("Programación eliminada");
            }}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <ProgramacionForm
        templates={templates}
        onSubmit={async (payload) => {
          const res = await fetch("/api/ops/rondas/programacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            toast.error(json.error ?? "No se pudo crear programación");
            return;
          }
          const template = templates.find((t) => t.id === payload.rondaTemplateId);
          setRows((prev) => [{ ...json.data, rondaTemplate: template ? { name: template.name } : null }, ...prev]);
          toast.success("Programación creada");
        }}
      />

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage="Sin programaciones registradas."
      />
    </div>
  );
}
