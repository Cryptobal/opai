"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Settings,
  Save, Loader2, GripVertical, Plus, Trash2, ChevronDown, ChevronUp, Mail, Send, Pencil, Check, X,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type {
  AccessRecordType, AccessControlFormConfig, FormFieldConfig, AutoReportSchedule,
} from "@/lib/access-control/types";
import {
  RECORD_TYPE_CONFIG, DEFAULT_FORM_FIELDS,
  AVAILABLE_RECORD_TYPE_ICONS,
  getRecordTypeLabel, getRecordTypeIconName,
} from "@/lib/access-control/types";
import { getLucideIconByName } from "@/lib/access-control/record-type-icon";

interface ReportRecipient {
  contactId: string;
  name: string;
  email: string;
  roleTitle: string | null;
  isPrimary: boolean;
  isRecipient: boolean;
}

interface Props {
  installationId: string;
}

interface ConfigState {
  enabledRecordTypes: AccessRecordType[];
  useWhitelist: boolean;
  useBlacklist: boolean;
  requireIdValidation: boolean;
  requirePhoto: boolean;
  requireSignature: boolean;
  maxStayHours: number | null;
  autoReportSchedule: AutoReportSchedule | null;
  formConfig: AccessControlFormConfig;
  recordTypeLabels: Partial<Record<AccessRecordType, string>>;
  recordTypeIcons: Partial<Record<AccessRecordType, string>>;
}

