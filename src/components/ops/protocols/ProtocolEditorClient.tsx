"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  FileDown,
  FileUp,
  GripVertical,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ExamSubTab } from "@/components/ops/exams/ExamSubTab";
import { ClientReportView } from "./ClientReportView";

// ─── Types ───────────────────────────────────────────────────

interface ProtocolItem {
  id: string;
  title: string;
  description: string | null;
  order: number;
  source: string;
}

interface ProtocolSection {
  id: string;
  title: string;
  icon: string | null;
  order: number;
  items: ProtocolItem[];
}

interface VersionSummary {
  id: string;
  versionNumber: number;
  status: string;
  publishedAt: string | null;
  createdAt: string;
}

interface ProtocolEditorProps {
  installationId: string;
  installationName: string;
  onRecreate?: () => void;
}

type SubTab = "secciones" | "examenes" | "vista-cliente";
type AddItemMode = null | "manual" | "ai";
type AddSectionMode = null | "manual" | "ai";

// ─── Component ───────────────────────────────────────────────

export function ProtocolEditorClient({
  installationId,
  installationName,
  onRecreate,
}: ProtocolEditorProps) {
  const [sections, setSections] = useState<ProtocolSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<SubTab>("secciones");

  // Version info
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  // Section editing
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");

  // Item editing
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState("");
  const [editingItemDesc, setEditingItemDesc] = useState("");

  // Add item
  const [addingItemToSection, setAddingItemToSection] = useState<string | null>(null);
  const [addItemMode, setAddItemMode] = useState<AddItemMode>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [aiItemPrompt, setAiItemPrompt] = useState("");
  const [aiGeneratingItem, setAiGeneratingItem] = useState(false);
  const [aiItemPreview, setAiItemPreview] = useState<{ title: string; description: string } | null>(null);

  // Add section
  const [addSectionMode, setAddSectionMode] = useState<AddSectionMode>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionIcon, setNewSectionIcon] = useState("");
  const [aiSectionPrompt, setAiSectionPrompt] = useState("");
  const [aiGeneratingSection, setAiGeneratingSection] = useState(false);
  const [aiSectionPreview, setAiSectionPreview] = useState<{
    title: string;
    icon: string;
    items: Array<{ title: string; description: string }>;
  } | null>(null);

  // Publish / actions
  const [publishing, setPublishing] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Document upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingProtocolPdf, setDownloadingProtocolPdf] = useState(false);

  // AI config check
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  // ─── Data Fetching ──────────────────────────────────────────

  const fetchProtocol = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ops/protocols?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) {
        setSections(json.data);
        setExpandedSections(new Set(json.data.map((s: ProtocolSection) => s.id)));
      }
    } catch {
      toast.error("Error al cargar protocolo");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/ops/protocols/${installationId}/versions`);
      const json = await res.json();
      if (json.success) setVersions(json.data);
    } catch {
      // silent
    }
  }, [installationId]);

  const checkAiConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config/ai-providers");
      const json = await res.json();
      if (json.success) {
        const hasDefault = json.data.some((p: { isActive: boolean; models: { isDefault: boolean }[] }) =>
          p.isActive && p.models.some((m: { isDefault: boolean }) => m.isDefault),
        );
        setAiConfigured(hasDefault);
      }
    } catch {
      setAiConfigured(false);
    }
  }, []);

  useEffect(() => {
    fetchProtocol();
    fetchVersions();
    checkAiConfig();
  }, [fetchProtocol, fetchVersions, checkAiConfig]);

  // Derived data
  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const publishedVersion = versions.find((v) => v.status === "published");

  // ─── Section Operations ─────────────────────────────────────

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveSection = async (sectionId: string) => {
    try {
      const res = await fetch(`/api/ops/protocols/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editingSectionTitle }),
      });
      const json = await res.json();
      if (json.success) {
        setSections((prev) =>
          prev.map((s) => (s.id === sectionId ? { ...s, title: editingSectionTitle } : s)),
        );
        setEditingSection(null);
        toast.success("Sección actualizada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al actualizar sección");
    }
  };

  const deleteSection = async (sectionId: string) => {
    if (!confirm("¿Eliminar esta sección y todos sus ítems?")) return;
    try {
      const res = await fetch(`/api/ops/protocols/${sectionId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        setSections((prev) => prev.filter((s) => s.id !== sectionId));
        toast.success("Sección eliminada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al eliminar sección");
    }
  };

  const addSectionManual = async () => {
    if (!newSectionTitle.trim()) return;
    try {
      const res = await fetch("/api/ops/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          title: newSectionTitle,
          icon: newSectionIcon || null,
          order: sections.length,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSections((prev) => [...prev, { ...json.data, items: [] }]);
        setExpandedSections((prev) => new Set([...prev, json.data.id]));
        resetAddSection();
        toast.success("Sección creada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al crear sección");
    }
  };

  const generateAiSection = async () => {
    if (!aiSectionPrompt.trim()) return;
    setAiGeneratingSection(true);
    try {
      const res = await fetch("/api/ops/protocols/ai-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId, description: aiSectionPrompt }),
      });
      const json = await res.json();
      if (json.success) {
        setAiSectionPreview(json.data);
      } else {
        toast.error(json.error || "Error al generar sección con IA");
      }
    } catch {
      toast.error("Error al generar sección con IA");
    } finally {
      setAiGeneratingSection(false);
    }
  };

  const saveAiSection = async () => {
    if (!aiSectionPreview) return;
    setSavingItem(true);
    try {
      const sectionRes = await fetch("/api/ops/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          title: aiSectionPreview.title,
          icon: aiSectionPreview.icon,
          order: sections.length,
        }),
      });
      const sectionJson = await sectionRes.json();
      if (!sectionJson.success) throw new Error(sectionJson.error);

      const sectionId = sectionJson.data.id;
      for (let j = 0; j < aiSectionPreview.items.length; j++) {
        const item = aiSectionPreview.items[j];
        await fetch(`/api/ops/protocols/${sectionId}/sections/${sectionId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            description: item.description,
            order: j,
            source: "ai_generated",
          }),
        });
      }
      resetAddSection();
      toast.success("Sección creada con IA");
      await fetchProtocol();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar sección");
    } finally {
      setSavingItem(false);
    }
  };

  const resetAddSection = () => {
    setAddSectionMode(null);
    setNewSectionTitle("");
    setNewSectionIcon("");
    setAiSectionPrompt("");
    setAiSectionPreview(null);
  };

  // ─── Item Operations ────────────────────────────────────────

  const saveItem = async (sectionId: string, itemId: string) => {
    try {
      const res = await fetch(
        `/api/ops/protocols/${sectionId}/sections/${sectionId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editingItemTitle, description: editingItemDesc }),
        },
      );
      const json = await res.json();
      if (json.success) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? {
                  ...s,
                  items: s.items.map((i) =>
                    i.id === itemId
                      ? { ...i, title: editingItemTitle, description: editingItemDesc }
                      : i,
                  ),
                }
              : s,
          ),
        );
        setEditingItem(null);
        toast.success("Ítem actualizado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al actualizar ítem");
    }
  };

  const deleteItem = async (sectionId: string, itemId: string) => {
    if (!confirm("¿Eliminar este ítem?")) return;
    try {
      const res = await fetch(
        `/api/ops/protocols/${sectionId}/sections/${sectionId}/items/${itemId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (json.success) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId
              ? { ...s, items: s.items.filter((i) => i.id !== itemId) }
              : s,
          ),
        );
        toast.success("Ítem eliminado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al eliminar ítem");
    }
  };

  const addItemManual = async (sectionId: string) => {
    if (!newItemTitle.trim()) return;
    setSavingItem(true);
    try {
      const res = await fetch(
        `/api/ops/protocols/${sectionId}/sections/${sectionId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: newItemTitle,
            description: newItemDesc || null,
            order: sections.find((s) => s.id === sectionId)?.items.length ?? 0,
          }),
        },
      );
      const json = await res.json();
      if (json.success) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, items: [...s.items, json.data] } : s,
          ),
        );
        resetAddItem();
        toast.success("Ítem creado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al crear ítem");
    } finally {
      setSavingItem(false);
    }
  };

  const generateAiItem = async (sectionId: string) => {
    if (!aiItemPrompt.trim()) return;
    setAiGeneratingItem(true);
    try {
      const res = await fetch("/api/ops/protocols/ai-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, description: aiItemPrompt }),
      });
      const json = await res.json();
      if (json.success) {
        setAiItemPreview(json.data);
      } else {
        toast.error(json.error || "Error al generar ítem con IA");
      }
    } catch {
      toast.error("Error al generar ítem con IA");
    } finally {
      setAiGeneratingItem(false);
    }
  };

  const saveAiItem = async (sectionId: string) => {
    if (!aiItemPreview) return;
    setSavingItem(true);
    try {
      const res = await fetch(
        `/api/ops/protocols/${sectionId}/sections/${sectionId}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: aiItemPreview.title,
            description: aiItemPreview.description,
            order: sections.find((s) => s.id === sectionId)?.items.length ?? 0,
            source: "ai_generated",
          }),
        },
      );
      const json = await res.json();
      if (json.success) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, items: [...s.items, json.data] } : s,
          ),
        );
        resetAddItem();
        toast.success("Ítem agregado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al guardar ítem");
    } finally {
      setSavingItem(false);
    }
  };

  const resetAddItem = () => {
    setAddingItemToSection(null);
    setAddItemMode(null);
    setNewItemTitle("");
    setNewItemDesc("");
    setAiItemPrompt("");
    setAiItemPreview(null);
  };

  // ─── Publish ────────────────────────────────────────────────

  const publishProtocol = async () => {
    if (sections.length === 0) {
      toast.error("No hay secciones para publicar");
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch("/api/ops/protocols/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installationId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Protocolo publicado (v${json.data.versionNumber})`);
        fetchVersions();
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al publicar protocolo");
    } finally {
      setPublishing(false);
    }
  };

  // ─── Document Upload ────────────────────────────────────────

  const handleDocumentUpload = async (files: FileList) => {
    const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf");
    if (pdfFiles.length === 0) {
      toast.error("Solo se aceptan archivos PDF");
      return;
    }
    setUploading(true);
    try {
      for (const file of pdfFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("installationId", installationId);
        await fetch("/api/ops/protocols/documents", {
          method: "POST",
          body: formData,
        });
      }
      toast.success(`${pdfFiles.length} documento(s) subido(s)`);
    } catch {
      toast.error("Error al subir documentos");
    } finally {
      setUploading(false);
    }
  };

  // ─── Recreate ───────────────────────────────────────────────

  const handleRecreate = () => {
    if (!confirm("¿Eliminar el protocolo actual y crear uno nuevo? Esta acción no se puede deshacer.")) return;
    if (onRecreate) onRecreate();
  };

  // ─── Render ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Cargando protocolo...</span>
      </div>
    );
  }

  const SUB_TABS: Array<{ id: SubTab; label: string; icon: string }> = [
    { id: "secciones", label: "Secciones", icon: "📋" },
    { id: "examenes", label: "Exámenes", icon: "📝" },
    { id: "vista-cliente", label: "Vista Cliente", icon: "👤" },
  ];

  return (
    <div className="space-y-4">
      {/* ─── Info Bar ──────────────────────────────────────────── */}
      <div className="rounded-lg border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Badges */}
          <Badge
            variant={publishedVersion ? "default" : "secondary"}
            className={cn(
              "text-xs",
              publishedVersion
                ? "bg-green-600 hover:bg-green-700"
                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
            )}
          >
            {publishedVersion ? "Publicado" : "Borrador"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {sections.length} secciones
          </Badge>
          <Badge variant="outline" className="text-xs">
            {totalItems} ítems
          </Badge>
          {publishedVersion && (
            <Badge variant="outline" className="text-xs">
              v{publishedVersion.versionNumber}
            </Badge>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={publishProtocol}
              disabled={publishing || sections.length === 0}
            >
              {publishing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <FileDown className="h-3 w-3 mr-1" />
              )}
              {publishedVersion ? "Nueva versión" : "Publicar"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowVersions(!showVersions)}
            >
              <Clock className="h-3 w-3 mr-1" />
              Historial
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={downloadingProtocolPdf || sections.length === 0}
              onClick={async () => {
                try {
                  setDownloadingProtocolPdf(true);
                  const res = await fetch(
                    `/api/ops/protocols/pdf?installationId=${installationId}`,
                  );
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error ?? "Error al generar PDF");
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download =
                    res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
                    "protocolo.pdf";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success("PDF descargado");
                } catch (err: unknown) {
                  toast.error(
                    err instanceof Error ? err.message : "Error al descargar PDF",
                  );
                } finally {
                  setDownloadingProtocolPdf(false);
                }
              }}
            >
              {downloadingProtocolPdf ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <FileDown className="h-3 w-3 mr-1" />
              )}
              PDF
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <FileUp className="h-3 w-3 mr-1" />
              )}
              Subir PDFs
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleDocumentUpload(e.target.files);
                e.target.value = "";
              }}
            />

            {onRecreate && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleRecreate}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Recrear
              </Button>
            )}
          </div>
        </div>

        {/* Version history panel */}
        {showVersions && (
          <div className="mt-3 border-t pt-3">
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Historial de versiones</h4>
            {versions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay versiones publicadas.</p>
            ) : (
              <div className="space-y-1.5">
                {versions.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 text-xs">
                    <Badge
                      variant={v.status === "published" ? "default" : "secondary"}
                      className="text-[10px] px-1.5"
                    >
                      v{v.versionNumber}
                    </Badge>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[10px]",
                      v.status === "published"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
                    )}>
                      {v.status === "published" ? "Publicada" : "Archivada"}
                    </span>
                    <span className="text-muted-foreground">
                      {v.publishedAt
                        ? new Date(v.publishedAt).toLocaleDateString("es-CL", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Sub-tabs ──────────────────────────────────────────── */}
      <div className="flex border-b">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            <span className="text-xs">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Tab Content ───────────────────────────────────────── */}

      {activeTab === "secciones" && (
        <div className="space-y-3">
          {/* AI not configured warning */}
          {aiConfigured === false && (
            <div className="rounded-lg border bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800 p-3 flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <span className="text-xs text-yellow-800 dark:text-yellow-200 flex-1">
                La generación con IA no está disponible. Configura un proveedor de IA para habilitar esta función.
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs shrink-0"
                onClick={() => window.open("/opai/configuracion/inteligencia-artificial", "_blank")}
              >
                <Settings className="h-3 w-3 mr-1" />
                Configurar IA
              </Button>
            </div>
          )}

          {/* Sections accordion */}
          {sections.map((section) => (
            <div key={section.id} className="border rounded-lg overflow-hidden">
              {/* Section header */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
                onClick={() => toggleSection(section.id)}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                {section.icon && <span className="text-sm">{section.icon}</span>}

                {editingSection === section.id ? (
                  <div className="flex gap-2 flex-1" onClick={(e) => e.stopPropagation()}>
                    <Input
                      value={editingSectionTitle}
                      onChange={(e) => setEditingSectionTitle(e.target.value)}
                      className="h-7 text-sm"
                      onKeyDown={(e) => e.key === "Enter" && saveSection(section.id)}
                      autoFocus
                    />
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => saveSection(section.id)}>
                      <Save className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingSection(null)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="text-sm font-medium flex-1 truncate">{section.title}</span>
                    <Badge variant="secondary" className="text-[11px]">
                      {section.items.length} ítems
                    </Badge>
                    <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          setEditingSection(section.id);
                          setEditingSectionTitle(section.title);
                        }}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => deleteSection(section.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {expandedSections.has(section.id) ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </>
                )}
              </div>

              {/* Items */}
              {expandedSections.has(section.id) && (
                <div className="divide-y">
                  {section.items.map((item) => (
                    <div key={item.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      {editingItem === item.id ? (
                        /* Edit item inline */
                        <div className="space-y-2">
                          <Input
                            value={editingItemTitle}
                            onChange={(e) => setEditingItemTitle(e.target.value)}
                            placeholder="Título"
                            className="text-sm"
                            autoFocus
                          />
                          <textarea
                            value={editingItemDesc}
                            onChange={(e) => setEditingItemDesc(e.target.value)}
                            placeholder="Descripción (opcional)"
                            className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] resize-y bg-background"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveItem(section.id, item.id)}>
                              <Save className="h-3 w-3 mr-1" /> Guardar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingItem(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Display item */
                        <div className="flex items-start gap-2 group">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{item.title}</span>
                              {item.source !== "manual" && (
                                <Badge variant="outline" className="text-[10px] shrink-0">
                                  {item.source === "ai_generated"
                                    ? "IA"
                                    : item.source === "ai_from_pdf"
                                      ? "PDF"
                                      : item.source}
                                </Badge>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => {
                                setEditingItem(item.id);
                                setEditingItemTitle(item.title);
                                setEditingItemDesc(item.description ?? "");
                              }}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive"
                              onClick={() => deleteItem(section.id, item.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* ─── Add Item Panel ─────────────────────────── */}
                  {addingItemToSection === section.id ? (
                    <div className="px-4 py-3 bg-muted/20">
                      {/* Mode selector */}
                      {addItemMode === null && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => setAddItemMode("manual")}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Escribir manual
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              if (aiConfigured === false) {
                                toast.error("Configura un proveedor de IA primero");
                                return;
                              }
                              setAddItemMode("ai");
                            }}
                            disabled={aiConfigured === false}
                          >
                            <Sparkles className="h-3 w-3 mr-1" />
                            Generar con IA
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs ml-auto"
                            onClick={resetAddItem}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {/* Manual add form */}
                      {addItemMode === "manual" && (
                        <div className="space-y-2">
                          <Input
                            value={newItemTitle}
                            onChange={(e) => setNewItemTitle(e.target.value)}
                            placeholder="Título del ítem"
                            className="text-sm"
                            autoFocus
                          />
                          <textarea
                            value={newItemDesc}
                            onChange={(e) => setNewItemDesc(e.target.value)}
                            placeholder="Descripción (opcional)"
                            className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] resize-y bg-background"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => addItemManual(section.id)}
                              disabled={savingItem || !newItemTitle.trim()}
                            >
                              {savingItem ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Save className="h-3 w-3 mr-1" />
                              )}
                              Guardar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetAddItem}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* AI generate flow */}
                      {addItemMode === "ai" && !aiItemPreview && (
                        <div className="space-y-2">
                          {aiGeneratingItem ? (
                            <div className="flex items-center justify-center py-6 gap-2">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                              <span className="text-sm text-muted-foreground">
                                Generando ítem con IA…
                              </span>
                            </div>
                          ) : (
                            <>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">
                                  Describe el ítem que necesitas
                                </label>
                                <textarea
                                  value={aiItemPrompt}
                                  onChange={(e) => setAiItemPrompt(e.target.value)}
                                  placeholder="Ej: Procedimiento de verificación de accesos vehiculares nocturnos…"
                                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] resize-y bg-background"
                                  autoFocus
                                />
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => generateAiItem(section.id)}
                                  disabled={!aiItemPrompt.trim()}
                                >
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  Generar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={resetAddItem}>
                                  Cancelar
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* AI preview */}
                      {addItemMode === "ai" && aiItemPreview && (
                        <div className="space-y-2">
                          <div className="rounded-md border bg-primary/5 border-primary/20 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-medium text-primary">
                                Generado con IA — Revisa antes de agregar
                              </span>
                            </div>
                            <Input
                              value={aiItemPreview.title}
                              onChange={(e) =>
                                setAiItemPreview((prev) =>
                                  prev ? { ...prev, title: e.target.value } : null,
                                )
                              }
                              className="text-sm mb-2"
                            />
                            <textarea
                              value={aiItemPreview.description}
                              onChange={(e) =>
                                setAiItemPreview((prev) =>
                                  prev ? { ...prev, description: e.target.value } : null,
                                )
                              }
                              className="w-full border rounded-md px-3 py-2 text-sm min-h-[60px] resize-y bg-background"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAiItemPreview(null);
                                generateAiItem(section.id);
                              }}
                              disabled={aiGeneratingItem}
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Regenerar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveAiItem(section.id)}
                              disabled={savingItem}
                            >
                              {savingItem ? (
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              ) : (
                                <Plus className="h-3 w-3 mr-1" />
                              )}
                              Agregar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={resetAddItem}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Add item button */
                    <div className="px-4 py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => setAddingItemToSection(section.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Agregar ítem
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* ─── Add Section ──────────────────────────────────── */}
          {addSectionMode === null ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setAddSectionMode("manual")}
              >
                <Plus className="h-4 w-4 mr-1" /> Agregar sección
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (aiConfigured === false) {
                    toast.error("Configura un proveedor de IA primero");
                    return;
                  }
                  setAddSectionMode("ai");
                }}
                disabled={aiConfigured === false}
              >
                <Sparkles className="h-4 w-4 mr-1" /> Generar con IA
              </Button>
            </div>
          ) : addSectionMode === "manual" ? (
            /* Manual section form */
            <div className="border rounded-lg p-3 space-y-2 bg-muted/20">
              <div className="flex gap-2">
                <Input
                  placeholder="Emoji (opcional)"
                  value={newSectionIcon}
                  onChange={(e) => setNewSectionIcon(e.target.value)}
                  className="w-20 text-center"
                />
                <Input
                  placeholder="Nombre de la sección..."
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addSectionManual()}
                  className="flex-1"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={addSectionManual} disabled={!newSectionTitle.trim()}>
                  <Save className="h-3 w-3 mr-1" /> Crear
                </Button>
                <Button size="sm" variant="ghost" onClick={resetAddSection}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            /* AI section generation */
            <div className="border rounded-lg p-3 bg-muted/20">
              {aiGeneratingSection ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Generando sección con IA…
                  </span>
                </div>
              ) : aiSectionPreview ? (
                /* AI section preview */
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium text-primary">
                      Sección generada — Revisa antes de guardar
                    </span>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{aiSectionPreview.icon}</span>
                      <span className="text-sm font-semibold">{aiSectionPreview.title}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {aiSectionPreview.items.length} ítems
                      </Badge>
                    </div>
                    <div className="space-y-1.5 pl-6">
                      {aiSectionPreview.items.map((item, i) => (
                        <div key={i} className="text-xs">
                          <span className="font-medium">{item.title}</span>
                          {item.description && (
                            <span className="text-muted-foreground ml-1">— {item.description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAiSectionPreview(null);
                        generateAiSection();
                      }}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Regenerar
                    </Button>
                    <Button size="sm" onClick={saveAiSection} disabled={savingItem}>
                      {savingItem ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1" />
                      )}
                      Agregar sección
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetAddSection}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                /* AI section prompt */
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Describe la sección que necesitas
                    </label>
                    <textarea
                      value={aiSectionPrompt}
                      onChange={(e) => setAiSectionPrompt(e.target.value)}
                      placeholder="Ej: Protocolo para control de acceso vehicular con verificación de patentes y registro de visitas…"
                      className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] resize-y bg-background"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={generateAiSection}
                      disabled={!aiSectionPrompt.trim()}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Generar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={resetAddSection}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "examenes" && (
        <ExamSubTab installationId={installationId} />
      )}

      {activeTab === "vista-cliente" && (
        <ClientReportView installationId={installationId} />
      )}
    </div>
  );
}
