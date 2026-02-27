/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type PipelineStage = {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isActive: boolean;
};

export function CrmPipelineTab({
  initialStages,
}: {
  initialStages: PipelineStage[];
}) {
  const [stages, setStages] = useState<PipelineStage[]>(initialStages);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  const toggleStage = (id: string) =>
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [newStage, setNewStage] = useState({
    name: "",
    order: "1",
    color: "#3b82f6",
    isClosedWon: false,
    isClosedLost: false,
  });

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages],
  );

  const saveStage = async (stage: PipelineStage) => {
    setLoadingId(stage.id);
    try {
      const response = await fetch(`/api/crm/pipeline/${stage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stage),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al guardar");
      setStages((prev) => prev.map((item) => (item.id === stage.id ? data.data : item)));
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar la etapa.");
    } finally {
      setLoadingId(null);
    }
  };

  const addStage = async () => {
    if (!newStage.name.trim()) {
      toast.error("Escribe el nombre de la etapa.");
      return;
    }
    setLoadingId("new-stage");
    try {
      const response = await fetch("/api/crm/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newStage.name,
          order: Number(newStage.order),
          color: newStage.color,
          isClosedWon: newStage.isClosedWon,
          isClosedLost: newStage.isClosedLost,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al crear");
      setStages((prev) => [data.data, ...prev]);
      setNewStage({ name: "", order: "1", color: "#3b82f6", isClosedWon: false, isClosedLost: false });
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear la etapa.");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteStage = async (stageId: string) => {
    setLoadingId(stageId);
    try {
      const response = await fetch(`/api/crm/pipeline/${stageId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al eliminar");
      setStages((prev) => prev.filter((item) => item.id !== stageId));
    } catch (error) {
      console.error(error);
      toast.error("No se pudo desactivar la etapa.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Etapas, orden y colores.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md border border-border p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Nueva etapa</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input
                value={newStage.name}
                onChange={(event) => setNewStage((prev) => ({ ...prev, name: event.target.value }))}
                className={inputClassName}
                placeholder="Prospección"
              />
            </div>
            <div className="space-y-1">
              <Label>Orden</Label>
              <Input
                value={newStage.order}
                onChange={(event) => setNewStage((prev) => ({ ...prev, order: event.target.value }))}
                className={inputClassName}
                placeholder="1"
              />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <input
                type="color"
                value={newStage.color}
                onChange={(event) => setNewStage((prev) => ({ ...prev, color: event.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background text-sm text-foreground"
              />
            </div>
            <div className="space-y-1">
              <Label>Estado final</Label>
              <div className="flex gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newStage.isClosedWon}
                    onChange={(event) =>
                      setNewStage((prev) => ({
                        ...prev,
                        isClosedWon: event.target.checked,
                        isClosedLost: event.target.checked ? false : prev.isClosedLost,
                      }))
                    }
                  />
                  Ganado
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={newStage.isClosedLost}
                    onChange={(event) =>
                      setNewStage((prev) => ({
                        ...prev,
                        isClosedLost: event.target.checked,
                        isClosedWon: event.target.checked ? false : prev.isClosedWon,
                      }))
                    }
                  />
                  Perdido
                </label>
              </div>
            </div>
          </div>
          <Button size="sm" onClick={addStage} disabled={loadingId === "new-stage"}>
            Agregar etapa
          </Button>
        </div>

        {orderedStages.map((stage) => {
          const isExpanded = expandedStages.has(stage.id);
          return (
            <div key={stage.id} className="rounded-md border border-border p-3 space-y-2">
              <button
                type="button"
                onClick={() => toggleStage(stage.id)}
                className="flex w-full items-center justify-between gap-2 text-left hover:opacity-90 rounded-md -m-1 p-1 transition-opacity"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium shrink-0",
                      "border-current",
                    )}
                    style={{
                      borderColor: stage.color || "#94a3b8",
                      backgroundColor: `${stage.color || "#94a3b8"}18`,
                      color: "inherit",
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: stage.color || "#94a3b8" }}
                    />
                    {stage.name}
                  </span>
                </div>
                <Badge variant="outline" className="shrink-0">Orden {stage.order}</Badge>
              </button>
              {isExpanded && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={stage.name}
                      onChange={(event) =>
                        setStages((prev) =>
                          prev.map((item) => (item.id === stage.id ? { ...item, name: event.target.value } : item)),
                        )
                      }
                      className={inputClassName}
                    />
                    <Input
                      value={String(stage.order)}
                      onChange={(event) =>
                        setStages((prev) =>
                          prev.map((item) =>
                            item.id === stage.id ? { ...item, order: Number(event.target.value) } : item,
                          ),
                        )
                      }
                      className={inputClassName}
                    />
                    <input
                      type="color"
                      value={stage.color || "#94a3b8"}
                      onChange={(event) =>
                        setStages((prev) =>
                          prev.map((item) => (item.id === stage.id ? { ...item, color: event.target.value } : item)),
                        )
                      }
                      className="h-9 w-full rounded-md border border-input bg-background text-sm text-foreground"
                    />
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={stage.isClosedWon}
                          onChange={(event) =>
                            setStages((prev) =>
                              prev.map((item) =>
                                item.id === stage.id
                                  ? { ...item, isClosedWon: event.target.checked, isClosedLost: event.target.checked ? false : item.isClosedLost }
                                  : item,
                              ),
                            )
                          }
                        />
                        Ganado
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={stage.isClosedLost}
                          onChange={(event) =>
                            setStages((prev) =>
                              prev.map((item) =>
                                item.id === stage.id
                                  ? { ...item, isClosedLost: event.target.checked, isClosedWon: event.target.checked ? false : item.isClosedWon }
                                  : item,
                              ),
                            )
                          }
                        />
                        Perdido
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => saveStage(stage)} disabled={loadingId === stage.id}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDeleteConfirm({ open: true, id: stage.id })} disabled={loadingId === stage.id}>
                      Desactivar
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </CardContent>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Desactivar etapa"
        description="El elemento será desactivado. Esta acción no se puede deshacer."
        confirmLabel="Desactivar"
        onConfirm={() => {
          const { id } = deleteConfirm;
          setDeleteConfirm({ open: false, id: "" });
          deleteStage(id);
        }}
      />
    </Card>
  );
}
