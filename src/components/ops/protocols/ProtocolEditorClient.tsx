"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

interface ProtocolEditorProps {
  installationId: string;
  installationName: string;
}

// ─── Component ───────────────────────────────────────────────

export function ProtocolEditorClient({
  installationId,
  installationName,
}: ProtocolEditorProps) {
  const [sections, setSections] = useState<ProtocolSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Editing states
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editingItemTitle, setEditingItemTitle] = useState("");
  const [editingItemDesc, setEditingItemDesc] = useState("");

  // Adding states
  const [addingItemToSection, setAddingItemToSection] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [addingSectionTitle, setAddingSectionTitle] = useState("");
  const [showAddSection, setShowAddSection] = useState(false);

  // AI states
  const [aiGeneratingItem, setAiGeneratingItem] = useState<string | null>(null);
  const [aiItemPrompt, setAiItemPrompt] = useState("");

  const fetchProtocol = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/ops/protocols?installationId=${installationId}`);
      const json = await res.json();
      if (json.success) {
        setSections(json.data);
        // Expand all sections by default
        setExpandedSections(new Set(json.data.map((s: ProtocolSection) => s.id)));
      }
    } catch {
      toast.error("Error al cargar protocolo");
    } finally {
      setLoading(false);
    }
  }, [installationId]);

  useEffect(() => {
    fetchProtocol();
  }, [fetchProtocol]);

  // ─── Section operations ────────────────────────────────────

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

  const addSection = async () => {
    if (!addingSectionTitle.trim()) return;
    try {
      const res = await fetch("/api/ops/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installationId,
          title: addingSectionTitle,
          order: sections.length,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSections((prev) => [...prev, { ...json.data, items: [] }]);
        setExpandedSections((prev) => new Set([...prev, json.data.id]));
        setAddingSectionTitle("");
        setShowAddSection(false);
        toast.success("Sección creada");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al crear sección");
    }
  };

  // ─── Item operations ───────────────────────────────────────

  const saveItem = async (sectionId: string, itemId: string) => {
    try {
      const res = await fetch(
        `/api/ops/protocols/${sectionId}/sections/${sectionId}/items/${itemId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: editingItemTitle,
            description: editingItemDesc,
          }),
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

  const addItem = async (sectionId: string) => {
    if (!newItemTitle.trim()) return;
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
        setNewItemTitle("");
        setNewItemDesc("");
        setAddingItemToSection(null);
        toast.success("Ítem creado");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al crear ítem");
    }
  };

  // ─── AI item generation ────────────────────────────────────

  const generateAiItem = async (sectionId: string) => {
    if (!aiItemPrompt.trim()) return;
    setAiGeneratingItem(sectionId);
    try {
      const res = await fetch("/api/ops/protocols/ai-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, description: aiItemPrompt }),
      });
      const json = await res.json();
      if (json.success) {
        // Pre-fill the add form with AI result
        setNewItemTitle(json.data.title);
        setNewItemDesc(json.data.description);
        setAddingItemToSection(sectionId);
        setAiItemPrompt("");
        toast.success("Ítem generado con IA — revisa y confirma");
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al generar ítem con IA");
    } finally {
      setAiGeneratingItem(null);
    }
  };

  // ─── Publish ───────────────────────────────────────────────

  const [publishing, setPublishing] = useState(false);

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
      } else {
        toast.error(json.error);
      }
    } catch {
      toast.error("Error al publicar protocolo");
    } finally {
      setPublishing(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Cargando protocolo...</span>
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-muted-foreground text-sm">
          No hay protocolo definido para esta instalación.
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" onClick={() => setShowAddSection(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Crear manualmente
          </Button>
        </div>
        {showAddSection && (
          <div className="max-w-md mx-auto flex gap-2 mt-4">
            <Input
              placeholder="Nombre de la sección..."
              value={addingSectionTitle}
              onChange={(e) => setAddingSectionTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSection()}
              autoFocus
            />
            <Button onClick={addSection} size="sm">
              <Save className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowAddSection(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Protocolo de {installationName}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={publishProtocol} disabled={publishing}>
            {publishing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Publicar versión
          </Button>
        </div>
      </div>

      {/* Sections */}
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
                    <div className="flex items-start gap-2 group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{item.title}</span>
                          {item.source !== "manual" && (
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {item.source === "ai_generated" ? "IA" : item.source === "ai_from_pdf" ? "PDF" : item.source}
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

              {/* Add item form */}
              {addingItemToSection === section.id ? (
                <div className="px-4 py-3 space-y-2 bg-muted/20">
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
                    <Button size="sm" onClick={() => addItem(section.id)}>
                      <Save className="h-3 w-3 mr-1" /> Guardar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAddingItemToSection(null);
                        setNewItemTitle("");
                        setNewItemDesc("");
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-2 flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setAddingItemToSection(section.id)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Agregar ítem
                  </Button>

                  {/* AI generate item */}
                  {aiGeneratingItem === section.id ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Generando...
                    </div>
                  ) : (
                    <div className="flex gap-1 flex-1">
                      <Input
                        placeholder="Describir ítem para IA..."
                        value={section.id === aiGeneratingItem ? "" : aiItemPrompt}
                        onChange={(e) => setAiItemPrompt(e.target.value)}
                        className="h-7 text-xs flex-1"
                        onFocus={() => setAiItemPrompt("")}
                        onKeyDown={(e) => e.key === "Enter" && generateAiItem(section.id)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => generateAiItem(section.id)}
                        disabled={!aiItemPrompt.trim()}
                      >
                        <Sparkles className="h-3 w-3 mr-1" /> IA
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add section */}
      {showAddSection ? (
        <div className="flex gap-2">
          <Input
            placeholder="Nombre de la nueva sección..."
            value={addingSectionTitle}
            onChange={(e) => setAddingSectionTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSection()}
            autoFocus
          />
          <Button onClick={addSection} size="sm">
            <Save className="h-4 w-4 mr-1" /> Crear
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAddSection(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setShowAddSection(true)}>
          <Plus className="h-4 w-4 mr-1" /> Agregar sección
        </Button>
      )}
    </div>
  );
}
