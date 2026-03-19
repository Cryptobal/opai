"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  Eye,
  Type,
  Image,
  Link,
  Layout,
  Hash,
  AlignLeft,
  Minus,
  Monitor,
  PanelBottom,
  Loader2,
  ArrowLeft,
  ListChecks,
} from "lucide-react";
import type {
  EmailBlock,
  EmailBlockType,
  EmailBlockContent,
  EmailFeatureItem,
} from "@/lib/email/types";
import { EMAIL_VARIABLES } from "@/lib/email/types";

/* ── Constants ── */

const ACCENT = "#f97316";
const BG_DARK = "#0a0a0f";
const BG_CARD = "#1a1a24";
const TEXT_LIGHT = "#e5e5e5";
const TEXT_MUTED = "#a3a3a3";

const BLOCK_CATALOG: { tipo: EmailBlockType; label: string; icon: React.ReactNode }[] = [
  { tipo: "header", label: "Header", icon: <Layout className="h-4 w-4" /> },
  { tipo: "texto", label: "Texto", icon: <AlignLeft className="h-4 w-4" /> },
  { tipo: "boton", label: "Botón", icon: <Link className="h-4 w-4" /> },
  { tipo: "imagen", label: "Imagen", icon: <Image className="h-4 w-4" /> },
  { tipo: "separador", label: "Separador", icon: <Minus className="h-4 w-4" /> },
  { tipo: "portales", label: "Portales", icon: <Monitor className="h-4 w-4" /> },
  { tipo: "caracteristicas", label: "Features", icon: <ListChecks className="h-4 w-4" /> },
  { tipo: "pin", label: "PIN", icon: <Hash className="h-4 w-4" /> },
  { tipo: "footer", label: "Footer", icon: <PanelBottom className="h-4 w-4" /> },
];

function newBlock(tipo: EmailBlockType, orden: number): EmailBlock {
  const defaults: Record<EmailBlockType, EmailBlockContent> = {
    header: { titulo: "Bienvenido a OPAI", subtitulo: "" },
    texto: { texto: "Escribe tu contenido aquí..." },
    boton: { label: "Acceder", url: "https://", color: ACCENT },
    imagen: { src: "", alt: "", width: 200 },
    separador: {},
    portales: { mostrarGuardia: true, mostrarRondas: true, mostrarAcceso: true },
    caracteristicas: {
      items: [
        { emoji: "\u{2705}", titulo: "Título del beneficio", descripcion: "Descripción del beneficio." },
      ],
    },
    pin: { textoAntes: "Tu PIN de acceso es:", textoDespues: "" },
    footer: { texto: "OPAI — Gard Security" },
  };
  return { id: crypto.randomUUID(), tipo, contenido: defaults[tipo], orden };
}

/* ── Sortable block wrapper ── */

