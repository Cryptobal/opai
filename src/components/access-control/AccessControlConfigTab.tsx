"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Settings, UserPlus, Truck, Car, BadgeCheck, Package,
  Save, Loader2, GripVertical, Plus, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  AccessRecordType, AccessControlFormConfig, FormFieldConfig, AutoReportSchedule,
} from "@/lib/access-control/types";
import { RECORD_TYPE_CONFIG, DEFAULT_FORM_FIELDS } from "@/lib/access-control/types";

// ═══════════════════════════════════════════════════════════════

const TYPE_ICONS: Record<AccessRecordType, React.ReactNode> = {
  visit: <UserPlus className="h-5 w-5" />,
  provider: <Truck className="h-5 w-5" />,
  vehicle: <Car className="h-5 w-5" />,
  staff: <BadgeCheck className="h-5 w-5" />,
  delivery: <Package className="h-5 w-5" />,
};

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
}

export function AccessControlConfigTab({ installationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedType, setExpandedType] = useState<AccessRecordType | null>(null);

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
  });

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
            const tc = RECORD_TYPE_CONFIG[type];
            const enabled = config.enabledRecordTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleRecordType(type)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
                  enabled
                    ? "border-blue-500 bg-blue-500/10 text-blue-400"
                    : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:border-zinc-600"
                }`}
              >
                {TYPE_ICONS[type]}
                <span className="text-xs font-medium">{tc.label}</span>
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
                setConfig((p) => ({
                  ...p,
                  autoReportSchedule: (e.target.value || null) as AutoReportSchedule | null,
                }))
              }
              className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200"
            >
              <option value="">Deshabilitado</option>
              <option value="daily">Diario</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>
        </div>
      </div>

      {/* Form Builder */}
      {config.enabledRecordTypes.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <h4 className="mb-3 text-sm font-medium text-zinc-300">Formularios por Tipo de Registro</h4>
          <div className="space-y-2">
            {config.enabledRecordTypes.map((type) => {
              const tc = RECORD_TYPE_CONFIG[type];
              const fields = getFormFields(type);
              const isExpanded = expandedType === type;

              return (
                <div key={type} className="rounded-lg border border-zinc-700">
                  <button
                    onClick={() => setExpandedType(isExpanded ? null : type)}
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-zinc-800/50"
                  >
                    <div className="flex items-center gap-2">
                      {TYPE_ICONS[type]}
                      <span className="text-sm font-medium text-zinc-200">{tc.label}</span>
                      <span className="text-xs text-zinc-500">({fields.length} campos)</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-zinc-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-zinc-400" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-zinc-700 p-3 space-y-2">
                      {fields.map((field, idx) => (
                        <div
                          key={field.field}
                          className="flex items-center gap-2 rounded-md bg-zinc-800 p-2"
                        >
                          <GripVertical className="h-4 w-4 text-zinc-600 flex-shrink-0" />
                          <Input
                            value={field.label}
                            onChange={(e) => updateField(type, idx, { label: e.target.value })}
                            className="h-8 text-sm bg-zinc-700 border-zinc-600"
                            placeholder="Etiqueta"
                          />
                          <select
                            value={field.type}
                            onChange={(e) =>
                              updateField(type, idx, { type: e.target.value as FormFieldConfig["type"] })
                            }
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
                              onChange={(e) => updateField(type, idx, { required: e.target.checked })}
                              className="rounded border-zinc-600"
                            />
                            Req.
                          </label>
                          <button
                            onClick={() => removeField(type, idx)}
                            className="text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
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
