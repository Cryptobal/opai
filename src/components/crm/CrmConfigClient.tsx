/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type PipelineStage = {
  id: string;
  name: string;
  order: number;
  color?: string | null;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isActive: boolean;
};

type CustomField = {
  id: string;
  name: string;
  entityType: string;
  type: string;
  options?: any;
};

const ENTITY_TYPES = [
  { value: "lead", label: "Prospecto" },
  { value: "account", label: "Cliente" },
  { value: "contact", label: "Contacto" },
  { value: "deal", label: "Negocio" },
];

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "select", label: "Selección" },
];

export function CrmConfigClient({
  initialStages,
  initialFields,
}: {
  initialStages: PipelineStage[];
  initialFields: CustomField[];
}) {
  const [stages, setStages] = useState<PipelineStage[]>(initialStages);
  const [fields, setFields] = useState<CustomField[]>(initialFields);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const [newStage, setNewStage] = useState({
    name: "",
    order: "1",
    color: "#3b82f6",
    isClosedWon: false,
    isClosedLost: false,
  });

  const [newField, setNewField] = useState({
    name: "",
    entityType: "deal",
    type: "text",
    options: "",
  });

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const orderedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages]
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
      alert("No se pudo guardar la etapa.");
    } finally {
      setLoadingId(null);
    }
  };

  const addStage = async () => {
    if (!newStage.name.trim()) {
      alert("Escribe el nombre de la etapa.");
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
      alert("No se pudo crear la etapa.");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteStage = async (stageId: string) => {
    if (!confirm("¿Desactivar esta etapa?")) return;
    setLoadingId(stageId);
    try {
      const response = await fetch(`/api/crm/pipeline/${stageId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al eliminar");
      setStages((prev) => prev.filter((item) => item.id !== stageId));
    } catch (error) {
      console.error(error);
      alert("No se pudo desactivar la etapa.");
    } finally {
      setLoadingId(null);
    }
  };

  const addField = async () => {
    if (!newField.name.trim()) {
      alert("Escribe el nombre del campo.");
      return;
    }
    setLoadingId("new-field");
    try {
      const response = await fetch("/api/crm/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newField.name,
          entityType: newField.entityType,
          type: newField.type,
          options: newField.type === "select"
            ? newField.options.split(",").map((item) => item.trim()).filter(Boolean)
            : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al crear");
      setFields((prev) => [data.data, ...prev]);
      setNewField({ name: "", entityType: "deal", type: "text", options: "" });
    } catch (error) {
      console.error(error);
      alert("No se pudo crear el campo.");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteField = async (fieldId: string) => {
    if (!confirm("¿Eliminar este campo personalizado?")) return;
    setLoadingId(fieldId);
    try {
      const response = await fetch(`/api/crm/custom-fields/${fieldId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al eliminar");
      setFields((prev) => prev.filter((item) => item.id !== fieldId));
    } catch (error) {
      console.error(error);
      alert("No se pudo eliminar el campo.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Etapas, orden y colores.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border border-border/60 p-3 space-y-2">
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
                  className="h-10 w-full rounded-md border border-input bg-background text-sm text-foreground"
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

          {orderedStages.map((stage) => (
            <div key={stage.id} className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: stage.color || "#94a3b8" }}
                  />
                  <span className="font-medium">{stage.name}</span>
                </div>
                <Badge variant="outline">Orden {stage.order}</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={stage.name}
                  onChange={(event) =>
                    setStages((prev) =>
                      prev.map((item) => (item.id === stage.id ? { ...item, name: event.target.value } : item))
                    )
                  }
                  className={inputClassName}
                />
                <Input
                  value={String(stage.order)}
                  onChange={(event) =>
                    setStages((prev) =>
                      prev.map((item) =>
                        item.id === stage.id ? { ...item, order: Number(event.target.value) } : item
                      )
                    )
                  }
                  className={inputClassName}
                />
                <input
                  type="color"
                  value={stage.color || "#94a3b8"}
                  onChange={(event) =>
                    setStages((prev) =>
                      prev.map((item) => (item.id === stage.id ? { ...item, color: event.target.value } : item))
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background text-sm text-foreground"
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
                              : item
                          )
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
                              : item
                          )
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
                <Button size="sm" variant="outline" onClick={() => deleteStage(stage.id)} disabled={loadingId === stage.id}>
                  Desactivar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campos personalizados</CardTitle>
          <CardDescription>Agrega campos por entidad.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="rounded-md border border-border/60 p-3 space-y-2">
            <p className="text-xs text-muted-foreground">Nuevo campo</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={newField.name}
                  onChange={(event) => setNewField((prev) => ({ ...prev, name: event.target.value }))}
                  className={inputClassName}
                  placeholder="Tipo de servicio"
                />
              </div>
              <div className="space-y-1">
                <Label>Entidad</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={newField.entityType}
                  onChange={(event) => setNewField((prev) => ({ ...prev, entityType: event.target.value }))}
                >
                  {ENTITY_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={newField.type}
                  onChange={(event) => setNewField((prev) => ({ ...prev, type: event.target.value }))}
                >
                  {FIELD_TYPES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {newField.type === "select" && (
                <div className="space-y-1">
                  <Label>Opciones (coma)</Label>
                  <Input
                    value={newField.options}
                    onChange={(event) => setNewField((prev) => ({ ...prev, options: event.target.value }))}
                    className={inputClassName}
                    placeholder="A,B,C"
                  />
                </div>
              )}
            </div>
            <Button size="sm" onClick={addField} disabled={loadingId === "new-field"}>
              Agregar campo
            </Button>
          </div>

          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No hay campos personalizados aún.
            </p>
          )}
          {fields.map((field) => (
            <div key={field.id} className="rounded-md border border-border/60 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{field.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {field.entityType} · {field.type}
                  </p>
                </div>
                <Badge variant="outline">{field.entityType}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => deleteField(field.id)} disabled={loadingId === field.id}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
