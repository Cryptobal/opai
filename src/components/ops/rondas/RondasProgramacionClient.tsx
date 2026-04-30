"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ProgramacionForm } from "@/components/ops/rondas/programacion-form";
import { previewSlotTimes } from "@/lib/rondas/schedule-engine";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import { Inbox } from "lucide-react";

interface ProgramacionItem {
  id: string;
  rondaTemplateId: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  frecuenciaMinutos: number;
  horariosCustom?: string[] | null;
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

  const columns: DataTableColumn<ProgramacionItem>[] = [
    {
      id: "rondaTemplate",
      header: "Plantilla",
      cell: (row) => row.rondaTemplate?.name ?? row.rondaTemplateId,
    },
    { id: "diasSemana", header: "Días", cell: (row) => row.diasSemana.join(",") },
    {
      id: "horario",
      header: "Horario",
      cell: (row) => `${row.horaInicio} - ${row.horaFin}`,
    },
    {
      id: "frecuenciaMinutos",
      header: "Horarios de rondas",
      cell: (row) => {
        const custom = row.horariosCustom as string[] | null;
        const slots = previewSlotTimes(row.horaInicio, row.horaFin, row.frecuenciaMinutos, custom);
        const label = custom && custom.length > 0 ? `${custom.length} horarios manuales` : `Cada ${row.frecuenciaMinutos} min`;
        return (
          <div className="space-y-1">
            <span className="text-[11px] text-[#64748b]">{label}</span>
            <div className="flex flex-wrap gap-1">
              {slots.map((t) => (
                <span key={t} className="inline-block rounded-md bg-[#2dd4bf]/10 border border-[#2dd4bf]/20 px-1.5 py-0.5 text-[11px] font-mono text-[#2dd4bf]">
                  {t}
                </span>
              ))}
            </div>
          </div>
        );
      },
    },
    { id: "isActive", header: "Estado", cell: (row) => (row.isActive ? "Activa" : "Inactiva") },
    {
      id: "actions",
      header: "Acciones",
      align: "right",
      cell: (row) => (
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
        rows={rows}
        rowKey={(row) => row.id}
        empty={<EmptyState icon={Inbox} title="Sin programaciones registradas." compact />}
      />
    </div>
  );
}
