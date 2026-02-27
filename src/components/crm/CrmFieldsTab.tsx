/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil, Trash2, X, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

export function CrmFieldsTab({
  initialFields,
}: {
  initialFields: CustomField[];
}) {
  const [fields, setFields] = useState<CustomField[]>(initialFields);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [activeEntityTab, setActiveEntityTab] = useState<string>("lead");
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string }>({ open: false, id: "" });

  const [newField, setNewField] = useState({
    name: "",
    type: "text",
    options: "",
    urlLabel: "",
  });

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

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", type: "", options: "", urlLabel: "" });

  const toggleField = (id: string) =>
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const inputClassName =
    "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campos personalizados</CardTitle>
        <CardDescription>Agrega campos por entidad.</CardDescription>
      </CardHeader>
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
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
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

        {/* Formulario Agregar campo */}
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
                className="flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                    isHidden && "opacity-50",
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
                        onClick={() => setDeleteConfirm({ open: true, id: field.id })}
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
                            className="flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(v) => setDeleteConfirm({ ...deleteConfirm, open: v })}
        title="Eliminar campo personalizado"
        description="El campo será eliminado permanentemente. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => {
          const { id } = deleteConfirm;
          setDeleteConfirm({ open: false, id: "" });
          deleteField(id);
        }}
      />
    </Card>
  );
}
