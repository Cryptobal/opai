"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ProgramacionForm } from "@/components/ops/rondas/programacion-form";
import { Button } from "@/components/ui/button";

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

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left">Plantilla</th>
                <th className="px-3 py-2 text-left">Días</th>
                <th className="px-3 py-2 text-left">Horario</th>
                <th className="px-3 py-2 text-left">Frecuencia</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">{r.rondaTemplate?.name ?? r.rondaTemplateId}</td>
                  <td className="px-3 py-2">{r.diasSemana.join(",")}</td>
                  <td className="px-3 py-2">{r.horaInicio} - {r.horaFin}</td>
                  <td className="px-3 py-2">{r.frecuenciaMinutos} min</td>
                  <td className="px-3 py-2">{r.isActive ? "Activa" : "Inactiva"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={async () => {
                        const res = await fetch(`/api/ops/rondas/programacion/${r.id}`, { method: "DELETE" });
                        const json = await res.json();
                        if (!res.ok || !json.success) {
                          toast.error(json.error ?? "No se pudo eliminar");
                          return;
                        }
                        setRows((prev) => prev.filter((it) => it.id !== r.id));
                        toast.success("Programación eliminada");
                      }}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={6}>
                    Sin programaciones registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
