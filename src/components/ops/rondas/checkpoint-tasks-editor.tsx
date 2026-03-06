"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, X, GripVertical } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface TaskDraft {
  id?: string;
  label: string;
  type: "boolean" | "checklist" | "select" | "text" | "number" | "photo";
  required: boolean;
  options?: string[];
  config?: {
    min?: number;
    max?: number;
    minPhotos?: number;
    placeholder?: string;
    alertOnValue?: string | boolean | number;
  };
}

const TASK_TYPES = [
  { value: "boolean", label: "Si/No", icon: "✓" },
  { value: "checklist", label: "Checklist", icon: "☑" },
  { value: "select", label: "Seleccion", icon: "◉" },
  { value: "text", label: "Texto", icon: "T" },
  { value: "number", label: "Numero", icon: "#" },
  { value: "photo", label: "Foto", icon: "📷" },
] as const;

const TYPE_COLORS: Record<string, string> = {
  boolean: "border-emerald-500/30 text-emerald-500",
  checklist: "border-blue-500/30 text-blue-500",
  select: "border-purple-500/30 text-purple-500",
  text: "border-amber-500/30 text-amber-500",
  number: "border-cyan-500/30 text-cyan-500",
  photo: "border-pink-500/30 text-pink-500",
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface Props {
  tasks: TaskDraft[];
  onChange: (tasks: TaskDraft[]) => void;
}

export function CheckpointTasksEditor({ tasks, onChange }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Form state for adding/editing a single task
  const [formLabel, setFormLabel] = useState("");
  const [formType, setFormType] = useState<TaskDraft["type"]>("boolean");
  const [formRequired, setFormRequired] = useState(false);
  const [formOptions, setFormOptions] = useState<string[]>([""]);
  const [formConfig, setFormConfig] = useState<TaskDraft["config"]>({});

  const resetForm = useCallback(() => {
    setFormLabel("");
    setFormType("boolean");
    setFormRequired(false);
    setFormOptions([""]);
    setFormConfig({});
    setIsAdding(false);
    setEditingIndex(null);
  }, []);

  const startEditing = useCallback((index: number) => {
    const t = tasks[index];
    setFormLabel(t.label);
    setFormType(t.type);
    setFormRequired(t.required);
    setFormOptions(t.options?.length ? [...t.options] : [""]);
    setFormConfig(t.config ?? {});
    setEditingIndex(index);
    setIsAdding(true);
  }, [tasks]);

  const handleSaveTask = useCallback(() => {
    if (!formLabel.trim()) return;

    const needsOptions = formType === "checklist" || formType === "select";
    const filteredOptions = formOptions.filter((o) => o.trim());
    if (needsOptions && filteredOptions.length === 0) return;

    const task: TaskDraft = {
      label: formLabel.trim(),
      type: formType,
      required: formRequired,
      options: needsOptions ? filteredOptions : undefined,
      config: formType === "number" || formType === "photo" || formType === "text"
        ? formConfig
        : undefined,
    };

    if (editingIndex !== null) {
      // Preserve existing id if editing
      task.id = tasks[editingIndex].id;
      const updated = [...tasks];
      updated[editingIndex] = task;
      onChange(updated);
    } else {
      onChange([...tasks, task]);
    }
    resetForm();
  }, [formLabel, formType, formRequired, formOptions, formConfig, editingIndex, tasks, onChange, resetForm]);

  const removeTask = useCallback((index: number) => {
    onChange(tasks.filter((_, i) => i !== index));
  }, [tasks, onChange]);

  const moveTask = useCallback((index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= tasks.length) return;
    const updated = [...tasks];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    onChange(updated);
  }, [tasks, onChange]);

  const needsOptions = formType === "checklist" || formType === "select";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Tareas del checkpoint
        </label>
        {!isAdding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={() => { resetForm(); setIsAdding(true); }}
          >
            <Plus className="h-3 w-3" />
            Agregar tarea
          </Button>
        )}
      </div>

      {/* Task list */}
      {tasks.length > 0 && (
        <div className="space-y-1">
          {tasks.map((task, idx) => (
            <div
              key={task.id ?? `draft-${idx}`}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card/50 px-2 py-1.5 text-xs"
            >
              <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
              <Badge variant="outline" className={`text-[9px] px-1 shrink-0 ${TYPE_COLORS[task.type] ?? ""}`}>
                {TASK_TYPES.find((t) => t.value === task.type)?.icon}{" "}
                {TASK_TYPES.find((t) => t.value === task.type)?.label}
              </Badge>
              <span className="min-w-0 flex-1 truncate text-foreground">{task.label}</span>
              {task.required && (
                <span className="text-red-400 text-[9px] font-semibold shrink-0">*</span>
              )}
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => moveTask(idx, -1)}
                  disabled={idx === 0}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveTask(idx, 1)}
                  disabled={idx === tasks.length - 1}
                  className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => startEditing(idx)}
                  className="p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeTask(idx)}
                  className="p-0.5 text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit task form */}
      {isAdding && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              {editingIndex !== null ? "Editar tarea" : "Nueva tarea"}
            </span>
            <button type="button" onClick={resetForm} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Type selector */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block">Tipo</label>
            <div className="flex flex-wrap gap-1">
              {TASK_TYPES.map((tt) => (
                <button
                  key={tt.value}
                  type="button"
                  onClick={() => setFormType(tt.value)}
                  className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                    formType === tt.value
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-border/60"
                  }`}
                >
                  {tt.icon} {tt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Label */}
          <Input
            value={formLabel}
            onChange={(e) => setFormLabel(e.target.value)}
            placeholder="Ej: Luz del perimetro funcionando?"
            className="h-8 text-xs"
          />

          {/* Required toggle */}
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={formRequired}
              onChange={(e) => setFormRequired(e.target.checked)}
              className="rounded w-3.5 h-3.5"
            />
            <span>Obligatoria</span>
          </label>

          {/* Options for checklist/select */}
          {needsOptions && (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">
                Opciones {formType === "checklist" ? "(items a verificar)" : "(elegir una)"}
              </label>
              {formOptions.map((opt, i) => (
                <div key={i} className="flex gap-1">
                  <Input
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...formOptions];
                      newOpts[i] = e.target.value;
                      setFormOptions(newOpts);
                    }}
                    placeholder={`Opcion ${i + 1}`}
                    className="h-7 text-[11px] flex-1"
                  />
                  {formOptions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormOptions(formOptions.filter((_, j) => j !== i))}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 gap-1"
                onClick={() => setFormOptions([...formOptions, ""])}
              >
                <Plus className="h-2.5 w-2.5" />
                Agregar opcion
              </Button>
            </div>
          )}

          {/* Number config */}
          {formType === "number" && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">Min</label>
                <Input
                  type="number"
                  value={formConfig?.min ?? ""}
                  onChange={(e) => setFormConfig({ ...formConfig, min: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Min"
                  className="h-7 text-[11px]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground">Max</label>
                <Input
                  type="number"
                  value={formConfig?.max ?? ""}
                  onChange={(e) => setFormConfig({ ...formConfig, max: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="Max"
                  className="h-7 text-[11px]"
                />
              </div>
            </div>
          )}

          {/* Photo config */}
          {formType === "photo" && (
            <div>
              <label className="text-[10px] text-muted-foreground">Fotos minimas</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={formConfig?.minPhotos ?? 1}
                onChange={(e) => setFormConfig({ ...formConfig, minPhotos: Number(e.target.value) || 1 })}
                className="h-7 text-[11px] w-20"
              />
            </div>
          )}

          {/* Text placeholder */}
          {formType === "text" && (
            <div>
              <label className="text-[10px] text-muted-foreground">Placeholder</label>
              <Input
                value={formConfig?.placeholder ?? ""}
                onChange={(e) => setFormConfig({ ...formConfig, placeholder: e.target.value || undefined })}
                placeholder="Texto de ayuda..."
                className="h-7 text-[11px]"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-1.5 pt-1">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs flex-1"
              onClick={handleSaveTask}
              disabled={!formLabel.trim() || (needsOptions && formOptions.filter((o) => o.trim()).length === 0)}
            >
              {editingIndex !== null ? "Guardar" : "Agregar"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={resetForm}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {tasks.length === 0 && !isAdding && (
        <p className="text-[10px] text-muted-foreground">
          Sin tareas. El guardia solo vera las instrucciones generales.
        </p>
      )}
    </div>
  );
}
