"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit2,
  FileUp,
  Loader2,
  Paperclip,
  PenLine,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

type CreationMode = "select" | "manual" | "ai" | "pdf";

interface AiSection {
  title: string;
  icon: string;
  items: Array<{ title: string; description: string }>;
}

interface PdfFile {
  file: File;
  id: string;
}

const INSTALLATION_TYPES = [
  { value: "condominio", label: "Condominio" },
  { value: "edificio_corporativo", label: "Edificio Corporativo" },
  { value: "mall_retail", label: "Mall / Retail" },
  { value: "bodega_industria", label: "Bodega / Industria" },
  { value: "obra_construccion", label: "Obra en Construcción" },
  { value: "educacional", label: "Educacional" },
];

interface ProtocolCreationWizardProps {
  installationId: string;
  onComplete: () => void;
}

// ─── Component ───────────────────────────────────────────────

export function ProtocolCreationWizard({
  installationId,
  onComplete,
}: ProtocolCreationWizardProps) {
  const [mode, setMode] = useState<CreationMode>("select");
  const [loading, setLoading] = useState(false);

  // AI mode state
  const [installationType, setInstallationType] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [aiSections, setAiSections] = useState<AiSection[] | null>(null);
  const [expandedReview, setExpandedReview] = useState<Set<number>>(new Set());

  // PDF mode state
  const [pdfFiles, setPdfFiles] = useState<PdfFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Save generated sections to DB ──────────────────────────

  const saveSections = useCallback(
    async (sections: AiSection[], source: string) => {
      setLoading(true);
      try {
        for (let i = 0; i < sections.length; i++) {
          const section = sections[i];
          const sectionRes = await fetch("/api/ops/protocols", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              installationId,
              title: section.title,
              icon: section.icon,
              order: i,
            }),
          });
          const sectionJson = await sectionRes.json();
          if (!sectionJson.success) throw new Error(sectionJson.error);

          const sectionId = sectionJson.data.id;
          for (let j = 0; j < section.items.length; j++) {
            const item = section.items[j];
            await fetch(
              `/api/ops/protocols/${sectionId}/sections/${sectionId}/items`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: item.title,
                  description: item.description,
                  order: j,
                  source,
                }),
              },
            );
          }
        }
        toast.success("Protocolo guardado exitosamente");
        onComplete();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error al guardar protocolo",
        );
      } finally {
        setLoading(false);
      }
    },
    [installationId, onComplete],
  );

  // ─── AI Generate ───────────────────────────────────────────

  const handleAiGenerate = async () => {
    if (!installationType) {
      toast.error("Selecciona un tipo de instalación");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/ops/protocols/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          installationType,
          additionalContext: additionalContext || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        const sections = json.data.sections || json.data;
        setAiSections(sections);
        setExpandedReview(
          new Set(Array.from({ length: sections.length }, (_, i) => i)),
        );
      } else {
        toast.error(json.error || "Error al generar protocolo");
      }
    } catch {
      toast.error("Error al generar protocolo con IA");
    } finally {
      setLoading(false);
    }
  };

  // ─── PDF Upload & Extract ──────────────────────────────────

  const addFiles = (files: FileList | File[]) => {
    const newFiles = Array.from(files)
      .filter((f) => f.type === "application/pdf")
      .map((file) => ({ file, id: `${Date.now()}-${Math.random()}` }));
    if (newFiles.length === 0) {
      toast.error("Solo se aceptan archivos PDF");
      return;
    }
    setPdfFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setPdfFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handlePdfExtract = async () => {
    if (pdfFiles.length === 0) {
      toast.error("Agrega al menos un archivo PDF");
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", pdfFiles[0].file);
      formData.append("installationId", installationId);

      const res = await fetch("/api/ops/protocols/ai-from-pdf", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        const sections = json.data.sections || json.data;
        setAiSections(sections);
        setExpandedReview(
          new Set(Array.from({ length: sections.length }, (_, i) => i)),
        );
      } else {
        toast.error(json.error || "Error al procesar PDF");
      }
    } catch {
      toast.error("Error al procesar PDF");
    } finally {
      setLoading(false);
    }
  };

  // ─── Review helpers ─────────────────────────────────────────

  const toggleReviewSection = (index: number) => {
    setExpandedReview((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const removeReviewSection = (index: number) => {
    setAiSections((prev) => (prev ? prev.filter((_, i) => i !== index) : null));
  };

  const removeReviewItem = (sectionIndex: number, itemIndex: number) => {
    setAiSections((prev) =>
      prev
        ? prev.map((s, i) =>
            i === sectionIndex
              ? { ...s, items: s.items.filter((_, j) => j !== itemIndex) }
              : s,
          )
        : null,
    );
  };

  const updateReviewItem = (
    sectionIndex: number,
    itemIndex: number,
    field: "title" | "description",
    value: string,
  ) => {
    setAiSections((prev) =>
      prev
        ? prev.map((s, i) =>
            i === sectionIndex
              ? {
                  ...s,
                  items: s.items.map((item, j) =>
                    j === itemIndex ? { ...item, [field]: value } : item,
                  ),
                }
              : s,
          )
        : null,
    );
  };

  // ─── AI Review Mode ─────────────────────────────────────────

  if (aiSections) {
    const source = mode === "pdf" ? "ai_from_pdf" : "ai_generated";
    const totalItems = aiSections.reduce((sum, s) => sum + s.items.length, 0);

    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-primary/5 border-primary/20 p-3 flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium">
            Protocolo generado — Revisa y edita antes de guardar
          </span>
          <Badge variant="secondary" className="text-[10px]">
            {aiSections.length} secciones · {totalItems} ítems
          </Badge>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAiSections(null);
              if (mode === "ai") handleAiGenerate();
              if (mode === "pdf") handlePdfExtract();
            }}
            disabled={loading}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Regenerar
          </Button>
          <Button
            size="sm"
            onClick={() => saveSections(aiSections, source)}
            disabled={loading || aiSections.length === 0}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : null}
            Guardar protocolo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAiSections(null);
              setMode("select");
            }}
          >
            Cancelar
          </Button>
        </div>

        <div className="space-y-2">
          {aiSections.map((section, si) => (
            <div key={si} className="border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => toggleReviewSection(si)}
              >
                <span className="text-sm">{section.icon || "📋"}</span>
                <span className="text-sm font-medium flex-1 truncate">
                  {section.title}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {section.items.length} ítems
                </Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeReviewSection(si);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                {expandedReview.has(si) ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>

              {expandedReview.has(si) && (
                <div className="divide-y">
                  {section.items.map((item, ii) => (
                    <ReviewItemRow
                      key={ii}
                      item={item}
                      onUpdate={(field, value) =>
                        updateReviewItem(si, ii, field, value)
                      }
                      onRemove={() => removeReviewItem(si, ii)}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Mode Selection ─────────────────────────────────────────

  if (mode === "select") {
    return (
      <div className="py-6 space-y-6 max-w-2xl mx-auto">
        <div className="text-center space-y-1">
          <h3 className="text-base font-semibold">
            Crear Protocolo de Seguridad
          </h3>
          <p className="text-sm text-muted-foreground">
            Selecciona cómo quieres comenzar
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <button
            onClick={() => {
              setMode("manual");
              onComplete();
            }}
            className={cn(
              "flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed",
              "hover:border-foreground/30 hover:bg-muted/50 transition-all text-center group",
            )}
          >
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <PenLine className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold block">Manual</span>
              <span className="text-xs text-muted-foreground mt-1 block">
                Crea secciones e ítems uno a uno
              </span>
            </div>
          </button>

          <button
            onClick={() => setMode("ai")}
            className={cn(
              "flex flex-col items-center gap-3 p-6 rounded-xl border-2",
              "border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-center group",
            )}
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold block">
                Generar con IA
              </span>
              <span className="text-xs text-muted-foreground mt-1 block">
                Genera protocolo completo según el tipo de instalación
              </span>
            </div>
          </button>

          <button
            onClick={() => setMode("pdf")}
            className={cn(
              "flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed",
              "hover:border-foreground/30 hover:bg-muted/50 transition-all text-center group",
            )}
          >
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <FileUp className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
            </div>
            <div>
              <span className="text-sm font-semibold block">Desde PDF</span>
              <span className="text-xs text-muted-foreground mt-1 block">
                Extrae de un documento PDF existente
              </span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ─── AI Mode ────────────────────────────────────────────────

  if (mode === "ai") {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("select")}
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <h3 className="text-sm font-semibold">Generar protocolo con IA</h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Generando protocolo con IA…
            </p>
            <p className="text-xs text-muted-foreground/60">
              Esto puede tomar unos segundos
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Tipo de instalación
              </label>
              <Select
                value={installationType}
                onValueChange={setInstallationType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {INSTALLATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Contexto adicional (opcional)
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Ej: Tiene 3 accesos vehiculares, estacionamiento subterráneo, 2 torres…"
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] resize-y bg-background"
              />
            </div>

            <Button
              onClick={handleAiGenerate}
              disabled={!installationType}
              className="w-full"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Generar protocolo
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ─── PDF Mode ───────────────────────────────────────────────

  if (mode === "pdf") {
    return (
      <div className="space-y-4 max-w-lg">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("select")}
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
          </Button>
          <h3 className="text-sm font-semibold">Extraer protocolo de PDF</h3>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Extrayendo protocolo del PDF…
            </p>
            <p className="text-xs text-muted-foreground/60">
              Analizando el documento con IA
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/30",
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Paperclip className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">
                Arrastra archivos PDF aquí o haz clic para seleccionar
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PDF de protocolos, manuales o procedimientos
              </p>
            </div>

            {pdfFiles.length > 0 && (
              <div className="space-y-2">
                {pdfFiles.map((pf) => (
                  <div
                    key={pf.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">
                      {pf.file.name}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(pf.file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] shrink-0"
                    >
                      Cargado
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => removeFile(pf.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handlePdfExtract}
              disabled={pdfFiles.length === 0}
              className="w-full"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Extraer protocolo
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ─── Review Item Row ──────────────────────────────────────────

function ReviewItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: { title: string; description: string };
  onUpdate: (field: "title" | "description", value: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [desc, setDesc] = useState(item.description);

  if (editing) {
    return (
      <div className="px-4 py-3 space-y-2 bg-muted/20">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border rounded-md px-3 py-1.5 text-sm bg-background"
          autoFocus
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          className="w-full border rounded-md px-3 py-1.5 text-sm min-h-[60px] resize-y bg-background"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              onUpdate("title", title);
              onUpdate("description", desc);
              setEditing(false);
            }}
          >
            Aplicar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTitle(item.title);
              setDesc(item.description);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2.5 hover:bg-muted/30 transition-colors group flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{item.title}</span>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
      <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => setEditing(true)}
        >
          <Edit2 className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
