"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/opai/EmptyState";

/* ─── Types ─── */

type ProtocolItem = {
  id: string;
  title: string;
  description: string;
  order: number;
  source?: string;
};

type ProtocolSection = {
  id: string;
  title: string;
  icon: string;
  order: number;
  portalVisible?: boolean;
  items: ProtocolItem[];
};

type ProtocolVersion = {
  id: string;
  versionNumber: number;
  status: string;
  publishedAt?: string | null;
};

type ProtocolData = {
  sections: ProtocolSection[];
  documents?: unknown[];
  latestVersion?: ProtocolVersion | null;
  stats: { sectionCount: number; itemCount: number };
};

type WizardMode = null | "manual" | "ai" | "pdf";

type AddItemMode = "manual" | "ai" | null;
type AddSectionMode = "manual" | "ai" | null;

const INSTALLATION_TYPES = [
  { value: "condominio", label: "Condominio" },
  { value: "edificio_corporativo", label: "Edificio Corporativo" },
  { value: "mall_retail", label: "Mall / Retail" },
  { value: "bodega_industria", label: "Bodega / Industria" },
  { value: "obra_construccion", label: "Obra en Construcción" },
  { value: "educacional", label: "Educacional" },
] as const;

/* ─── Component ─── */

export function ProtocolSectionsSubTab({
  installationId,
}: {
  installationId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [wizardMode, setWizardMode] = useState<WizardMode>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  // AI generation wizard state
  const [aiInstallationType, setAiInstallationType] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ProtocolSection[] | null>(null);

  // PDF wizard state
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfResult, setPdfResult] = useState<ProtocolSection[] | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Accordion state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  // Editing state
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemDesc, setEditItemDesc] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState("");
  const [editSectionIcon, setEditSectionIcon] = useState("");

  // Delete confirm dialog
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: "section" | "item";
    sectionId: string;
    itemId?: string;
    label: string;
  } | null>(null);

  // Add item state
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [addItemMode, setAddItemMode] = useState<AddItemMode>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [aiItemDesc, setAiItemDesc] = useState("");
  const [aiItemGenerating, setAiItemGenerating] = useState(false);
  const [aiItemResult, setAiItemResult] = useState<{
    title: string;
    description: string;
  } | null>(null);

  // Add section state
  const [addingSectionMode, setAddingSectionMode] =
    useState<AddSectionMode>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionIcon, setNewSectionIcon] = useState("📋");
  const [aiSectionDesc, setAiSectionDesc] = useState("");
  const [aiSectionGenerating, setAiSectionGenerating] = useState(false);
  const [aiSectionResult, setAiSectionResult] =
    useState<ProtocolSection | null>(null);

  // Publishing
  const [publishing, setPublishing] = useState(false);

  const base = `/api/installations/${installationId}/protocol`;

  /* ─── Fetch protocol ─── */

  const fetchProtocol = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(base);
      const json = await res.json();
      if (json.success && json.data) {
        setProtocol(json.data);
      } else {
        setProtocol({ sections: [], stats: { sectionCount: 0, itemCount: 0 } });
      }
    } catch {
      toast.error("Error al cargar el protocolo");
      setProtocol({ sections: [], stats: { sectionCount: 0, itemCount: 0 } });
    } finally {
      setLoading(false);
    }
  }, [base]);

  const checkAi = useCallback(async () => {
    try {
      const res = await fetch("/api/config/ai-providers");
      const json = await res.json();
      const providers = json.data ?? json.providers ?? [];
      const active = providers.some(
        (p: { isActive?: boolean; hasApiKey?: boolean }) =>
          p.isActive && p.hasApiKey
      );
      setAiAvailable(active);
    } catch {
      setAiAvailable(false);
    }
  }, []);

  useEffect(() => {
    void fetchProtocol();
    void checkAi();
  }, [fetchProtocol, checkAi]);

  /* ─── Helpers ─── */

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasSections =
    !loading && protocol && protocol.sections.length > 0;

  /* ─── Wizard: AI Generate ─── */

  const handleAiGenerate = async () => {
    if (!aiInstallationType) {
      toast.error("Selecciona un tipo de instalación");
      return;
    }
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch(`${base}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationType: aiInstallationType,
          context: aiContext || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const code = json.code || json.error;
        if (code === "NO_AI_CONFIGURED") {
          setAiError("NO_AI_CONFIGURED");
        } else {
          setAiError(json.message || json.error || "Error al generar");
        }
        return;
      }
      setAiResult(json.data?.sections ?? json.data ?? []);
    } catch {
      setAiError("Error de conexión al generar protocolo");
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveGenerated = async (sections: ProtocolSection[]) => {
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Protocolo guardado");
      setWizardMode(null);
      setAiResult(null);
      setPdfResult(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al guardar el protocolo");
    }
  };

  /* ─── Wizard: PDF Extract ─── */

  const handlePdfExtract = async () => {
    if (pdfFiles.length === 0) {
      toast.error("Agrega al menos un archivo PDF");
      return;
    }
    setPdfExtracting(true);
    setAiError(null);
    try {
      const fd = new FormData();
      pdfFiles.forEach((f) => fd.append("files", f));
      const res = await fetch(`${base}/extract-pdf`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        const code = json.code || json.error;
        if (code === "NO_AI_CONFIGURED") {
          setAiError("NO_AI_CONFIGURED");
        } else {
          setAiError(json.message || json.error || "Error al extraer");
        }
        return;
      }
      setPdfResult(json.data?.sections ?? json.data ?? []);
    } catch {
      setAiError("Error de conexión al extraer protocolo");
    } finally {
      setPdfExtracting(false);
    }
  };

  /* ─── Section CRUD ─── */

  const handleCreateSection = async () => {
    if (!newSectionTitle.trim()) return;
    try {
      const res = await fetch(`${base}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newSectionTitle.trim(),
          icon: newSectionIcon || "📋",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Sección creada");
      setNewSectionTitle("");
      setNewSectionIcon("📋");
      setAddingSectionMode(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al crear la sección");
    }
  };

  const handleAiGenerateSection = async () => {
    if (!aiSectionDesc.trim()) return;
    setAiSectionGenerating(true);
    try {
      const res = await fetch(`${base}/generate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiSectionDesc }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      setAiSectionResult(json.data);
    } catch {
      toast.error("Error al generar sección con IA");
    } finally {
      setAiSectionGenerating(false);
    }
  };

  const handleSaveAiSection = async () => {
    if (!aiSectionResult) return;
    try {
      const res = await fetch(`${base}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiSectionResult),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Sección agregada");
      setAiSectionResult(null);
      setAiSectionDesc("");
      setAddingSectionMode(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al guardar la sección");
    }
  };

  const handleUpdateSection = async (sectionId: string) => {
    try {
      const res = await fetch(`${base}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editSectionTitle,
          icon: editSectionIcon,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Sección actualizada");
      setEditingSection(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al actualizar la sección");
    }
  };

  const handleTogglePortalVisible = async (sectionId: string, currentValue: boolean) => {
    try {
      const res = await fetch(`${base}/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalVisible: !currentValue }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success(!currentValue ? "Sección visible en portal" : "Sección oculta del portal");
      await fetchProtocol();
    } catch {
      toast.error("Error al cambiar visibilidad");
    }
  };

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const res = await fetch(`${base}/sections/${sectionId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Sección eliminada");
      await fetchProtocol();
    } catch {
      toast.error("Error al eliminar la sección");
    }
  };

  /* ─── Item CRUD ─── */

  const handleCreateItem = async (sectionId: string) => {
    if (!newItemTitle.trim()) return;
    try {
      const res = await fetch(`${base}/sections/${sectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newItemTitle.trim(),
          description: newItemDesc.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Ítem agregado");
      setNewItemTitle("");
      setNewItemDesc("");
      setAddItemMode(null);
      setAddingItemTo(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al agregar ítem");
    }
  };

  const handleAiGenerateItem = async (sectionTitle: string) => {
    if (!aiItemDesc.trim()) return;
    setAiItemGenerating(true);
    try {
      const res = await fetch(`${base}/generate-item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionTitle,
          description: aiItemDesc,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      setAiItemResult(json.data);
    } catch {
      toast.error("Error al generar ítem con IA");
    } finally {
      setAiItemGenerating(false);
    }
  };

  const handleSaveAiItem = async (sectionId: string) => {
    if (!aiItemResult) return;
    try {
      const res = await fetch(`${base}/sections/${sectionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiItemResult),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Ítem agregado");
      setAiItemResult(null);
      setAiItemDesc("");
      setAddItemMode(null);
      setAddingItemTo(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al guardar el ítem");
    }
  };

  const handleUpdateItem = async (sectionId: string, itemId: string) => {
    try {
      const res = await fetch(
        `${base}/sections/${sectionId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editItemTitle,
            description: editItemDesc,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Ítem actualizado");
      setEditingItem(null);
      await fetchProtocol();
    } catch {
      toast.error("Error al actualizar el ítem");
    }
  };

  const handleDeleteItem = async (sectionId: string, itemId: string) => {
    try {
      const res = await fetch(
        `${base}/sections/${sectionId}/items/${itemId}`,
        { method: "DELETE" }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Ítem eliminado");
      await fetchProtocol();
    } catch {
      toast.error("Error al eliminar el ítem");
    }
  };

  /* ─── Publish ─── */

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`${base}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success("Protocolo publicado");
      await fetchProtocol();
    } catch {
      toast.error("Error al publicar el protocolo");
    } finally {
      setPublishing(false);
    }
  };

  /* ─── Render: Loading ─── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* ─── Render: AI Notice helper ─── */

  const AiNotice = () => (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
      <p>
        Para usar IA, configura un proveedor en{" "}
        <a
          href="/opai/configuracion/inteligencia-artificial"
          className="underline font-medium hover:text-amber-200"
        >
          Configuración → Inteligencia Artificial
        </a>
      </p>
    </div>
  );

  /* ─── Render: AI Loading Overlay ─── */

  const AiLoadingOverlay = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );

  /* ─── Render: AI Error Block ─── */

  const AiErrorBlock = ({
    error,
    onRetry,
  }: {
    error: string;
    onRetry: () => void;
  }) => {
    if (error === "NO_AI_CONFIGURED") {
      return (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
            <AlertTriangle className="h-4 w-4" />
            IA no configurada
          </div>
          <p className="text-sm text-red-300/80">
            Configura un proveedor de IA en{" "}
            <a
              href="/opai/configuracion/inteligencia-artificial"
              className="underline hover:text-red-200"
            >
              Configuración → Inteligencia Artificial
            </a>
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRetry}>
            Reintentar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setAiError(null);
              setWizardMode(null);
            }}
          >
            ← Volver al inicio
          </Button>
        </div>
      </div>
    );
  };

  /* ─── Render: Editable Sections Preview (for AI/PDF results) ─── */

  const SectionsPreview = ({
    sections,
    onSave,
    onRegenerate,
    saving,
  }: {
    sections: ProtocolSection[];
    onSave: () => void;
    onRegenerate?: () => void;
    saving?: boolean;
  }) => (
    <div className="space-y-3">
      {sections.map((s) => (
        <Card key={s.id || s.title} className="bg-card border-border">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span>{s.icon}</span>
              {s.title}
              <Badge variant="secondary" className="text-[10px] ml-auto">
                {s.items.length} ítems
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <ul className="space-y-1">
              {s.items.map((item) => (
                <li key={item.id || item.title} className="text-sm">
                  <span className="font-medium text-foreground">
                    {item.title}
                  </span>
                  {item.description && (
                    <span className="text-muted-foreground ml-1">
                      — {item.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      <div className="flex gap-2 pt-2">
        {onRegenerate && (
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Regenerar
          </Button>
        )}
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5 mr-1" />
          )}
          Guardar
        </Button>
      </div>
    </div>
  );

  /* ─── Render: Wizard (no sections) ─── */

  if (!hasSections && !wizardMode) {
    return (
      <EmptyState
        icon={<Shield className="h-10 w-10" />}
        title="Crear Protocolo de Seguridad"
        description="Selecciona cómo quieres comenzar"
        action={
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mt-2">
            <button
              type="button"
              className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => {
                setWizardMode("manual");
                setProtocol({
                  sections: [],
                  stats: { sectionCount: 0, itemCount: 0 },
                });
              }}
            >
              <div className="text-2xl mb-2">✏️</div>
              <div className="font-medium text-sm text-foreground">Manual</div>
              <div className="text-xs text-muted-foreground mt-1">
                Crea secciones e ítems uno a uno
              </div>
            </button>

            <button
              type="button"
              className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => setWizardMode("ai")}
            >
              <div className="text-2xl mb-2">🤖</div>
              <div className="font-medium text-sm text-foreground">
                Generar con IA
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Genera protocolo completo según el tipo de instalación
              </div>
              {aiAvailable === false && (
                <div className="mt-2 text-[10px] text-amber-400">
                  IA no configurada
                </div>
              )}
            </button>

            <button
              type="button"
              className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary/50 hover:bg-muted/50 transition-colors"
              onClick={() => setWizardMode("pdf")}
            >
              <div className="text-2xl mb-2">📄</div>
              <div className="font-medium text-sm text-foreground">
                Desde PDF
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Extrae el protocolo de un documento existente
              </div>
              {aiAvailable === false && (
                <div className="mt-2 text-[10px] text-amber-400">
                  IA no configurada
                </div>
              )}
            </button>
          </div>
        }
      />
    );
  }

  /* ─── Render: AI Wizard Step ─── */

  if (wizardMode === "ai" && !hasSections) {
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        <h3 className="text-base font-semibold text-foreground">
          🤖 Generar protocolo con IA
        </h3>

        {aiAvailable === false && <AiNotice />}

        {aiGenerating ? (
          <AiLoadingOverlay message="Generando protocolo con IA..." />
        ) : aiError ? (
          <AiErrorBlock error={aiError} onRetry={handleAiGenerate} />
        ) : aiResult ? (
          <SectionsPreview
            sections={aiResult}
            onSave={() => void handleSaveGenerated(aiResult)}
            onRegenerate={() => {
              setAiResult(null);
              void handleAiGenerate();
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de instalación</Label>
              <Select
                value={aiInstallationType}
                onValueChange={setAiInstallationType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo..." />
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

            <div className="space-y-2">
              <Label>Contexto adicional (opcional)</Label>
              <Textarea
                value={aiContext}
                onChange={(e) => setAiContext(e.target.value)}
                placeholder="Describe características especiales de la instalación..."
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWizardMode(null);
                  setAiInstallationType("");
                  setAiContext("");
                }}
              >
                ← Volver
              </Button>
              <Button
                size="sm"
                onClick={() => void handleAiGenerate()}
                disabled={!aiInstallationType || aiAvailable === false}
              >
                🤖 Generar protocolo
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Render: PDF Wizard Step ─── */

  if (wizardMode === "pdf" && !hasSections) {
    return (
      <div className="space-y-4 max-w-xl mx-auto">
        <h3 className="text-base font-semibold text-foreground">
          📄 Extraer protocolo desde PDF
        </h3>

        {aiAvailable === false && <AiNotice />}

        {pdfExtracting ? (
          <AiLoadingOverlay message="Extrayendo protocolo del PDF..." />
        ) : aiError ? (
          <AiErrorBlock error={aiError} onRetry={() => void handlePdfExtract()} />
        ) : pdfResult ? (
          <SectionsPreview
            sections={pdfResult}
            onSave={() => void handleSaveGenerated(pdfResult)}
            onRegenerate={() => {
              setPdfResult(null);
            }}
          />
        ) : (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className="rounded-lg border-2 border-dashed border-border bg-muted/20 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer.files).filter(
                  (f) => f.type === "application/pdf"
                );
                if (files.length === 0) {
                  toast.error("Solo se permiten archivos PDF");
                  return;
                }
                setPdfFiles((prev) => [...prev, ...files]);
              }}
              onClick={() => pdfInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Arrastra archivos PDF aquí o haz clic para seleccionar
              </p>
              <input
                ref={pdfInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setPdfFiles((prev) => [
                      ...prev,
                      ...Array.from(e.target.files!),
                    ]);
                  }
                }}
              />
            </div>

            {/* File list */}
            {pdfFiles.length > 0 && (
              <div className="space-y-1">
                {pdfFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 text-sm bg-muted/30 rounded px-3 py-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground">{f.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-red-400 transition-colors"
                      onClick={() =>
                        setPdfFiles((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWizardMode(null);
                  setPdfFiles([]);
                }}
              >
                ← Volver
              </Button>
              <Button
                size="sm"
                onClick={() => void handlePdfExtract()}
                disabled={
                  pdfFiles.length === 0 || aiAvailable === false
                }
              >
                🤖 Extraer protocolo
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Render: Manual Wizard / Main Protocol View ─── */

  const sections = protocol?.sections ?? [];

  return (
    <div className="space-y-4">
      {/* ── Top bar ── */}
      {hasSections && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">✓ Publicado</Badge>
          <Badge variant="secondary">
            {protocol!.stats.sectionCount} secciones ·{" "}
            {protocol!.stats.itemCount} ítems
          </Badge>
          {protocol!.latestVersion && (
            <Badge variant="outline">v{protocol!.latestVersion.versionNumber}</Badge>
          )}

          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              Publicar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProtocol({
                  sections: [],
                  stats: { sectionCount: 0, itemCount: 0 },
                });
                setWizardMode(null);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Recrear
            </Button>
          </div>
        </div>
      )}

      {/* ── Sections accordion ── */}
      {sections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const isEditingThisSection = editingSection === section.id;

        return (
          <Card key={section.id} className="bg-card border-border">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex flex-1 min-w-0 items-center gap-2 text-left hover:text-primary transition-colors"
                  onClick={() => toggleSection(section.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}

                  {isEditingThisSection ? (
                    <div
                      className="flex items-center gap-2 flex-1 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Input
                        value={editSectionIcon}
                        onChange={(e) => setEditSectionIcon(e.target.value)}
                        className="w-12 h-7 text-center text-sm px-1"
                      />
                      <Input
                        value={editSectionTitle}
                        onChange={(e) => setEditSectionTitle(e.target.value)}
                        className="h-7 text-sm flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            void handleUpdateSection(section.id);
                          if (e.key === "Escape") setEditingSection(null);
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => void handleUpdateSection(section.id)}
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => setEditingSection(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{section.icon}</span>
                      {section.title}
                    </CardTitle>
                  )}
                </button>

                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {section.items.length} ítems
                </Badge>

                {section.portalVisible === false && (
                  <Badge variant="outline" className="text-[10px] shrink-0 text-muted-foreground border-muted-foreground/30">
                    Oculta en portal
                  </Badge>
                )}

                {!isEditingThisSection && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title={section.portalVisible !== false ? "Ocultar del portal cliente" : "Mostrar en portal cliente"}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleTogglePortalVisible(section.id, section.portalVisible !== false);
                      }}
                    >
                      {section.portalVisible !== false
                        ? <Eye className="h-3.5 w-3.5 text-emerald-500" />
                        : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingSection(section.id);
                        setEditSectionTitle(section.title);
                        setEditSectionIcon(section.icon);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteDialog({
                          open: true,
                          type: "section",
                          sectionId: section.id,
                          label: section.title,
                        });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="p-3 pt-0 space-y-2">
                {/* Items list */}
                {section.items.length === 0 && (
                  <p className="text-xs text-muted-foreground py-2">
                    Sin ítems en esta sección
                  </p>
                )}

                {section.items.map((item) => {
                  const isEditingThisItem = editingItem === item.id;

                  if (isEditingThisItem) {
                    return (
                      <div
                        key={item.id}
                        className="rounded border border-border bg-muted/20 p-2 space-y-2"
                      >
                        <Input
                          value={editItemTitle}
                          onChange={(e) => setEditItemTitle(e.target.value)}
                          placeholder="Título"
                          className="h-8 text-sm"
                        />
                        <Textarea
                          value={editItemDesc}
                          onChange={(e) => setEditItemDesc(e.target.value)}
                          placeholder="Descripción"
                          rows={2}
                          className="text-sm"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              void handleUpdateItem(section.id, item.id)
                            }
                          >
                            Guardar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setEditingItem(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="group flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.description}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => {
                            setEditingItem(item.id);
                            setEditItemTitle(item.title);
                            setEditItemDesc(item.description);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                          onClick={() =>
                            setDeleteDialog({
                              open: true,
                              type: "item",
                              sectionId: section.id,
                              itemId: item.id,
                              label: item.title,
                            })
                          }
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}

                {/* Add item */}
                {addingItemTo === section.id && addItemMode === "manual" && (
                  <div className="rounded border border-border bg-muted/20 p-2 space-y-2 mt-2">
                    <Input
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="Título del ítem"
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter")
                          void handleCreateItem(section.id);
                        if (e.key === "Escape") {
                          setAddItemMode(null);
                          setAddingItemTo(null);
                        }
                      }}
                    />
                    <Textarea
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                      placeholder="Descripción (opcional)"
                      rows={2}
                      className="text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void handleCreateItem(section.id)}
                        disabled={!newItemTitle.trim()}
                      >
                        Agregar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          setAddItemMode(null);
                          setAddingItemTo(null);
                          setNewItemTitle("");
                          setNewItemDesc("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {addingItemTo === section.id && addItemMode === "ai" && (
                  <div className="rounded border border-border bg-muted/20 p-2 space-y-2 mt-2">
                    {aiItemGenerating ? (
                      <AiLoadingOverlay message="Generando ítem..." />
                    ) : aiItemResult ? (
                      <div className="space-y-2">
                        <div className="text-sm">
                          <p className="font-medium text-foreground">
                            {aiItemResult.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {aiItemResult.description}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAiItemResult(null);
                              void handleAiGenerateItem(section.title);
                            }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Regenerar
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => void handleSaveAiItem(section.id)}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Agregar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {aiAvailable === false && <AiNotice />}
                        <Input
                          value={aiItemDesc}
                          onChange={(e) => setAiItemDesc(e.target.value)}
                          placeholder="Describe qué tipo de ítem necesitas..."
                          className="h-8 text-sm"
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              void handleAiGenerateItem(section.title);
                            if (e.key === "Escape") {
                              setAddItemMode(null);
                              setAddingItemTo(null);
                            }
                          }}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() =>
                              void handleAiGenerateItem(section.title)
                            }
                            disabled={
                              !aiItemDesc.trim() || aiAvailable === false
                            }
                          >
                            🤖 Generar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAddItemMode(null);
                              setAddingItemTo(null);
                              setAiItemDesc("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Add item trigger buttons */}
                {addingItemTo !== section.id && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        setAddingItemTo(section.id);
                        setAddItemMode("manual");
                        setNewItemTitle("");
                        setNewItemDesc("");
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar ítem
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => {
                        setAddingItemTo(section.id);
                        setAddItemMode("ai");
                        setAiItemDesc("");
                        setAiItemResult(null);
                      }}
                    >
                      🤖 Con IA
                    </Button>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* ── Add section ── */}
      {addingSectionMode === "manual" && (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                value={newSectionIcon}
                onChange={(e) => setNewSectionIcon(e.target.value)}
                className="w-14 h-8 text-center text-sm"
                placeholder="📋"
              />
              <Input
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                placeholder="Nombre de la sección"
                className="h-8 text-sm flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleCreateSection();
                  if (e.key === "Escape") setAddingSectionMode(null);
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => void handleCreateSection()}
                disabled={!newSectionTitle.trim()}
              >
                Crear
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setAddingSectionMode(null);
                  setNewSectionTitle("");
                  setNewSectionIcon("📋");
                }}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {addingSectionMode === "ai" && (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="p-3 space-y-2">
            {aiSectionGenerating ? (
              <AiLoadingOverlay message="Generando sección..." />
            ) : aiSectionResult ? (
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">
                  {aiSectionResult.icon} {aiSectionResult.title}
                </div>
                {aiSectionResult.items?.length > 0 && (
                  <ul className="text-xs text-muted-foreground space-y-0.5 ml-4">
                    {aiSectionResult.items.map((it) => (
                      <li key={it.id || it.title}>• {it.title}</li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setAiSectionResult(null);
                      void handleAiGenerateSection();
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleSaveAiSection()}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Agregar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {aiAvailable === false && <AiNotice />}
                <Input
                  value={aiSectionDesc}
                  onChange={(e) => setAiSectionDesc(e.target.value)}
                  placeholder="Describe qué sección necesitas..."
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAiGenerateSection();
                    if (e.key === "Escape") setAddingSectionMode(null);
                  }}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => void handleAiGenerateSection()}
                    disabled={!aiSectionDesc.trim() || aiAvailable === false}
                  >
                    🤖 Generar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setAddingSectionMode(null);
                      setAiSectionDesc("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!addingSectionMode && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddingSectionMode("manual");
              setNewSectionTitle("");
              setNewSectionIcon("📋");
            }}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Agregar sección
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAddingSectionMode("ai");
              setAiSectionDesc("");
              setAiSectionResult(null);
            }}
          >
            🤖 Con IA
          </Button>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      <Dialog
        open={!!deleteDialog?.open}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que deseas eliminar{" "}
            {deleteDialog?.type === "section" ? "la sección" : "el ítem"}{" "}
            <span className="font-medium text-foreground">
              &quot;{deleteDialog?.label}&quot;
            </span>
            ?
            {deleteDialog?.type === "section" &&
              " Se eliminarán también todos sus ítems."}
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialog(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!deleteDialog) return;
                if (deleteDialog.type === "section") {
                  void handleDeleteSection(deleteDialog.sectionId);
                } else if (deleteDialog.itemId) {
                  void handleDeleteItem(
                    deleteDialog.sectionId,
                    deleteDialog.itemId
                  );
                }
                setDeleteDialog(null);
              }}
            >
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
