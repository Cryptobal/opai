"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Trash2, PlayCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Props = {
  visitId: string;
  status: string;
  canEdit: boolean;
  canDelete: boolean;
  /** El usuario puede reabrir el wizard para seguir trabajando la visita (requiere capability de check-in). */
  canResume?: boolean;
};

export function VisitaDetailActions({ visitId, status, canEdit, canDelete, canResume = false }: Props) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  async function updateStatus(newStatus: "completed" | "cancelled") {
    if (!canEdit) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/ops/supervision/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al actualizar");
      }
      toast.success(newStatus === "completed" ? "Visita completada" : "Visita cancelada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setUpdating(false);
    }
  }

  async function deleteVisit() {
    if (!canDelete) return;
    if (!confirm("¿Eliminar esta visita? Esta acción no se puede deshacer.")) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/ops/supervision/${visitId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al eliminar");
      }
      toast.success("Visita eliminada");
      router.push("/ops/supervision");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setUpdating(false);
    }
  }

  if (!canEdit && !canDelete) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canResume && status === "in_progress" && (
        <Button
          size="sm"
          onClick={() => router.push(`/ops/supervision/nueva-visita?continuar=${visitId}`)}
          disabled={updating}
        >
          <PlayCircle className="mr-2 h-4 w-4" />
          Continuar visita
        </Button>
      )}
      {canEdit && status === "in_progress" && (
        <>
          <Button
            size="sm"
            variant={canResume ? "outline" : "default"}
            onClick={() => updateStatus("completed")}
            disabled={updating}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Completar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => updateStatus("cancelled")}
            disabled={updating}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Cancelar
          </Button>
        </>
      )}
      {canDelete && (
        <Button
          size="sm"
          variant="destructive"
          onClick={deleteVisit}
          disabled={updating}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Eliminar
        </Button>
      )}
    </div>
  );
}
