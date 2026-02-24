"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  in_progress: "En progreso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const INSTALLATION_STATE_LABELS: Record<string, string> = {
  normal: "Normal",
  incidencia: "Con observaciones",
  critico: "Crítico",
  sin_estado: "Sin estado",
};

type Visit = {
  id: string;
  checkInAt: Date;
  status: string;
  installationState: string | null;
  installation: { id: string; name: string; commune: string | null };
  supervisor: { id: string; name: string };
};

type Props = {
  visitas: Visit[];
  totals: {
    total: number;
    completed: number;
    criticas: number;
    pendientes: number;
  };
  periodLabel: string;
  periodOptions: { value: string; label: string }[];
  canViewAll: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function SupervisionDashboardClient({
  visitas,
  totals,
  periodLabel,
  periodOptions,
  canViewAll,
  canEdit,
  canDelete,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [updating, setUpdating] = useState<string | null>(null);
  const [localVisitas, setLocalVisitas] = useState(visitas);

  function setPeriod(value: string) {
    const params = new URLSearchParams();
    params.set("period", value);
    router.push(`/ops/supervision?${params.toString()}`);
  }

  async function updateStatus(visitId: string, status: "completed" | "cancelled") {
    if (!canEdit) return;
    setUpdating(visitId);
    try {
      const res = await fetch(`/api/ops/supervision/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al actualizar");
      }
      setLocalVisitas((prev) =>
        prev.map((v) => (v.id === visitId ? { ...v, status } : v))
      );
      toast.success(status === "completed" ? "Visita completada" : "Visita cancelada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar");
    } finally {
      setUpdating(null);
    }
  }

  async function deleteVisit(visitId: string) {
    if (!canDelete) return;
    if (!confirm("¿Eliminar esta visita? Esta acción no se puede deshacer.")) return;
    setUpdating(visitId);
    try {
      const res = await fetch(`/api/ops/supervision/${visitId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Error al eliminar");
      }
      setLocalVisitas((prev) => prev.filter((v) => v.id !== visitId));
      toast.success("Visita eliminada");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Período: <span className="font-medium text-foreground">{periodLabel}</span>
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Cambiar período
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {periodOptions.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => setPeriod(opt.value)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">Visitas totales</p>
            <p className="text-xl font-bold">{totals.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">Completadas</p>
            <p className="text-xl font-bold">{totals.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">Críticas</p>
            <p className="text-xl font-bold">{totals.criticas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] text-muted-foreground">Pendientes</p>
            <p className="text-xl font-bold">{totals.pendientes}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas visitas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {localVisitas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay visitas en este período.</p>
          ) : (
            localVisitas.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-md border p-3 transition hover:bg-muted/40"
              >
                <Link href={`/ops/supervision/${v.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.installation.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("es-CL", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(v.checkInAt))}
                  </p>
                  {canViewAll && (
                    <p className="text-xs text-muted-foreground">
                      Supervisor: {v.supervisor.name}
                    </p>
                  )}
                </Link>
                <div className="flex items-center gap-2">
                  {v.installationState && (
                    <Badge variant="outline">
                      {INSTALLATION_STATE_LABELS[v.installationState] ?? v.installationState}
                    </Badge>
                  )}
                  <Badge
                    variant={
                      v.status === "completed"
                        ? "default"
                        : v.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {STATUS_LABELS[v.status] ?? v.status}
                  </Badge>
                  {(canEdit || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={updating === v.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canEdit && v.status === "in_progress" && (
                          <DropdownMenuItem
                            onClick={() => updateStatus(v.id, "completed")}
                            disabled={updating === v.id}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Completar
                          </DropdownMenuItem>
                        )}
                        {canEdit && v.status === "in_progress" && (
                          <DropdownMenuItem
                            onClick={() => updateStatus(v.id, "cancelled")}
                            disabled={updating === v.id}
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancelar
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <DropdownMenuItem
                            onClick={() => deleteVisit(v.id)}
                            disabled={updating === v.id}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
