/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Trash2, X, Check } from "lucide-react";
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

type CustomField = {
  id: string;
  name: string;
  entityType: string;
  type: string;
  options?: unknown;
};

const ENTITY_TYPES = [
  { value: "lead", label: "Prospectos" },
  { value: "account", label: "Clientes" },
  { value: "contact", label: "Contactos" },
  { value: "deal", label: "Negocios" },
];

/** Campos nativos (del sistema) por entidad */
const SYSTEM_FIELDS: Record<string, { name: string; type: string }[]> = {
  lead: [
    { name: "Empresa", type: "text" },
    { name: "Nombre", type: "text" },
    { name: "Email", type: "email" },
    { name: "Teléfono", type: "phone" },
    { name: "Origen", type: "text" },
    { name: "Notas", type: "textarea" },
  ],
  account: [
    { name: "Nombre", type: "text" },
    { name: "RUT", type: "text" },
    { name: "Industria", type: "select" },
    { name: "Tamaño", type: "text" },
    { name: "Segmento", type: "text" },
    { name: "Sitio web", type: "url" },
    { name: "Dirección", type: "text" },
    { name: "Notas", type: "textarea" },
  ],
  contact: [
    { name: "Nombre", type: "text" },
    { name: "Email", type: "email" },
    { name: "Teléfono", type: "phone" },
    { name: "Cargo", type: "text" },
    { name: "Contacto principal", type: "checkbox" },
  ],
  deal: [
    { name: "Título", type: "text" },
    { name: "Monto", type: "number" },
    { name: "Etapa", type: "select" },
    { name: "Probabilidad (%)", type: "number" },
    { name: "Fecha cierre esperada", type: "date" },
    { name: "Razón de pérdida", type: "text" },
  ],
};

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Área de texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Correo electrónico" },
  { value: "url", label: "URL (enlace clicable)" },
  { value: "select", label: "Selección única" },
  { value: "select_multiple", label: "Selección múltiple" },
  { value: "checkbox", label: "Checkbox (Sí/No)" },
];

