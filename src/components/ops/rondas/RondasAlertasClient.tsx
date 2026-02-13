"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertaCard } from "@/components/ops/rondas/alerta-card";

export function RondasAlertasClient({ initialRows }: { initialRows: any[] }) {
  const [rows, setRows] = useState(initialRows);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {rows.map((a) => (
        <AlertaCard
          key={a.id}
          alerta={a}
          onResolve={async (id) => {
            const res = await fetch("/api/ops/rondas/alertas", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              toast.error(json.error ?? "No se pudo resolver alerta");
              return;
            }
            setRows((prev) => prev.map((r) => (r.id === id ? { ...r, resuelta: true } : r)));
            toast.success("Alerta resuelta");
          }}
        />
      ))}
      {!rows.length && (
        <div className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
          No hay alertas activas.
        </div>
      )}
    </div>
  );
}
