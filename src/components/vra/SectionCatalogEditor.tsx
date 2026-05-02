"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  X,
  Check,
  Loader2,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Template = {
  id: string;
  tenantId: string | null;
  parentId: string | null;
  key: string;
  title: string;
  description: string;
  aiPromptHint: string | null;
  outputType: string;
  dataInputs: string[];
  numberingOverride: string | null;
  sortOrder: number;
  isEnabled: boolean;
  isSystem: boolean;
  isMandatory: boolean;
  iconName: string | null;
};

const OUTPUT_TYPE_LABELS: Record<string, string> = {
  narrative: "Texto narrativo",
  metadata_card: "Tarjeta de metadatos",
  risk_distribution: "Distribución de riesgo",
  vuln_cards: "Cards de vulnerabilidad",
  risk_matrix: "Matriz de riesgo",
  heat_map: "Mapa de calor",
  recommendations: "Recomendaciones",
  roadmap: "Hoja de ruta",
  photo_gallery: "Galería fotográfica",
  norms_table: "Tabla normativa",
  glossary: "Glosario",
  bulleted_list: "Lista de bullets",
  comparison_table: "Tabla comparativa",
  site_description: "Descripción de sitio",
};

const ANNEX_TYPES = new Set(["photo_gallery", "norms_table", "glossary"]);

function computeNumbering(templates: Template[]): Map<string, string> {
  const result = new Map<string, string>();
  let mainCount = 0;
  let annexCount = 0;
  const sorted = [...templates]
    .filter((t) => t.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const t of sorted) {
    if (t.numberingOverride) {
      result.set(t.id, t.numberingOverride);
      continue;
    }
    if (ANNEX_TYPES.has(t.outputType)) {
      annexCount++;
      result.set(t.id, String.fromCharCode(64 + annexCount));
    } else {
      mainCount++;
      result.set(t.id, String(mainCount));
    }
  }
  return result;
}