export function CrmConfigClient({
  initialStages,
  initialFields,
  extraSections,
}: {
  initialStages: PipelineStage[];
  initialFields: CustomField[];
  extraSections?: ReactNode;
}) {
  const [stages, setStages] = useState<PipelineStage[]>(initialStages);
  const [fields, setFields] = useState<CustomField[]>(initialFields);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(true);
  const [camposOpen, setCamposOpen] = useState(true);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const toggleStage = (id: string) =>
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleField = (id: string) =>
    setExpandedFields((prev) => {
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

  const [activeEntityTab, setActiveEntityTab] = useState<string>("lead");
  const [industriasOpen, setIndustriasOpen] = useState(true);
  const [industries, setIndustries] = useState<{ id: string; name: string; order: number; active: boolean }[]>([]);
  const [newIndustryName, setNewIndustryName] = useState("");
  const [newField, setNewField] = useState({
    name: "",
    type: "text",
    options: "",
    urlLabel: "",
  });

  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string; type: "industry" | "stage" | "field" }>({ open: false, id: "", type: "industry" });

  // Campos del sistema ocultos: key = "entity:fieldName"
  const [hiddenSystemFields, setHiddenSystemFields] = useState<Set<string>>(new Set());
  const toggleSystemField = (entity: string, fieldName: string) => {
    const key = `${entity}:${fieldName}`;
    setHiddenSystemFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Edición inline de campos personalizados
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "", options: "", urlLabel: "" });

  const startEditing = (field: CustomField) => {
    setEditingFieldId(field.id);
    const opts = field.options;
    const optionsStr = Array.isArray(opts) ? (opts as string[]).join(", ") : "";
    const urlLabel =
      opts && typeof opts === "object" && !Array.isArray(opts) && "urlLabel" in opts
        ? ((opts as { urlLabel?: string }).urlLabel ?? "")
        : "";
    setEditForm({ name: field.name, type: field.type, options: optionsStr, urlLabel });
  };

  const cancelEditing = () => {
    setEditingFieldId(null);
    setEditForm({ name: "", type: "", options: "", urlLabel: "" });
  };

  const saveFieldEdit = async (fieldId: string) => {
    if (!editForm.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setLoadingId(fieldId);
    try {
      const body: Record<string, unknown> = {
        name: editForm.name.trim(),
        type: editForm.type,
      };
      if (editForm.type === "select" || editForm.type === "select_multiple") {
        body.options = editForm.options
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (editForm.type === "url" && editForm.urlLabel.trim()) {
        body.options = { urlLabel: editForm.urlLabel.trim() };
      } else {
        body.options = null;
      }
      const response = await fetch(`/api/crm/custom-fields/${fieldId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al guardar");
      setFields((prev) => prev.map((f) => (f.id === fieldId ? data.data : f)));
      cancelEditing();
      toast.success("Campo actualizado.");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar el campo.");
    } finally {
      setLoadingId(null);
    }
  };

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  useEffect(() => {
    fetch("/api/crm/industries")
      .then((r) => r.json())
      .then((res) => res.success && setIndustries(res.data || []))
      .catch(() => {});
  }, []);

  const addIndustry = async () => {
    if (!newIndustryName.trim()) {
      toast.error("Escribe el nombre de la industria.");
      return;
    }
    setLoadingId("new-industry");
    try {
      const res = await fetch("/api/crm/industries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newIndustryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al crear");
      setIndustries((prev) => [...prev, data.data]);
      setNewIndustryName("");
      toast.success("Industria agregada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo agregar la industria.");
    } finally {
      setLoadingId(null);
    }
  };

  const updateIndustry = async (id: string, name: string) => {
    if (!name.trim()) return;
    setLoadingId(id);
    try {
      const res = await fetch(`/api/crm/industries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error al actualizar");
      setIndustries((prev) => prev.map((i) => (i.id === id ? data.data : i)));
      toast.success("Industria actualizada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar.");
    } finally {
      setLoadingId(null);
    }
  };

  const deleteIndustry = async (id: string) => {
    setLoadingId(id);
    try {
      await fetch(`/api/crm/industries/${id}`, { method: "DELETE" });
      setIndustries((prev) => prev.filter((i) => i.id !== id));
      toast.success("Industria desactivada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo desactivar.");
    } finally {
      setLoadingId(null);
    }
  };

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

  const addField = async () => {
    if (!newField.name.trim()) {
      toast.error("Escribe el nombre del campo.");
      return;
    }
    if (
      (newField.type === "select" || newField.type === "select_multiple") &&
      !newField.options.trim()
    ) {
      toast.error("Indica las opciones separadas por coma.");
      return;
    }
    setLoadingId("new-field");
    try {
      const body: Record<string, unknown> = {
        name: newField.name,
        entityType: activeEntityTab,
        type: newField.type,
        options:
          newField.type === "select" || newField.type === "select_multiple"
            ? newField.options
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : null,
      };
      if (newField.type === "url" && newField.urlLabel.trim()) {
        body.urlLabel = newField.urlLabel.trim();
      }
      const response = await fetch("/api/crm/custom-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al crear");
      setFields((prev) => [data.data, ...prev]);
      setNewField({ name: "", type: "text", options: "", urlLabel: "" });
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear el campo.");
    } finally {
      setLoadingId(null);
    }
  };

  const fieldsByEntity = useMemo(() => {
    const map: Record<string, CustomField[]> = {};
    for (const e of ENTITY_TYPES) {
      map[e.value] = fields.filter((f) => f.entityType === e.value);
    }
    return map;
  }, [fields]);

  const getTypeLabel = (type: string) =>
    FIELD_TYPES.find((t) => t.value === type)?.label ?? type;

  const getOptionsDisplay = (opts: unknown) => {
    if (Array.isArray(opts)) return opts.join(", ");
    if (opts && typeof opts === "object" && "urlLabel" in opts) {
      const urlLabel = (opts as { urlLabel?: string }).urlLabel;
      return urlLabel ? `Etiqueta: ${urlLabel}` : null;
    }
    return null;
  };

  const deleteField = async (fieldId: string) => {
    setLoadingId(fieldId);
    try {
      const response = await fetch(`/api/crm/custom-fields/${fieldId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Error al eliminar");
      setFields((prev) => prev.filter((item) => item.id !== fieldId));
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar el campo.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <button
          type="button"
          onClick={() => setPipelineOpen((o) => !o)}
          className="w-full text-left hover:bg-accent/50 transition-colors rounded-t-lg"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Pipeline</CardTitle>
              <CardDescription>Etapas, orden y colores.</CardDescription>
            </div>
            {pipelineOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </CardHeader>
        </button>
        {pipelineOpen && (
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
                      "border-current"
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
                <Button size="sm" variant="outline" onClick={() => setDeleteConfirm({ open: true, id: stage.id, type: "stage" })} disabled={loadingId === stage.id}>
                  Desactivar
                </Button>
              </div>
              </>
            )}
            </div>
          );
          })}
        </CardContent>
        )}
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setCamposOpen((o) => !o)}
          className="w-full text-left hover:bg-accent/50 transition-colors rounded-t-lg"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Campos personalizados</CardTitle>
              <CardDescription>Agrega campos por entidad.</CardDescription>
            </div>
            {camposOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </CardHeader>
        </button>
        {camposOpen && (
        <CardContent className="space-y-4 text-sm">
          {/* Tabs por entidad */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide border-b border-border">
            {ENTITY_TYPES.map((e) => {
              const count = fieldsByEntity[e.value]?.length ?? 0;
              const isActive = activeEntityTab === e.value;
              return (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => setActiveEntityTab(e.value)}
                  className={cn(
                    "whitespace-nowrap rounded-t-md px-3 py-2 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-accent text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  {e.label}
                  {count > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Formulario Agregar campo (entidad viene del tab) */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <p className="text-xs font-medium text-foreground">
              Nuevo campo en {ENTITY_TYPES.find((e) => e.value === activeEntityTab)?.label}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nombre del campo</Label>
                <Input
                  value={newField.name}
                  onChange={(e) => setNewField((prev) => ({ ...prev, name: e.target.value }))}
                  className={inputClassName}
                  placeholder="Ej: Tipo de servicio"
                />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select
                  className="flex h-10 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={newField.type}
                  onChange={(e) => setNewField((prev) => ({ ...prev, type: e.target.value }))}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {(newField.type === "select" || newField.type === "select_multiple") && (
                <div className="space-y-1 sm:col-span-2">
                  <Label>Opciones (separadas por coma)</Label>
                  <Input
                    value={newField.options}
                    onChange={(e) => setNewField((prev) => ({ ...prev, options: e.target.value }))}
                    className={inputClassName}
                    placeholder="Opción A, Opción B, Opción C"
                  />
                </div>
              )}
              {newField.type === "url" && (
                <div className="space-y-1 sm:col-span-2">
                  <Label>Etiqueta de enlace (opcional)</Label>
                  <Input
                    value={newField.urlLabel}
                    onChange={(e) => setNewField((prev) => ({ ...prev, urlLabel: e.target.value }))}
                    className={inputClassName}
                    placeholder="Ej: LinkedIn, Sitio web"
                  />
                  <p className="text-xs text-muted-foreground">
                    Si dejas vacío, se usará la URL como texto del enlace.
                  </p>
                </div>
              )}
            </div>
            <Button size="sm" onClick={addField} disabled={loadingId === "new-field"}>
              Agregar campo
            </Button>
          </div>

          {/* Campos del sistema */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Campos del sistema
            </p>
            <div className="rounded-md border border-border divide-y divide-border">
              {(SYSTEM_FIELDS[activeEntityTab] ?? []).map((sf) => {
                const isHidden = hiddenSystemFields.has(`${activeEntityTab}:${sf.name}`);
                return (
                  <div
                    key={sf.name}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 transition-colors",
                      isHidden && "opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm", isHidden ? "text-muted-foreground line-through" : "text-foreground")}>
                        {sf.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {getTypeLabel(sf.type)}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSystemField(activeEntityTab, sf.name)}
                      className="p-1 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
                      title={isHidden ? "Mostrar campo" : "Ocultar campo"}
                    >
                      {isHidden ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
            {hiddenSystemFields.size > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Los campos ocultos no se mostrarán en formularios.
              </p>
            )}
          </div>

          {/* Campos personalizados de la entidad seleccionada */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Campos personalizados ({(fieldsByEntity[activeEntityTab] ?? []).length})
            </p>
            {(fieldsByEntity[activeEntityTab] ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 rounded-md border border-dashed border-border text-center">
                No hay campos personalizados. Agrega uno arriba.
              </p>
            ) : (
              (fieldsByEntity[activeEntityTab] ?? []).map((field) => {
                const isExpanded = expandedFields.has(field.id);
                const isEditing = editingFieldId === field.id;
                const optsDisplay = getOptionsDisplay(field.options);
                return (
                  <div key={field.id} className="rounded-md border border-border p-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => toggleField(field.id)}
                      className="flex w-full items-center justify-between gap-2 text-left hover:bg-accent/50 rounded-md -m-1 p-1 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <div className="min-w-0 text-left">
                          <p className="font-medium truncate">{field.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {getTypeLabel(field.type)}
                            {optsDisplay ? ` · ${optsDisplay}` : ""}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {getTypeLabel(field.type)}
                      </Badge>
                    </button>
                    {isExpanded && !isEditing && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => startEditing(field)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteConfirm({ open: true, id: field.id, type: "field" })}
                          disabled={loadingId === field.id}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Eliminar
                        </Button>
                      </div>
                    )}
                    {isExpanded && isEditing && (
                      <div className="space-y-3 rounded-md border border-border p-3 bg-muted/30">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Nombre</Label>
                            <Input
                              value={editForm.name}
                              onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                              className={inputClassName}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Tipo</Label>
                            <select
                              className="flex h-10 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                              value={editForm.type}
                              onChange={(e) => setEditForm((p) => ({ ...p, type: e.target.value }))}
                            >
                              {FIELD_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                  {t.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {(editForm.type === "select" || editForm.type === "select_multiple") && (
                            <div className="space-y-1 sm:col-span-2">
                              <Label>Opciones (separadas por coma)</Label>
                              <Input
                                value={editForm.options}
                                onChange={(e) => setEditForm((p) => ({ ...p, options: e.target.value }))}
                                className={inputClassName}
                                placeholder="Opción A, Opción B"
                              />
                            </div>
                          )}
                          {editForm.type === "url" && (
                            <div className="space-y-1 sm:col-span-2">
                              <Label>Etiqueta de enlace</Label>
                              <Input
                                value={editForm.urlLabel}
                                onChange={(e) => setEditForm((p) => ({ ...p, urlLabel: e.target.value }))}
                                className={inputClassName}
                                placeholder="Ej: LinkedIn"
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => saveFieldEdit(field.id)}
                            disabled={loadingId === field.id}
                          >
                            <Check className="h-3.5 w-3.5 mr-1" />
                            Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEditing}
                          >
                            <X className="h-3.5 w-3.5 mr-1" />
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
        )}
      </Card>

      {/* Industrias (para campo Industria en Clientes y cotizador Gard Web) */}
      <Card className="lg:col-span-2">
        <button
          type="button"
          onClick={() => setIndustriasOpen((o) => !o)}
          className="w-full text-left hover:bg-accent/50 transition-colors rounded-t-lg"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle>Industrias</CardTitle>
              <CardDescription>
                Opciones del campo Industria en Clientes. También aparecen en el cotizador de Gard Web.
              </CardDescription>
            </div>
            {industriasOpen ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
          </CardHeader>
        </button>
        {industriasOpen && (
          <CardContent className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Input
                value={newIndustryName}
                onChange={(e) => setNewIndustryName(e.target.value)}
                placeholder="Ej: Eventos"
                className={inputClassName}
                onKeyDown={(e) => e.key === "Enter" && addIndustry()}
              />
              <Button size="sm" onClick={addIndustry} disabled={loadingId === "new-industry"}>
                Agregar
              </Button>
            </div>
            <div className="rounded-md border border-border divide-y divide-border max-h-60 overflow-y-auto">
              {industries.filter((i) => i.active).length === 0 ? (
                <p className="p-4 text-muted-foreground text-center">
                  No hay industrias. Agrega una arriba.
                </p>
              ) : (
                industries
                  .filter((i) => i.active)
                  .sort((a, b) => a.order - b.order)
                  .map((ind) => (
                    <div
                      key={ind.id}
                      className="flex items-center justify-between px-3 py-2 gap-2"
                    >
                      <span>{ind.name}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => {
                            const name = window.prompt("Nuevo nombre:", ind.name);
                            if (name != null && name.trim()) updateIndustry(ind.id, name);
                          }}
                          disabled={loadingId === ind.id}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => setDeleteConfirm({ open: true, id: ind.id, type: "industry" })}
                          disabled={loadingId === ind.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {extraSections}

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title={
          deleteConfirm.type === "industry"
            ? "Desactivar industria"
            : deleteConfirm.type === "stage"
            ? "Desactivar etapa"
            : "Eliminar campo personalizado"
        }
        description={
          deleteConfirm.type === "field"
            ? "El campo será eliminado permanentemente. Esta acción no se puede deshacer."
            : "El elemento será desactivado. Esta acción no se puede deshacer."
        }
        confirmLabel={deleteConfirm.type === "field" ? "Eliminar" : "Desactivar"}
        onConfirm={() => {
          const { id, type } = deleteConfirm;
          setDeleteConfirm({ open: false, id: "", type: "industry" });
          if (type === "industry") deleteIndustry(id);
          else if (type === "stage") deleteStage(id);
          else deleteField(id);
        }}
      />
    </div>
  );
}