export function AccessControlConfigTab({ installationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedType, setExpandedType] = useState<AccessRecordType | null>(null);

  const [recipients, setRecipients] = useState<ReportRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const [config, setConfig] = useState<ConfigState>({
    enabledRecordTypes: [],
    useWhitelist: false,
    useBlacklist: false,
    requireIdValidation: false,
    requirePhoto: false,
    requireSignature: false,
    maxStayHours: null,
    autoReportSchedule: null,
    formConfig: {},
    recordTypeLabels: {},
    recordTypeIcons: {},
  });

  // Inline label editing for record types: stores the type whose label is
  // being edited, and the draft text. null means "not editing".
  const [editingLabelFor, setEditingLabelFor] = useState<AccessRecordType | null>(null);
  const [editingLabelDraft, setEditingLabelDraft] = useState("");
  // Icon picker dropdown — null means closed.
  const [iconPickerFor, setIconPickerFor] = useState<AccessRecordType | null>(null);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/access-control/config/${installationId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setConfig({
          enabledRecordTypes: json.data.enabledRecordTypes || [],
          useWhitelist: json.data.useWhitelist || false,
          useBlacklist: json.data.useBlacklist || false,
          requireIdValidation: json.data.requireIdValidation || false,
          requirePhoto: json.data.requirePhoto || false,
          requireSignature: json.data.requireSignature || false,
          maxStayHours: json.data.maxStayHours || null,
          autoReportSchedule: json.data.autoReportSchedule || null,
          formConfig: json.data.formConfig || {},
          recordTypeLabels: json.data.recordTypeLabels || {},
          recordTypeIcons: json.data.recordTypeIcons || {},
        });
      }
    } catch {
      toast.error("Error al cargar configuración");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const fetchRecipients = useCallback(async () => {
    setRecipientsLoading(true);
    try {
      const res = await fetch(
        `/api/access-control/config/${installationId}/recipients`
      );
      const json = await res.json();
      if (json.success) setRecipients(json.data);
    } catch {
      // silent
    } finally {
      setRecipientsLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    if (config.autoReportSchedule) {
      fetchRecipients();
    }
  }, [config.autoReportSchedule, fetchRecipients]);

  const toggleRecipient = async (r: ReportRecipient) => {
    const newValue = !r.isRecipient;
    setRecipients((prev) =>
      prev.map((x) =>
        x.contactId === r.contactId ? { ...x, isRecipient: newValue } : x
      )
    );
    try {
      const res = await fetch(
        `/api/access-control/config/${installationId}/recipients`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: r.contactId, isRecipient: newValue }),
        }
      );
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Error al actualizar destinatario");
        fetchRecipients();
      }
    } catch {
      toast.error("Error al actualizar destinatario");
      fetchRecipients();
    }
  };

  const handleSendTest = async () => {
    setSendingTest(true);
    try {
      const res = await fetch(
        `/api/access-control/config/${installationId}/test-report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(`Reporte enviado a ${json.sentTo.length} destinatario(s)`);
      } else {
        toast.error(json.error || "Error al enviar reporte de prueba");
      }
    } catch {
      toast.error("Error al enviar reporte de prueba");
    } finally {
      setSendingTest(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/access-control/config/${installationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Configuración guardada");
      } else {
        toast.error(json.error || "Error al guardar");
      }
    } catch {
      toast.error("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const updateScheduleAndPersist = async (next: AutoReportSchedule | null) => {
    const previous = config.autoReportSchedule;
    setConfig((p) => ({ ...p, autoReportSchedule: next }));
    try {
      const res = await fetch(`/api/access-control/config/${installationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoReportSchedule: next }),
      });
      const json = await res.json();
      if (!json.success) {
        setConfig((p) => ({ ...p, autoReportSchedule: previous }));
        toast.error(json.error || "Error al guardar frecuencia de reporte");
      }
    } catch {
      setConfig((p) => ({ ...p, autoReportSchedule: previous }));
      toast.error("Error al guardar frecuencia de reporte");
    }
  };

  const toggleRecordType = (type: AccessRecordType) => {
    setConfig((prev) => {
      const types = prev.enabledRecordTypes.includes(type)
        ? prev.enabledRecordTypes.filter((t) => t !== type)
        : [...prev.enabledRecordTypes, type];
      return { ...prev, enabledRecordTypes: types };
    });
  };

  const getFormFields = (type: AccessRecordType): FormFieldConfig[] => {
    return (config.formConfig as Record<string, FormFieldConfig[]>)[type] || DEFAULT_FORM_FIELDS[type] || [];
  };

  const updateFormFields = (type: AccessRecordType, fields: FormFieldConfig[]) => {
    setConfig((prev) => ({
      ...prev,
      formConfig: { ...prev.formConfig, [type]: fields },
    }));
  };

  const addCustomField = (type: AccessRecordType) => {
    const fields = getFormFields(type);
    const newField: FormFieldConfig = {
      field: `custom_${Date.now()}`,
      label: "Nuevo campo",
      type: "text",
      required: false,
      order: fields.length + 1,
    };
    updateFormFields(type, [...fields, newField]);
  };

  const removeField = (type: AccessRecordType, index: number) => {
    const fields = getFormFields(type);
    updateFormFields(type, fields.filter((_, i) => i !== index));
  };

  const updateField = (type: AccessRecordType, index: number, updates: Partial<FormFieldConfig>) => {
    const fields = getFormFields(type);
    const updated = [...fields];
    updated[index] = { ...updated[index], ...updates };
    updateFormFields(type, updated);
  };

  // ── Per-record-type label & icon customization ──────────────────────

  const startEditingLabel = (type: AccessRecordType) => {
    setEditingLabelDraft(getRecordTypeLabel(type, config));
    setEditingLabelFor(type);
  };

  const commitEditingLabel = () => {
    if (!editingLabelFor) return;
    const trimmed = editingLabelDraft.trim();
    const fallback = RECORD_TYPE_CONFIG[editingLabelFor]?.label ?? "";
    setConfig((prev) => {
      const nextLabels = { ...prev.recordTypeLabels };
      // Empty / equal to default → remove override so future default changes
      // propagate. Non-empty + different → store override.
      if (!trimmed || trimmed === fallback) {
        delete nextLabels[editingLabelFor];
      } else {
        nextLabels[editingLabelFor] = trimmed;
      }
      return { ...prev, recordTypeLabels: nextLabels };
    });
    setEditingLabelFor(null);
    setEditingLabelDraft("");
  };

  const cancelEditingLabel = () => {
    setEditingLabelFor(null);
    setEditingLabelDraft("");
  };

  const setRecordTypeIcon = (type: AccessRecordType, iconName: string) => {
    const fallback = RECORD_TYPE_CONFIG[type]?.icon ?? "";
    setConfig((prev) => {
      const nextIcons = { ...prev.recordTypeIcons };
      if (!iconName || iconName === fallback) {
        delete nextIcons[type];
      } else {
        nextIcons[type] = iconName;
      }
      return { ...prev, recordTypeIcons: nextIcons };
    });
    setIconPickerFor(null);
  };

  // ── Drag & drop reorder ─────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleFieldDragEnd = (type: AccessRecordType, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fields = getFormFields(type);
    const oldIndex = fields.findIndex((f) => f.field === active.id);
    const newIndex = fields.findIndex((f) => f.field === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({
      ...f,
      order: i + 1,
    }));
    updateFormFields(type, reordered);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-zinc-400" />
          <h3 className="text-lg font-semibold text-zinc-100">Control de Acceso</h3>
        </div>
        <Button onClick={saveConfig} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Guardar
        </Button>
      </div>

      {/* Record Types */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        <h4 className="mb-3 text-sm font-medium text-zinc-300">Tipos de Registro Habilitados</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(Object.keys(RECORD_TYPE_CONFIG) as AccessRecordType[]).map((type) => {
            const enabled = config.enabledRecordTypes.includes(type);
            const Icon = getLucideIconByName(getRecordTypeIconName(type, config));
            return (
              <button
                key={type}
                onClick={() => toggleRecordType(type)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
                  enabled
                    ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                    : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:border-zinc-600"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-xs font-medium">{getRecordTypeLabel(type, config)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lists */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        <h4 className="mb-3 text-sm font-medium text-zinc-300">Listas de Control</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-400">Lista Blanca (Autorizados)</Label>
            <Switch
              checked={config.useWhitelist}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, useWhitelist: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-zinc-400">Lista Negra (Bloqueados)</Label>
            <Switch
              checked={config.useBlacklist}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, useBlacklist: v }))}
            />
          </div>
        </div>
      </div>

      {/* Operational Params */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
        <h4 className="mb-3 text-sm font-medium text-zinc-300">Parámetros Operativos</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-zinc-400">Validar vigencia de cédula online</Label>
            <Switch
              checked={config.requireIdValidation}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, requireIdValidation: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-zinc-400">Obligar foto del visitante</Label>
            <Switch
              checked={config.requirePhoto}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, requirePhoto: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-zinc-400">Obligar firma digital de entrada</Label>
            <Switch
              checked={config.requireSignature}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, requireSignature: v }))}
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-zinc-400 whitespace-nowrap">Máx. horas permanencia</Label>
            <Input
              type="number"
              min={1}
              max={72}
              value={config.maxStayHours ?? ""}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  maxStayHours: e.target.value ? parseInt(e.target.value, 10) : null,
                }))
              }
              placeholder="Sin límite"
              className="w-28 bg-zinc-800 border-zinc-600"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-zinc-400 whitespace-nowrap">Reporte automático</Label>
            <select
              value={config.autoReportSchedule || ""}
              onChange={(e) =>
                updateScheduleAndPersist(
                  (e.target.value || null) as AutoReportSchedule | null
                )
              }
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="">Deshabilitado</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>

          {config.autoReportSchedule && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-zinc-300 text-sm font-medium flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  Destinatarios del reporte (
                  {recipients.filter((r) => r.isRecipient).length} seleccionados)
                </Label>
              </div>
              {recipientsLoading ? (
                <div className="flex items-center gap-2 text-xs text-zinc-500 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cargando contactos...
                </div>
              ) : recipients.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No hay contactos con email en la cuenta del cliente.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {recipients.map((r) => (
                    <label
                      key={r.contactId}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-zinc-800 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={r.isRecipient}
                        onChange={() => toggleRecipient(r)}
                        className="rounded border-zinc-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-zinc-200 truncate flex items-center gap-2">
                          {r.name}
                          {r.isPrimary && (
                            <Badge
                              variant="outline"
                              className="text-xs border-status-info-border text-status-info-fg"
                            >
                              Principal
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 truncate">
                          {r.email}
                          {r.roleTitle && ` · ${r.roleTitle}`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <button
                onClick={handleSendTest}
                disabled={
                  sendingTest ||
                  recipients.filter((r) => r.isRecipient).length === 0
                }
                className="mt-3 inline-flex items-center gap-1 text-xs text-status-info-fg hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {sendingTest ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Enviar reporte de prueba ahora
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Form Builder */}
      {config.enabledRecordTypes.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <h4 className="mb-3 text-sm font-medium text-zinc-300">Formularios por Tipo de Registro</h4>
          <p className="mb-3 text-xs text-zinc-500">
            Arrastra los campos para reordenarlos. Haz click en el lápiz para renombrar el tipo o cambiar su icono.
          </p>
          <div className="space-y-2">
            {config.enabledRecordTypes.map((type) => {
              const fields = getFormFields(type);
              const isExpanded = expandedType === type;
              const isEditingLabel = editingLabelFor === type;
              const isPickingIcon = iconPickerFor === type;
              const TypeIcon = getLucideIconByName(getRecordTypeIconName(type, config));

              return (
                <div key={type} className="rounded-lg border border-zinc-700">
                  <div className="flex w-full items-center justify-between p-3 hover:bg-zinc-800/50">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => setIconPickerFor(isPickingIcon ? null : type)}
                        className="flex-shrink-0 rounded-md p-1 text-zinc-300 hover:bg-zinc-700"
                        title="Cambiar icono"
                      >
                        <TypeIcon className="h-5 w-5" />
                      </button>

                      {isEditingLabel ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <Input
                            value={editingLabelDraft}
                            onChange={(e) => setEditingLabelDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEditingLabel();
                              if (e.key === "Escape") cancelEditingLabel();
                            }}
                            autoFocus
                            className="h-8 text-sm bg-zinc-800 border-zinc-600 max-w-xs"
                            placeholder={RECORD_TYPE_CONFIG[type]?.label ?? ""}
                          />
                          <button
                            type="button"
                            onClick={commitEditingLabel}
                            className="rounded-md p-1 text-status-ok-fg hover:bg-zinc-700"
                            title="Guardar"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditingLabel}
                            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-700"
                            title="Cancelar"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedType(isExpanded ? null : type)}
                            className="flex items-center gap-2 flex-1 text-left min-w-0"
                          >
                            <span className="text-sm font-medium text-zinc-200 truncate">
                              {getRecordTypeLabel(type, config)}
                            </span>
                            <span className="text-xs text-zinc-500 flex-shrink-0">
                              ({fields.length} campos)
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditingLabel(type)}
                            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-700"
                            title="Renombrar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>

                    {!isEditingLabel && (
                      <button
                        type="button"
                        onClick={() => setExpandedType(isExpanded ? null : type)}
                        className="rounded-md p-1 text-zinc-400 hover:bg-zinc-700"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Icon picker dropdown */}
                  {isPickingIcon && (
                    <div className="border-t border-zinc-700 p-3 bg-zinc-950/50">
                      <div className="text-xs text-zinc-400 mb-2">Elige un icono:</div>
                      <div className="grid grid-cols-6 gap-2">
                        {AVAILABLE_RECORD_TYPE_ICONS.map((iconName) => {
                          const Icon = getLucideIconByName(iconName);
                          const isSelected = getRecordTypeIconName(type, config) === iconName;
                          return (
                            <button
                              key={iconName}
                              type="button"
                              onClick={() => setRecordTypeIcon(type, iconName)}
                              className={`flex items-center justify-center rounded-md border p-2 transition-colors ${
                                isSelected
                                  ? "border-status-info-border bg-status-info-soft text-status-info-fg"
                                  : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-600"
                              }`}
                              title={iconName}
                            >
                              <Icon className="h-5 w-5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="border-t border-zinc-700 p-3 space-y-2">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleFieldDragEnd(type, event)}
                      >
                        <SortableContext
                          items={fields.map((f) => f.field)}
                          strategy={verticalListSortingStrategy}
                        >
                          {fields.map((field, idx) => (
                            <SortableFieldRow
                              key={field.field}
                              field={field}
                              onLabelChange={(label) => updateField(type, idx, { label })}
                              onTypeChange={(t) => updateField(type, idx, { type: t })}
                              onRequiredChange={(req) => updateField(type, idx, { required: req })}
                              onRemove={() => removeField(type, idx)}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addCustomField(type)}
                        className="w-full border-dashed border-zinc-600"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Agregar campo
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sortable row for a single form field. Uses @dnd-kit to allow the
// admin to drag fields up/down. The drag handle is the GripVertical
// icon — clicking inputs does NOT start a drag (PointerSensor
// activationConstraint=5px ensures intentional drags only).
// ═══════════════════════════════════════════════════════════════

interface SortableFieldRowProps {
  field: FormFieldConfig;
  onLabelChange: (label: string) => void;
  onTypeChange: (type: FormFieldConfig["type"]) => void;
  onRequiredChange: (required: boolean) => void;
  onRemove: () => void;
}

function SortableFieldRow({
  field,
  onLabelChange,
  onTypeChange,
  onRequiredChange,
  onRemove,
}: SortableFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.field });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md bg-zinc-800 p-2"
    >
      <button
        type="button"
        className="cursor-grab text-zinc-500 hover:text-zinc-300 active:cursor-grabbing flex-shrink-0 touch-none"
        aria-label="Arrastrar para reordenar"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        value={field.label}
        onChange={(e) => onLabelChange(e.target.value)}
        className="h-8 text-sm bg-zinc-700 border-zinc-600"
        placeholder="Etiqueta"
      />
      <select
        value={field.type}
        onChange={(e) => onTypeChange(e.target.value as FormFieldConfig["type"])}
        className="h-8 rounded-md border border-zinc-600 bg-zinc-700 px-2 text-xs text-zinc-200"
      >
        <option value="text">Texto</option>
        <option value="number">Número</option>
        <option value="select">Selección</option>
        <option value="boolean">Sí/No</option>
        <option value="date">Fecha</option>
        <option value="photo">Foto</option>
        <option value="textarea">Texto largo</option>
        <option value="signature">Firma</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onRequiredChange(e.target.checked)}
          className="rounded border-zinc-600"
        />
        Req.
      </label>
      <button
        type="button"
        onClick={onRemove}
        className="text-zinc-500 hover:text-status-danger-fg"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