function SortableBlock({
  block,
  isSelected,
  onSelect,
  onDelete,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: block.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border-2 transition-colors cursor-pointer ${
        isSelected
          ? "border-orange-500/60 bg-orange-500/5"
          : "border-transparent hover:border-white/10"
      }`}
      onClick={onSelect}
    >
      <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          className="p-1 text-muted-foreground hover:text-red-400"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <BlockPreview block={block} />
    </div>
  );
}

/* ── Block preview (left panel) ── */

function HighlightVars({ text }: { text: string }) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <>
      {parts.map((part, i) =>
        /^{{.+}}$/.test(part) ? (
          <span
            key={i}
            className="inline-block rounded px-1 py-0.5 text-xs font-mono"
            style={{ background: `${ACCENT}30`, color: ACCENT }}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function BlockPreview({ block }: { block: EmailBlock }) {
  const c = block.contenido;

  switch (block.tipo) {
    case "header":
      return (
        <div className="text-center py-6 px-4">
          <h2 className="text-xl font-semibold" style={{ color: TEXT_LIGHT }}>
            <HighlightVars text={c.titulo ?? "Header"} />
          </h2>
          {c.subtitulo && (
            <p className="text-sm mt-1" style={{ color: TEXT_MUTED }}>
              <HighlightVars text={c.subtitulo} />
            </p>
          )}
        </div>
      );

    case "texto":
      return (
        <div className="py-3 px-4 text-sm leading-relaxed" style={{ color: TEXT_LIGHT }}>
          <HighlightVars text={c.texto ?? ""} />
        </div>
      );

    case "boton":
      return (
        <div className="py-4 px-4 text-center">
          <span
            className="inline-block rounded-md px-6 py-2.5 text-sm font-semibold text-white"
            style={{ background: c.color ?? ACCENT }}
          >
            {c.label ?? "Botón"}
          </span>
        </div>
      );

    case "imagen":
      return (
        <div className="py-3 px-4 text-center">
          {c.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={c.src}
              alt={c.alt ?? ""}
              style={{ maxWidth: c.width ?? 200, height: "auto" }}
              className="inline-block rounded"
            />
          ) : (
            <div
              className="inline-flex items-center justify-center rounded border border-dashed border-white/20"
              style={{ width: c.width ?? 200, height: 80 }}
            >
              <Image className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>
      );

    case "separador":
      return (
        <div className="py-4 px-4">
          <hr className="border-t border-white/10" />
        </div>
      );

    case "portales":
      return (
        <div className="py-3 px-4 flex gap-3 justify-center">
          {c.mostrarGuardia !== false && (
            <div className="rounded-lg p-3 flex-1 max-w-[160px]" style={{ background: BG_CARD }}>
              <p className="text-xs font-semibold" style={{ color: TEXT_LIGHT }}>Portal Guardia</p>
              <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>Turnos, asistencia</p>
              <p className="text-[10px] mt-2" style={{ color: ACCENT }}>Acceder →</p>
            </div>
          )}
          {c.mostrarRondas !== false && (
            <div className="rounded-lg p-3 flex-1 max-w-[160px]" style={{ background: BG_CARD }}>
              <p className="text-xs font-semibold" style={{ color: TEXT_LIGHT }}>Portal Rondas</p>
              <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>GPS tracking</p>
              <p className="text-[10px] mt-2" style={{ color: ACCENT }}>Acceder →</p>
            </div>
          )}
          {c.mostrarAcceso !== false && (
            <div className="rounded-lg p-3 flex-1 max-w-[160px]" style={{ background: BG_CARD }}>
              <p className="text-xs font-semibold" style={{ color: TEXT_LIGHT }}>Portal Acceso</p>
              <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>Control ingreso</p>
              <p className="text-[10px] mt-2" style={{ color: ACCENT }}>Acceder →</p>
            </div>
          )}
        </div>
      );

    case "caracteristicas": {
      const items = (c.items ?? []) as EmailFeatureItem[];
      return (
        <div className="py-3 px-4">
          <div className="rounded-lg overflow-hidden" style={{ background: BG_CARD }}>
            {items.map((item, idx) => (
              <div
                key={idx}
                className="flex gap-3 px-4 py-3"
                style={{ borderBottom: idx < items.length - 1 ? "1px solid #0a0a0f" : "none" }}
              >
                <span className="text-lg flex-shrink-0">{item.emoji}</span>
                <div>
                  <p className="text-xs font-semibold" style={{ color: TEXT_LIGHT }}>{item.titulo}</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: TEXT_MUTED }}>{item.descripcion}</p>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <div className="px-4 py-6 text-center text-xs" style={{ color: TEXT_MUTED }}>
                Agrega características desde el panel derecho
              </div>
            )}
          </div>
        </div>
      );
    }

    case "pin":
      return (
        <div className="py-4 px-4 text-center">
          <div
            className="inline-block rounded-lg px-8 py-4 border-2"
            style={{ background: `${ACCENT}10`, borderColor: ACCENT }}
          >
            <p className="text-xs" style={{ color: TEXT_MUTED }}>
              <HighlightVars text={c.textoAntes ?? "Tu PIN:"} />
            </p>
            <p
              className="text-2xl font-bold tracking-[4px] mt-1"
              style={{ color: ACCENT }}
            >
              {"{{pin}}"}
            </p>
            {c.textoDespues && (
              <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
                <HighlightVars text={c.textoDespues} />
              </p>
            )}
          </div>
        </div>
      );

    case "footer":
      return (
        <div className="py-4 px-4 text-center border-t border-white/10">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>
            <HighlightVars text={c.texto ?? "OPAI"} />
          </p>
        </div>
      );
  }
}

/* ── Property editor (right panel) ── */

function PropertyEditor({
  block,
  onChange,
}: {
  block: EmailBlock;
  onChange: (contenido: EmailBlockContent) => void;
}) {
  const c = block.contenido;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const set = (key: keyof EmailBlockContent, value: unknown) =>
    onChange({ ...c, [key]: value });

  const insertVariable = (variable: string) => {
    const tag = `{{${variable}}}`;

    if (textareaRef.current) {
      const ta = textareaRef.current;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const current = c.texto ?? "";
      const newText = current.slice(0, start) + tag + current.slice(end);
      set("texto", newText);
      requestAnimationFrame(() => {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + tag.length;
      });
      return;
    }

    const textFields = ["textoAntes", "textoDespues", "titulo", "subtitulo"] as const;
    for (const field of textFields) {
      const ref = inputRefs.current[field];
      if (ref && document.activeElement === ref) {
        const start = ref.selectionStart ?? 0;
        const end = ref.selectionEnd ?? 0;
        const current = (c[field] as string) ?? "";
        const newVal = current.slice(0, start) + tag + current.slice(end);
        set(field, newVal);
        requestAnimationFrame(() => {
          ref.focus();
          ref.selectionStart = ref.selectionEnd = start + tag.length;
        });
        return;
      }
    }
  };

  const variableButtons = (
    <div className="mt-3">
      <Label className="text-xs text-muted-foreground">Insertar variable</Label>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {EMAIL_VARIABLES.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => insertVariable(v)}
            className="rounded px-2 py-0.5 text-[11px] font-mono transition-colors"
            style={{
              background: `${ACCENT}20`,
              color: ACCENT,
            }}
          >
            {`{{${v}}}`}
          </button>
        ))}
      </div>
    </div>
  );

  switch (block.tipo) {
    case "header":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Título</Label>
            <Input
              ref={(el) => { inputRefs.current.titulo = el; }}
              value={c.titulo ?? ""}
              onChange={(e) => set("titulo", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Subtítulo</Label>
            <Input
              ref={(el) => { inputRefs.current.subtitulo = el; }}
              value={c.subtitulo ?? ""}
              onChange={(e) => set("subtitulo", e.target.value)}
              className="mt-1"
            />
          </div>
          {variableButtons}
        </div>
      );

    case "texto":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Texto</Label>
            <textarea
              ref={textareaRef}
              value={c.texto ?? ""}
              onChange={(e) => set("texto", e.target.value)}
              rows={6}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
          {variableButtons}
        </div>
      );

    case "boton":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Texto del botón</Label>
            <Input
              value={c.label ?? ""}
              onChange={(e) => set("label", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">URL</Label>
            <Input
              value={c.url ?? ""}
              onChange={(e) => set("url", e.target.value)}
              className="mt-1"
              placeholder="https://..."
            />
          </div>
          <div>
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="color"
                value={c.color ?? ACCENT}
                onChange={(e) => set("color", e.target.value)}
                className="h-8 w-8 rounded border border-input cursor-pointer"
              />
              <Input
                value={c.color ?? ACCENT}
                onChange={(e) => set("color", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
        </div>
      );

    case "imagen":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">URL de imagen</Label>
            <Input
              value={c.src ?? ""}
              onChange={(e) => set("src", e.target.value)}
              className="mt-1"
              placeholder="https://..."
            />
          </div>
          <div>
            <Label className="text-xs">Texto alternativo</Label>
            <Input
              value={c.alt ?? ""}
              onChange={(e) => set("alt", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Ancho (px)</Label>
            <Input
              type="number"
              value={c.width ?? 200}
              onChange={(e) => set("width", parseInt(e.target.value) || 200)}
              className="mt-1"
            />
          </div>
        </div>
      );

    case "separador":
      return (
        <p className="text-sm text-muted-foreground">
          Este bloque no tiene propiedades editables.
        </p>
      );

    case "portales":
      return (
        <div className="space-y-3">
          {(
            [
              ["mostrarGuardia", "Portal del Guardia"],
              ["mostrarRondas", "Portal de Rondas"],
              ["mostrarAcceso", "Portal de Acceso"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={c[key] !== false}
                onChange={(e) => set(key, e.target.checked)}
                className="h-4 w-4 rounded border-input accent-orange-500"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      );

    case "caracteristicas": {
      const items = (c.items ?? []) as EmailFeatureItem[];
      const updateItem = (idx: number, field: keyof EmailFeatureItem, value: string) => {
        const updated = items.map((item, i) =>
          i === idx ? { ...item, [field]: value } : item,
        );
        onChange({ ...c, items: updated });
      };
      const addItem = () => {
        onChange({
          ...c,
          items: [...items, { emoji: "\u{2705}", titulo: "", descripcion: "" }],
        });
      };
      const removeItem = (idx: number) => {
        onChange({ ...c, items: items.filter((_, i) => i !== idx) });
      };
      return (
        <div className="space-y-3">
          <Label className="text-xs">Características / Beneficios</Label>
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-white/10 p-3 space-y-2"
            >
              <div className="flex items-center gap-2">
                <Input
                  value={item.emoji}
                  onChange={(e) => updateItem(idx, "emoji", e.target.value)}
                  className="w-14 text-center"
                  maxLength={4}
                />
                <Input
                  value={item.titulo}
                  onChange={(e) => updateItem(idx, "titulo", e.target.value)}
                  placeholder="Título"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  className="p-1 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={item.descripcion}
                onChange={(e) => updateItem(idx, "descripcion", e.target.value)}
                placeholder="Descripción"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={addItem}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar característica
          </Button>
        </div>
      );
    }

    case "pin":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Texto antes del PIN</Label>
            <Input
              ref={(el) => { inputRefs.current.textoAntes = el; }}
              value={c.textoAntes ?? ""}
              onChange={(e) => set("textoAntes", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Texto después del PIN</Label>
            <Input
              ref={(el) => { inputRefs.current.textoDespues = el; }}
              value={c.textoDespues ?? ""}
              onChange={(e) => set("textoDespues", e.target.value)}
              className="mt-1"
            />
          </div>
          {variableButtons}
        </div>
      );

    case "footer":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Texto del footer</Label>
            <Input
              value={c.texto ?? ""}
              onChange={(e) => set("texto", e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      );
  }
}

/* ── Main component ── */

interface TemplateEditorProps {
  templateId?: string;
  tenantId: string;
}

export default function TemplateEditorClient({
  templateId,
  tenantId,
}: TemplateEditorProps) {
  const router = useRouter();
  const isNew = !templateId || templateId === "new";

  const [nombre, setNombre] = useState("");
  const [asunto, setAsunto] = useState("");
  const [tipo, setTipo] = useState<"ONBOARDING" | "BIENVENIDA_SITIO" | "RECORDATORIO" | "GENERAL">("ONBOARDING");
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const res = await fetch(`/api/personas/comunicaciones/templates/${templateId}`);
        const json = await res.json();
        if (json.success && json.data) {
          const t = json.data;
          setNombre(t.nombre);
          setAsunto(t.asunto);
          setTipo(t.tipo);
          const content = t.contenido as EmailBlock[] | undefined;
          setBlocks(content ?? []);
        }
      } catch (err) {
        console.error("Error loading template:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [templateId, isNew]);

  const selectedBlock = blocks.find((b) => b.id === selectedId) ?? null;

  const addBlock = useCallback(
    (tipo: EmailBlockType) => {
      const block = newBlock(tipo, blocks.length);
      setBlocks((prev) => [...prev, block]);
      setSelectedId(block.id);
    },
    [blocks.length],
  );

  const deleteBlock = useCallback(
    (id: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const updateBlockContent = useCallback(
    (id: string, contenido: EmailBlockContent) => {
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, contenido } : b)),
      );
    },
    [],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b.id === active.id);
      const newIndex = prev.findIndex((b) => b.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      return reordered.map((b, i) => ({ ...b, orden: i }));
    });
  }, []);

  const handleSave = async () => {
    if (!nombre || !asunto) return;
    setSaving(true);

    const orderedBlocks = blocks.map((b, i) => ({ ...b, orden: i }));
    const usedVars = new Set<string>();
    for (const b of orderedBlocks) {
      const text = JSON.stringify(b.contenido);
      for (const v of EMAIL_VARIABLES) {
        if (text.includes(`{{${v}}}`)) usedVars.add(v);
      }
    }

    const payload = {
      nombre,
      asunto,
      tipo,
      contenido: orderedBlocks,
      variables: Array.from(usedVars),
    };

    try {
      const url = isNew
        ? "/api/personas/comunicaciones/templates"
        : `/api/personas/comunicaciones/templates/${templateId}`;
      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        if (isNew && json.data?.id) {
          router.replace(`/personas/comunicaciones/plantillas/${json.data.id}`);
        }
      }
    } catch (err) {
      console.error("Error saving template:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/personas/comunicaciones")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la plantilla"
          className="max-w-[260px] text-sm font-medium"
        />
        <Input
          value={asunto}
          onChange={(e) => setAsunto(e.target.value)}
          placeholder="Asunto del email"
          className="max-w-[260px] text-sm"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as typeof tipo)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="ONBOARDING">Onboarding</option>
          <option value="BIENVENIDA_SITIO">Bienvenida sitio</option>
          <option value="RECORDATORIO">Recordatorio</option>
          <option value="GENERAL">General</option>
        </select>
        <div className="flex-1" />
        <Button onClick={handleSave} disabled={saving || !nombre || !asunto}>
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Guardar
        </Button>
      </div>

      {/* Main split */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Preview */}
        <div className="flex-[65] overflow-y-auto border-r border-white/[0.06]">
          <div className="max-w-[640px] mx-auto py-6 px-8">
            <div className="rounded-lg overflow-hidden" style={{ background: BG_DARK }}>
              <div className="p-6">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={blocks.map((b) => b.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {blocks.length === 0 ? (
                      <div className="py-16 text-center text-muted-foreground text-sm">
                        <Eye className="h-8 w-8 mx-auto mb-3 opacity-40" />
                        Agrega bloques desde el panel derecho
                      </div>
                    ) : (
                      <div className="space-y-1 pl-8">
                        {blocks.map((block) => (
                          <SortableBlock
                            key={block.id}
                            block={block}
                            isSelected={selectedId === block.id}
                            onSelect={() => setSelectedId(block.id)}
                            onDelete={() => deleteBlock(block.id)}
                          />
                        ))}
                      </div>
                    )}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Toolbar + Editor */}
        <div className="flex-[35] overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Block catalog */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Agregar bloque
              </h3>
              <div className="grid grid-cols-4 gap-1.5">
                {BLOCK_CATALOG.map((item) => (
                  <button
                    key={item.tipo}
                    type="button"
                    onClick={() => addBlock(item.tipo)}
                    className="flex flex-col items-center gap-1 rounded-lg p-2.5 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Property editor */}
            {selectedBlock ? (
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold capitalize">
                    {selectedBlock.tipo === "boton" ? "Botón" : selectedBlock.tipo}
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-400"
                    onClick={() => deleteBlock(selectedBlock.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <PropertyEditor
                  block={selectedBlock}
                  onChange={(contenido) =>
                    updateBlockContent(selectedBlock.id, contenido)
                  }
                />
              </Card>
            ) : (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <Type className="h-6 w-6 mx-auto mb-2 opacity-40" />
                Selecciona un bloque para editar sus propiedades
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
