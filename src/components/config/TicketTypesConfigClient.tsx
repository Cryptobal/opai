"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronRight,
  Clock,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import type {
  TicketType,
  TicketTypeApprovalStep,
  TicketOrigin,
  TicketTeam,
  TicketPriority,
  ApproverType,
} from "@/lib/tickets";
import {
  TICKET_TEAM_CONFIG,
  TICKET_PRIORITY_CONFIG,
  getOriginLabel,
} from "@/lib/tickets";
import type { AdminGroup } from "@/lib/groups";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChainEditorCell,
  AssigneeCell,
  BulkActionBar,
  draftsToPayload,
  type ChainStepDraft,
} from "@/components/config/TicketTypeInlineEditors";

// ═══════════════════════════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════════════════════════

interface TicketTypesConfigClientProps {
  userRole: string;
  originFilter?: TicketOrigin;
  admins?: Array<{ id: string; name: string | null; email: string }>;
}

interface ApprovalStepDraft {
  id: string;
  approverType: ApproverType;
  approverGroupId: string | null;
  approverUserId: string | null;
  label: string;
}

interface TicketTypeFormData {
  name: string;
  slug: string;
  description: string;
  origin: TicketOrigin;
  assignedTeam: TicketTeam;
  defaultAssignedToUserId: string | null;
  defaultPriority: TicketPriority;
  slaHours: number;
  requiresApproval: boolean;
  isActive: boolean;
  approvalSteps: ApprovalStepDraft[];
}

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

const ORIGIN_BADGE_VARIANT: Record<TicketOrigin, string> = {
  guard: "bg-status-info-soft text-status-info-fg border-status-info-border",
  internal: "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30",
  both: "bg-muted text-muted-foreground border-border",
  client: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// SLA en días — gestionar por horas era impráctico, así que la UI ofrece
// presets en días. Internamente guardamos slaHours = días * 24 para no
// romper el modelo de datos ni los cálculos de slaDueAt en la API.
const SLA_DAY_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 1, label: "1 día" },
  { days: 2, label: "2 días" },
  { days: 3, label: "3 días" },
  { days: 5, label: "5 días" },
  { days: 7, label: "7 días (1 semana)" },
  { days: 10, label: "10 días" },
  { days: 14, label: "14 días (2 semanas)" },
  { days: 21, label: "21 días (3 semanas)" },
  { days: 30, label: "30 días (1 mes)" },
];

function slaHoursToDays(hours: number): number {
  // Redondea hacia arriba para no subreportar SLA cuando hay datos
  // legacy con horas no múltiplos de 24 (e.g. slaHours: 2 → 1 día).
  return Math.max(1, Math.ceil(hours / 24));
}

function makeEmptyForm(): TicketTypeFormData {
  return {
    name: "",
    slug: "",
    description: "",
    origin: "guard",
    assignedTeam: "ops",
    defaultAssignedToUserId: null as string | null,
    defaultPriority: "p3",
    slaHours: 2 * 24,
    requiresApproval: false,
    isActive: true,
    approvalSteps: [],
  };
}

function typeToFormData(t: TicketType): TicketTypeFormData {
  return {
    name: t.name,
    slug: t.slug,
    description: t.description ?? "",
    origin: t.origin,
    assignedTeam: t.assignedTeam,
    defaultAssignedToUserId: t.defaultAssignedToUserId ?? null,
    defaultPriority: t.defaultPriority,
    slaHours: t.slaHours,
    requiresApproval: t.requiresApproval,
    isActive: t.isActive,
    approvalSteps: (t.approvalSteps ?? []).map((s) => ({
      id: s.id,
      approverType: s.approverType,
      approverGroupId: s.approverGroupId,
      approverUserId: s.approverUserId,
      label: s.label,
    })),
  };
}