function SectionRow({
  template,
  numbering,
  onToggle,
  onEdit,
  onDelete,
}: {
  template: Template;
  numbering: string | undefined;
  onToggle: (id: string, isEnabled: boolean) => void;
  onEdit: (t: Template) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: template.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const isAnnex = ANNEX_TYPES.has(template.outputType);
  const isClonedFromSystem = !!template.parentId;
  const canDelete = !isClonedFromSystem && !template.isSystem;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors",
        !template.isEnabled && "opacity-60 bg-muted/30",
        isDragging && "shadow-lg ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        className="mt-1 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-shrink-0 flex items-center justify-center h-8 w-10 rounded-md bg-primary/10 text-primary font-mono text-xs font-bold">
        {numbering ?? "—"}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <h4 className="font-medium text-sm truncate">{template.title}</h4>
          {template.isMandatory && (
            <Badge variant="secondary" className="gap-1 text-[10px] py-0">
              <Lock className="h-2.5 w-2.5" />
              Obligatoria
            </Badge>
          )}
          {isAnnex && (
            <Badge variant="outline" className="text-[10px] py-0">
              Anexo
            </Badge>
          )}
          {!isClonedFromSystem && !template.isSystem && (
            <Badge
              variant="outline"
              className="text-[10px] py-0 border-status-ok-border text-status-ok-fg"
            >
              Custom
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
          {template.description}
        </p>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] py-0 font-mono">
            {OUTPUT_TYPE_LABELS[template.outputType] ?? template.outputType}
          </Badge>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {template.key}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title={template.isEnabled ? "Desactivar" : "Activar"}
          disabled={template.isMandatory && template.isEnabled}
          onClick={() => onToggle(template.id, !template.isEnabled)}
        >
          {template.isEnabled ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Editar"
          onClick={() => onEdit(template)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-status-danger-fg hover:text-status-danger-fg"
            title="Eliminar"
            onClick={() => onDelete(template.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function SectionCatalogEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vra/section-templates");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error cargando catálogo");
      setTemplates(json.templates);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const numbering = computeNumbering(templates);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = templates.findIndex((t) => t.id === active.id);
    const newIndex = templates.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const moved = arrayMove(templates, oldIndex, newIndex);

    const reordered = moved.map((t, idx) => ({ ...t, sortOrder: (idx + 1) * 10 }));
    setTemplates(reordered);

    try {
      const res = await fetch("/api/vra/section-templates/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order: reordered.map((t) => ({ id: t.id, sortOrder: t.sortOrder })),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Orden actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error guardando orden");
      load();
    }
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    const previous = templates;
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, isEnabled } : t)));
    try {
      const res = await fetch(`/api/vra/section-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (err) {
      setTemplates(previous);
      toast.error(err instanceof Error ? err.message : "Error actualizando");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta sección? No se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/vra/section-templates/${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success("Sección eliminada");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error eliminando");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            {templates.filter((t) => t.isEnabled).length} secciones activas ·{" "}
            {templates.length - templates.filter((t) => t.isEnabled).length} desactivadas
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nueva sección
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Cargando catálogo...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-xl">
          <p className="text-sm text-muted-foreground">
            No hay secciones configuradas todavía.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={templates.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {templates.map((t) => (
                <SectionRow
                  key={t.id}
                  template={t}
                  numbering={numbering.get(t.id)}
                  onToggle={handleToggle}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar sección</DialogTitle>
            <DialogDescription>
              Ajusta el título y la descripción que la IA usará para generar el
              contenido de esta sección.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <EditForm
              template={editing}
              saving={saving}
              onCancel={() => setEditing(null)}
              onSave={async (patch) => {
                setSaving(true);
                try {
                  const res = await fetch(
                    `/api/vra/section-templates/${editing.id}`,
                    {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(patch),
                    },
                  );
                  const json = await res.json();
                  if (!json.success) throw new Error(json.error);
                  toast.success("Sección actualizada");
                  setEditing(null);
                  load();
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Error guardando",
                  );
                } finally {
                  setSaving(false);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nueva sección custom</DialogTitle>
            <DialogDescription>
              Crea una sección propia que la IA generará en cada informe. La
              descripción es la instrucción principal que la IA leerá.
            </DialogDescription>
          </DialogHeader>
          <CreateForm
            saving={saving}
            onCancel={() => setCreating(false)}
            onSave={async (data) => {
              setSaving(true);
              try {
                const res = await fetch("/api/vra/section-templates", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error);
                toast.success("Sección creada");
                setCreating(false);
                load();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Error creando");
              } finally {
                setSaving(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditForm({
  template,
  saving,
  onCancel,
  onSave,
}: {
  template: Template;
  saving: boolean;
  onCancel: () => void;
  onSave: (patch: Partial<Template>) => void;
}) {
  const [title, setTitle] = useState(template.title);
  const [description, setDescription] = useState(template.description);
  const [aiPromptHint, setAiPromptHint] = useState(template.aiPromptHint ?? "");
  const [numberingOverride, setNumberingOverride] = useState(
    template.numberingOverride ?? "",
  );

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Título
        </Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Descripción para la IA
        </Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Describe qué debe contener esta sección. La IA leerá este texto para entender qué generar."
        />
        <p className="text-[11px] text-muted-foreground">
          Esta descripción se inyecta directamente al prompt de IA. Sé específico:
          qué información debe incluir, cómo estructurarla, qué tono usar.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Instrucción adicional (opcional)
        </Label>
        <Textarea
          value={aiPromptHint}
          onChange={(e) => setAiPromptHint(e.target.value)}
          rows={3}
          placeholder="Hint adicional, ejemplos, restricciones de estilo, etc."
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Numeración manual (opcional)
        </Label>
        <Input
          value={numberingOverride}
          onChange={(e) => setNumberingOverride(e.target.value)}
          placeholder="ej: 1.5, A.2 — vacío = automático"
          maxLength={20}
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" />
          Cancelar
        </Button>
        <Button
          onClick={() =>
            onSave({
              title,
              description,
              aiPromptHint: aiPromptHint.trim() || null,
              numberingOverride: numberingOverride.trim() || null,
            })
          }
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          Guardar
        </Button>
      </div>
    </div>
  );
}

function CreateForm({
  saving,
  onCancel,
  onSave,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: (data: {
    key: string;
    title: string;
    description: string;
    aiPromptHint: string | null;
    outputType: string;
    dataInputs: string[];
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiPromptHint, setAiPromptHint] = useState("");
  const [outputType, setOutputType] = useState("narrative");

  const key = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Título
        </Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="ej: Análisis de Cumplimiento Normativo"
        />
        {title && (
          <p className="text-[11px] text-muted-foreground font-mono">
            key: {key || "(inválido)"}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Descripción para la IA
        </Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder="Describe qué debe contener esta sección. Sé específico: qué información incluir, cómo estructurarla, qué tono usar. La IA leerá este texto para entender qué generar."
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Tipo de bloque (define el formato de output)
        </Label>
        <Select value={outputType} onValueChange={setOutputType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(OUTPUT_TYPE_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Instrucción adicional (opcional)
        </Label>
        <Textarea
          value={aiPromptHint}
          onChange={(e) => setAiPromptHint(e.target.value)}
          rows={3}
          placeholder="Hint adicional, ejemplos, restricciones."
        />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1" />
          Cancelar
        </Button>
        <Button
          onClick={() =>
            onSave({
              key,
              title,
              description,
              aiPromptHint: aiPromptHint.trim() || null,
              outputType,
              dataInputs: ["installation", "findings", "photos"],
            })
          }
          disabled={
            saving || !title || !key || description.length < 10 || !outputType
          }
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Check className="h-4 w-4 mr-1" />
          )}
          Crear sección
        </Button>
      </div>
    </div>
  );
}