function generateStepId(): string {
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ═══════════════════════════════════════════════════════════════
//  Approval Chain Display (timeline-style)
// ═══════════════════════════════════════════════════════════════

function ApprovalChainTimeline({
  steps,
  groups,
  admins,
}: {
  steps: TicketTypeApprovalStep[] | ApprovalStepDraft[];
  groups: AdminGroup[];
  admins?: Array<{ id: string; name: string | null; email: string }>;
}) {
  if (steps.length === 0) {
    return (
      <span className="text-xs text-muted-foreground italic">
        Sin aprobacion
      </span>
    );
  }

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const groupName =
          "approverGroupName" in step && step.approverGroupName
            ? step.approverGroupName
            : groups.find((g) => g.id === step.approverGroupId)?.name ?? "—";
        const userFromAdmins = step.approverUserId
          ? admins?.find((a) => a.id === step.approverUserId)
          : undefined;
        const userName =
          ("approverUserName" in step && step.approverUserName) ||
          userFromAdmins?.name ||
          userFromAdmins?.email ||
          (step.approverUserId ? "Usuario sin asignar" : step.label || "Usuario");
        const label = step.approverType === "group" ? groupName : userName;

        return (
          <div key={step.id} className="flex items-center gap-0">
            {idx > 0 && (
              <div className="w-4 h-px bg-border shrink-0" />
            )}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold shrink-0">
                {idx + 1}
              </div>
              <span className="text-[11px] text-foreground whitespace-nowrap">
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Approval Chain Builder (form)
// ═══════════════════════════════════════════════════════════════

function ApprovalChainBuilder({
  steps,
  groups,
  admins,
  onChange,
}: {
  steps: ApprovalStepDraft[];
  groups: AdminGroup[];
  admins?: Array<{ id: string; name: string | null; email: string }>;
  onChange: (steps: ApprovalStepDraft[]) => void;
}) {
  function addStep() {
    const newStep: ApprovalStepDraft = {
      id: generateStepId(),
      approverType: "group",
      approverGroupId: null,
      approverUserId: null,
      label: "",
    };
    onChange([...steps, newStep]);
  }

  function removeStep(idx: number) {
    onChange(steps.filter((_, i) => i !== idx));
  }

  function updateStep(idx: number, patch: Partial<ApprovalStepDraft>) {
    const next = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));

    // Auto-generate label when group changes
    if (patch.approverGroupId !== undefined) {
      const group = groups.find((g) => g.id === patch.approverGroupId);
      if (group) {
        next[idx] = {
          ...next[idx],
          label: `Aprobacion ${group.name}`,
        };
      }
    }

    onChange(next);
  }

  return (
    <div className="space-y-3">
      <Label className="text-xs font-medium">Cadena de aprobacion</Label>

      {steps.length === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No hay pasos de aprobacion configurados. Agrega un paso para definir la cadena.
        </p>
      )}

      <div className="space-y-2">
        {steps.map((step, idx) => (
          <div
            key={step.id}
            className="flex items-start gap-2 rounded-md border border-border bg-accent/20 p-3"
          >
            {/* Step number / grip */}
            <div className="flex flex-col items-center gap-1 pt-1 shrink-0">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40" />
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-semibold">
                {idx + 1}
              </span>
            </div>

            {/* Step fields */}
            <div className="flex-1 grid gap-2 sm:grid-cols-2 min-w-0">
              {/* Type selector */}
              <div>
                <Label className="text-[11px] text-muted-foreground">Tipo</Label>
                <Select
                  value={step.approverType}
                  onValueChange={(v) =>
                    updateStep(idx, {
                      approverType: v as ApproverType,
                      approverGroupId: null,
                      approverUserId: null,
                      label: "",
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="group">Grupo</SelectItem>
                    <SelectItem value="user">Usuario</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Value selector */}
              <div>
                <Label className="text-[11px] text-muted-foreground">
                  {step.approverType === "group" ? "Grupo" : "Usuario"}
                </Label>
                {step.approverType === "group" ? (
                  <Select
                    value={step.approverGroupId ?? ""}
                    onValueChange={(v) =>
                      updateStep(idx, { approverGroupId: v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Seleccionar grupo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {groups
                        .filter((g) => g.isActive)
                        .map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select
                    value={step.approverUserId ?? ""}
                    onValueChange={(v) => {
                      const admin = admins?.find((a) => a.id === v);
                      updateStep(idx, {
                        approverUserId: v,
                        label: `Aprobación: ${admin?.name ?? admin?.email ?? "Usuario"}`,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs mt-1">
                      <SelectValue placeholder="Seleccionar usuario..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(admins ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name ?? a.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Label (auto-generated) */}
              <div className="sm:col-span-2">
                <Label className="text-[11px] text-muted-foreground">
                  Etiqueta del paso
                </Label>
                <Input
                  value={step.label}
                  onChange={(e) =>
                    updateStep(idx, { label: e.target.value })
                  }
                  placeholder="Ej: Aprobacion RRHH"
                  className="h-8 text-xs mt-1"
                />
              </div>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={() => removeStep(idx)}
              className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors shrink-0 mt-1"
              title="Eliminar paso"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addStep}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Agregar paso
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Create / Edit Form
// ═══════════════════════════════════════════════════════════════

function TicketTypeForm({
  initialData,
  groups,
  admins,
  saving,
  onSave,
  onCancel,
}: {
  initialData: TicketTypeFormData;
  groups: AdminGroup[];
  admins?: Array<{ id: string; name: string | null; email: string }>;
  saving: boolean;
  onSave: (data: TicketTypeFormData) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<TicketTypeFormData>(initialData);
  const isNew = !initialData.slug;

  function patch(updates: Partial<TicketTypeFormData>) {
    setForm((prev) => ({ ...prev, ...updates }));
  }

  function handleNameChange(name: string) {
    const updates: Partial<TicketTypeFormData> = { name };
    if (isNew) {
      updates.slug = slugify(name);
    }
    patch(updates);
  }

  const isValid =
    form.name.trim() !== "" && form.slug.trim() !== "" && form.slaHours > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {isNew ? "Nuevo tipo de ticket" : `Editar: ${initialData.name}`}
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
            <X className="h-3.5 w-3.5 mr-1" />
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(form)}
            disabled={!isValid || saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {/* Basic info */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="text-sm font-semibold">Informacion general</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ej: Solicitud de vacaciones"
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Slug *</Label>
              <Input
                value={form.slug}
                onChange={(e) => patch({ slug: e.target.value })}
                placeholder="solicitud_vacaciones"
                className="text-sm font-mono"
                disabled={!isNew}
              />
              {!isNew && (
                <p className="text-[10px] text-muted-foreground">
                  El slug no se puede cambiar despues de crear
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descripcion</Label>
            <textarea
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Breve descripcion del tipo de ticket..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Origin */}
            <div className="space-y-1.5">
              <Label className="text-xs">Origen</Label>
              <Select
                value={form.origin}
                onValueChange={(v) => patch({ origin: v as TicketOrigin })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guard">Guardia</SelectItem>
                  <SelectItem value="internal">Interno</SelectItem>
                  <SelectItem value="both">Ambos</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assigned team */}
            <div className="space-y-1.5">
              <Label className="text-xs">Equipo asignado</Label>
              <Select
                value={form.assignedTeam}
                onValueChange={(v) => patch({ assignedTeam: v as TicketTeam })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(TICKET_TEAM_CONFIG) as [
                      TicketTeam,
                      { label: string },
                    ][]
                  ).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Default assignee (optional) */}
            {admins && admins.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="defaultAssignee">Responsable por defecto (opcional)</Label>
                <Select
                  value={form.defaultAssignedToUserId ?? ""}
                  onValueChange={(v) =>
                    patch({ defaultAssignedToUserId: v === "__none__" ? null : v })
                  }
                >
                  <SelectTrigger id="defaultAssignee">
                    <SelectValue placeholder="Sin responsable por defecto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin responsable por defecto</SelectItem>
                    {admins.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name || a.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[12px] text-ds-text-3">
                  Cuando se cree un ticket de este tipo (incluyendo desde hallazgos de supervisión), se asignará automáticamente a esta persona y se le enviará notificación.
                </p>
              </div>
            )}

            {/* Default priority */}
            <div className="space-y-1.5">
              <Label className="text-xs">Prioridad por defecto</Label>
              <Select
                value={form.defaultPriority}
                onValueChange={(v) =>
                  patch({ defaultPriority: v as TicketPriority })
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.entries(TICKET_PRIORITY_CONFIG) as [
                      TicketPriority,
                      (typeof TICKET_PRIORITY_CONFIG)[TicketPriority],
                    ][]
                  ).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      <span className={cfg.color}>{cfg.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* SLA en días */}
            <div className="space-y-1.5">
              <Label className="text-xs">SLA (días) *</Label>
              <Select
                value={String(slaHoursToDays(form.slaHours))}
                onValueChange={(v) =>
                  patch({ slaHours: Math.max(1, Number(v) || 1) * 24 })
                }
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SLA_DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.days} value={String(opt.days)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 rounded border border-border px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => patch({ isActive: e.target.checked })}
              className="rounded border-border"
            />
            <div className="text-xs">
              <p className="font-medium">Activo</p>
              <p className="text-muted-foreground">
                Los tipos inactivos no aparecen como opcion al crear tickets
              </p>
            </div>
          </label>
        </CardContent>
      </Card>

      {/* Approval section */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <h3 className="text-sm font-semibold">Aprobacion</h3>

          <label className="flex items-center gap-3 rounded border border-border px-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requiresApproval}
              onChange={(e) => {
                const checked = e.target.checked;
                patch({
                  requiresApproval: checked,
                  approvalSteps: checked ? form.approvalSteps : [],
                });
              }}
              className="rounded border-border"
            />
            <div className="text-xs">
              <p className="font-medium">Requiere aprobacion</p>
              <p className="text-muted-foreground">
                El ticket pasara por una cadena de aprobacion antes de abrirse
              </p>
            </div>
          </label>

          {form.requiresApproval && (
            <ApprovalChainBuilder
              steps={form.approvalSteps}
              groups={groups}
              admins={admins}
              onChange={(steps) => patch({ approvalSteps: steps })}
            />
          )}

          {form.requiresApproval && form.approvalSteps.length > 0 && (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-[11px] text-muted-foreground font-medium mb-2">
                Vista previa de la cadena
              </p>
              <ApprovalChainTimeline
                steps={form.approvalSteps}
                groups={groups}
                admins={admins}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

export function TicketTypesConfigClient({
  userRole,
  originFilter,
  admins,
}: TicketTypesConfigClientProps) {
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Edición en línea + selección múltiple (Fase 11).
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // ── Fetch data ──

  const fetchTicketTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/ticket-types");
      const data = await res.json();
      if (data.success) {
        setTicketTypes(data.data?.items ?? data.data ?? []);
      }
    } catch {
      toast.error("Error al cargar tipos de ticket");
    }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/ops/groups");
      const data = await res.json();
      if (data.success) {
        setGroups(data.data?.items ?? data.data ?? []);
      }
    } catch {
      toast.error("Error al cargar grupos");
    }
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([fetchTicketTypes(), fetchGroups()]);
      setLoading(false);
    }
    void load();
  }, [fetchTicketTypes, fetchGroups]);

  // ── Save handlers ──

  async function handleSaveNew(formData: TicketTypeFormData) {
    setSaving(true);
    try {
      const res = await fetch("/api/ops/ticket-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Tipo de ticket creado");
      setIsCreating(false);
      await fetchTicketTypes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al crear tipo",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(formData: TicketTypeFormData) {
    if (!selectedTypeId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/ops/ticket-types/${selectedTypeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Tipo de ticket actualizado");
      setSelectedTypeId(null);
      await fetchTicketTypes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al actualizar tipo",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(typeId: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/ops/ticket-types/${typeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(isActive ? "Tipo activado" : "Tipo desactivado");
      await fetchTicketTypes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al cambiar estado",
      );
    }
  }

  // ── Inline edit + bulk (Fase 11) ──

  const markSaving = useCallback((id: string, on: boolean) => {
    setSavingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleInlinePatch = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      markSaving(id, true);
      try {
        const res = await fetch(`/api/ops/ticket-types/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        // Reemplazo puntual en el estado local para reflejar sin recargar todo.
        setTicketTypes((prev) => prev.map((t) => (t.id === id ? data.data : t)));
        toast.success("Actualizado");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error al actualizar");
        await fetchTicketTypes(); // re-sincroniza si algo divergió
      } finally {
        markSaving(id, false);
      }
    },
    [markSaving, fetchTicketTypes],
  );

  const handleInlineChain = useCallback(
    (id: string, drafts: ChainStepDraft[]) => {
      const approvalSteps = draftsToPayload(drafts);
      void handleInlinePatch(id, { approvalSteps, requiresApproval: approvalSteps.length > 0 });
    },
    [handleInlinePatch],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatch = useCallback(
    async (patch: Record<string, unknown>) => {
      const ids = [...selected];
      if (ids.length === 0) return;
      setBulkBusy(true);
      try {
        const res = await fetch(`/api/ops/ticket-types/batch`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success(`Aplicado a ${data.data?.updated ?? ids.length} tipo(s)`);
        setSelected(new Set());
        await fetchTicketTypes();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Error en acción masiva");
      } finally {
        setBulkBusy(false);
      }
    },
    [selected, fetchTicketTypes],
  );

  // ── Organize by origin ──

  const filteredTypes = useMemo(
    () => originFilter ? ticketTypes.filter((t) => t.origin === originFilter) : ticketTypes,
    [ticketTypes, originFilter],
  );

  const guardTypes = useMemo(
    () => filteredTypes.filter((t) => t.origin === "guard"),
    [filteredTypes],
  );
  const internalTypes = useMemo(
    () => filteredTypes.filter((t) => t.origin === "internal"),
    [filteredTypes],
  );
  const bothTypes = useMemo(
    () => filteredTypes.filter((t) => t.origin === "both"),
    [filteredTypes],
  );

  // ── Loading state ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Create mode ──

  if (isCreating) {
    return (
      <TicketTypeForm
        initialData={makeEmptyForm()}
        groups={groups}
        admins={admins}
        saving={saving}
        onSave={handleSaveNew}
        onCancel={() => setIsCreating(false)}
      />
    );
  }

  // ── Edit mode ──

  if (selectedTypeId) {
    const selectedType = ticketTypes.find((t) => t.id === selectedTypeId);
    if (!selectedType) {
      setSelectedTypeId(null);
      return null;
    }
    return (
      <TicketTypeForm
        initialData={typeToFormData(selectedType)}
        groups={groups}
        admins={admins}
        saving={saving}
        onSave={handleSaveEdit}
        onCancel={() => setSelectedTypeId(null)}
      />
    );
  }

  // ── List mode ──

  return (
    <div className="space-y-6">
      {/* Barra de acciones masivas (Fase 11) */}
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          groups={groups}
          admins={admins ?? []}
          busy={bulkBusy}
          onClear={() => setSelected(new Set())}
          onSetChain={(drafts) => {
            const approvalSteps = draftsToPayload(drafts);
            void handleBatch({ approvalSteps, requiresApproval: approvalSteps.length > 0 });
          }}
          onSetAssignee={(adminId) => void handleBatch({ defaultAssignedToUserId: adminId })}
          onSetPriority={(p) => void handleBatch({ defaultPriority: p })}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredTypes.length} tipo{filteredTypes.length !== 1 ? "s" : ""} de
          ticket configurado{filteredTypes.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" onClick={() => setIsCreating(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Nuevo tipo
        </Button>
      </div>

      {/* Guard-origin tickets */}
      {guardTypes.length > 0 && (
        <TicketTypeSection
          title="Solicitudes de Guardias"
          types={guardTypes}
          groups={groups}
          admins={admins}
          selected={selected}
          savingIds={savingIds}
          onToggleSelect={toggleSelect}
          onInlineChain={handleInlineChain}
          onInlineAssignee={(id, adminId) => handleInlinePatch(id, { defaultAssignedToUserId: adminId })}
          onEdit={setSelectedTypeId}
          onToggleActive={handleToggleActive}
        />
      )}

      {/* Internal-origin tickets */}
      {internalTypes.length > 0 && (
        <TicketTypeSection
          title="Solicitudes Internas"
          types={internalTypes}
          groups={groups}
          admins={admins}
          selected={selected}
          savingIds={savingIds}
          onToggleSelect={toggleSelect}
          onInlineChain={handleInlineChain}
          onInlineAssignee={(id, adminId) => handleInlinePatch(id, { defaultAssignedToUserId: adminId })}
          onEdit={setSelectedTypeId}
          onToggleActive={handleToggleActive}
        />
      )}

      {/* Both-origin tickets */}
      {bothTypes.length > 0 && (
        <TicketTypeSection
          title="Ambos"
          types={bothTypes}
          groups={groups}
          admins={admins}
          selected={selected}
          savingIds={savingIds}
          onToggleSelect={toggleSelect}
          onInlineChain={handleInlineChain}
          onInlineAssignee={(id, adminId) => handleInlinePatch(id, { defaultAssignedToUserId: adminId })}
          onEdit={setSelectedTypeId}
          onToggleActive={handleToggleActive}
        />
      )}

      {/* Empty state */}
      {filteredTypes.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-accent/20 p-8 text-center">
          <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No hay tipos de ticket configurados
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Crea un tipo de ticket para comenzar a recibir solicitudes
          </p>
          <Button
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => setIsCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Crear primer tipo
          </Button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Section (by origin)
// ═══════════════════════════════════════════════════════════════

function TicketTypeSection({
  title,
  types,
  groups,
  admins,
  selected,
  savingIds,
  onToggleSelect,
  onInlineChain,
  onInlineAssignee,
  onEdit,
  onToggleActive,
}: {
  title: string;
  types: TicketType[];
  groups: AdminGroup[];
  admins?: Array<{ id: string; name: string | null; email: string }>;
  selected: Set<string>;
  savingIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onInlineChain: (id: string, drafts: ChainStepDraft[]) => void;
  onInlineAssignee: (id: string, adminId: string | null) => void;
  onEdit: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}) {
  const adminList = admins ?? [];
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
        {title}
      </h3>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      aria-label="Seleccionar todos"
                      checked={
                        types.length > 0 && types.every((t) => selected.has(t.id))
                          ? true
                          : types.some((t) => selected.has(t.id))
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => {
                        const allSelected = types.every((t) => selected.has(t.id));
                        // Toggle de todos los de la sección.
                        types.forEach((t) => {
                          if (allSelected ? selected.has(t.id) : !selected.has(t.id)) {
                            onToggleSelect(t.id);
                          }
                        });
                        void v;
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Nombre
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Origen
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Prioridad
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    SLA
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Responsable
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Cadena
                  </th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">
                    Estado
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {types.map((t) => {
                  const priorityCfg = TICKET_PRIORITY_CONFIG[t.defaultPriority];
                  const isSel = selected.has(t.id);
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-border last:border-0 transition-colors ${
                        isSel ? "bg-primary/5" : "hover:bg-accent/30"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <Checkbox
                          aria-label={`Seleccionar ${t.name}`}
                          checked={isSel}
                          onCheckedChange={() => onToggleSelect(t.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{t.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {t.slug}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={ORIGIN_BADGE_VARIANT[t.origin]}>
                          {getOriginLabel(t.origin)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${priorityCfg.color}`}>
                          {priorityCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {slaHoursToDays(t.slaHours)} d
                      </td>
                      <td className="px-4 py-3">
                        <AssigneeCell
                          value={t.defaultAssignedToUserId ?? null}
                          admins={adminList}
                          saving={savingIds.has(t.id)}
                          onChange={(adminId) => onInlineAssignee(t.id, adminId)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <ChainEditorCell
                          steps={t.approvalSteps ?? []}
                          groups={groups}
                          admins={adminList}
                          saving={savingIds.has(t.id)}
                          onSave={(drafts) => onInlineChain(t.id, drafts)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onToggleActive(t.id, !t.isActive)}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                            t.isActive
                              ? "bg-status-ok-soft text-status-ok-fg"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {t.isActive ? "Activo" : "Inactivo"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onEdit(t.id)}
                          className="p-1.5 rounded-md hover:bg-accent transition-colors"
                          title="Editar tipo"
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {types.map((t) => {
          const priorityCfg = TICKET_PRIORITY_CONFIG[t.defaultPriority];
          return (
            <Card
              key={t.id}
              className="transition-colors hover:bg-accent/30 cursor-pointer"
            >
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    aria-label={`Seleccionar ${t.name}`}
                    checked={selected.has(t.id)}
                    onCheckedChange={() => onToggleSelect(t.id)}
                    className="mt-1 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={ORIGIN_BADGE_VARIANT[t.origin]}>
                        {getOriginLabel(t.origin)}
                      </Badge>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleActive(t.id, !t.isActive);
                        }}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          t.isActive
                            ? "bg-status-ok-soft text-status-ok-fg"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.isActive ? "Activo" : "Inactivo"}
                      </button>
                    </div>
                    <p
                      className="text-sm font-medium break-words"
                      onClick={() => onEdit(t.id)}
                    >
                      {t.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span className={priorityCfg.color}>
                        {t.defaultPriority.toUpperCase()}
                      </span>
                      <span className="text-border">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        SLA {slaHoursToDays(t.slaHours)} d
                      </span>
                      <span className="text-border">·</span>
                      <span>
                        {TICKET_TEAM_CONFIG[t.assignedTeam]?.label}
                      </span>
                    </div>
                    {/* Editores en línea (Fase 11) */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <AssigneeCell
                        value={t.defaultAssignedToUserId ?? null}
                        admins={adminList}
                        saving={savingIds.has(t.id)}
                        onChange={(adminId) => onInlineAssignee(t.id, adminId)}
                      />
                      <ChainEditorCell
                        steps={t.approvalSteps ?? []}
                        groups={groups}
                        admins={adminList}
                        saving={savingIds.has(t.id)}
                        onSave={(drafts) => onInlineChain(t.id, drafts)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEdit(t.id)}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors shrink-0"
                  >
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// TODO: el server component padre (la página de configuración que monta este
// cliente) debe pasar la prop `admins` con la lista de admins activos del
// tenant para habilitar el selector "Responsable por defecto" en el formulario
// de tipo de ticket. Si la prop no llega, el selector queda oculto sin romper
// nada.
