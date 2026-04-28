"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  ProtocolWizardEmpty,
  ProtocolWizardAi,
  ProtocolWizardPdf,
  ProtocolHeaderBar,
  ProtocolSectionCard,
  ProtocolAddSection,
  ProtocolDeleteDialog,
  type ProtocolData,
  type ProtocolSection,
  type WizardMode,
  type DeleteDialogState,
} from "./sections";

type AddItemMode = "manual" | "ai" | null;
type AddSectionMode = "manual" | "ai" | null;

export function ProtocolSectionsSubTab({
  installationId,
}: {
  installationId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [protocol, setProtocol] = useState<ProtocolData | null>(null);
  const [wizardMode, setWizardMode] = useState<WizardMode>(null);
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);

  /* Wizard IA */
  const [aiInstallationType, setAiInstallationType] = useState("");
  const [aiContext, setAiContext] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ProtocolSection[] | null>(null);

  /* Wizard PDF */
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfResult, setPdfResult] = useState<ProtocolSection[] | null>(null);

  /* Acordeón */
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  /* Edición */
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemDesc, setEditItemDesc] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState("");
  const [editSectionIcon, setEditSectionIcon] = useState("");

  /* Diálogo borrar */
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(
    null,
  );

  /* Agregar ítem */
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

  /* Agregar sección */
  const [addingSectionMode, setAddingSectionMode] =
    useState<AddSectionMode>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionIcon, setNewSectionIcon] = useState("📋");
  const [aiSectionDesc, setAiSectionDesc] = useState("");
  const [aiSectionGenerating, setAiSectionGenerating] = useState(false);
  const [aiSectionResult, setAiSectionResult] =
    useState<ProtocolSection | null>(null);

  /* Publicar */
  const [publishing, setPublishing] = useState(false);

  const base = `/api/installations/${installationId}/protocol`;

  /* ─── Fetch ─── */

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
      const res = await fetch("/api/tenant/ai-providers");
      const json = await res.json();
      const providers = json.data ?? json.providers ?? [];
      const active = providers.some(
        (p: { isActive?: boolean; hasApiKey?: boolean }) =>
          p.isActive && p.hasApiKey,
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

  const hasSections = !loading && protocol && protocol.sections.length > 0;

  /* ─── Wizard: IA ─── */

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

  /* ─── Wizard: PDF ─── */

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

  /* ─── CRUD secciones ─── */

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

  const handleTogglePortalVisible = async (
    sectionId: string,
    currentValue: boolean,
  ) => {
    try {
      const res = await fetch(`${base}/sections/${sectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalVisible: !currentValue }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message);
      toast.success(
        !currentValue ? "Sección visible en portal" : "Sección oculta del portal",
      );
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

  /* ─── CRUD ítems ─── */

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
        body: JSON.stringify({ sectionTitle, description: aiItemDesc }),
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
        },
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
        { method: "DELETE" },
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

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Wizard inicial */
  if (!hasSections && !wizardMode) {
    return (
      <ProtocolWizardEmpty
        aiAvailable={aiAvailable}
        onChoose={(c) => {
          if (c === "manual") {
            setWizardMode("manual");
            setProtocol({
              sections: [],
              stats: { sectionCount: 0, itemCount: 0 },
            });
          } else {
            setWizardMode(c);
          }
        }}
      />
    );
  }

  if (wizardMode === "ai" && !hasSections) {
    return (
      <ProtocolWizardAi
        aiAvailable={aiAvailable}
        generating={aiGenerating}
        error={aiError}
        result={aiResult}
        installationType={aiInstallationType}
        setInstallationType={setAiInstallationType}
        context={aiContext}
        setContext={setAiContext}
        onBack={() => {
          setWizardMode(null);
          setAiInstallationType("");
          setAiContext("");
          setAiError(null);
        }}
        onGenerate={() => void handleAiGenerate()}
        onRegenerate={() => {
          setAiResult(null);
          void handleAiGenerate();
        }}
        onSave={(sections) => void handleSaveGenerated(sections)}
      />
    );
  }

  if (wizardMode === "pdf" && !hasSections) {
    return (
      <ProtocolWizardPdf
        aiAvailable={aiAvailable}
        extracting={pdfExtracting}
        error={aiError}
        result={pdfResult}
        files={pdfFiles}
        setFiles={setPdfFiles}
        onBack={() => {
          setWizardMode(null);
          setPdfFiles([]);
          setAiError(null);
        }}
        onExtract={() => void handlePdfExtract()}
        onClearResult={() => setPdfResult(null)}
        onSave={(sections) => void handleSaveGenerated(sections)}
      />
    );
  }

  /* Vista principal con secciones */
  const sections = protocol?.sections ?? [];

  return (
    <div className="space-y-3">
      {hasSections && protocol && (
        <ProtocolHeaderBar
          protocol={protocol}
          publishing={publishing}
          onPublish={() => void handlePublish()}
          onRecreate={() => {
            setProtocol({
              sections: [],
              stats: { sectionCount: 0, itemCount: 0 },
            });
            setWizardMode(null);
          }}
        />
      )}

      <div className="space-y-2.5">
        {sections.map((section) => (
          <ProtocolSectionCard
            key={section.id}
            section={section}
            expanded={expandedSections.has(section.id)}
            onToggle={() => toggleSection(section.id)}
            isEditingSection={editingSection === section.id}
            editSectionTitle={editSectionTitle}
            editSectionIcon={editSectionIcon}
            setEditSectionTitle={setEditSectionTitle}
            setEditSectionIcon={setEditSectionIcon}
            onStartEditSection={() => {
              setEditingSection(section.id);
              setEditSectionTitle(section.title);
              setEditSectionIcon(section.icon);
            }}
            onCancelEditSection={() => setEditingSection(null)}
            onSaveEditSection={() => void handleUpdateSection(section.id)}
            onTogglePortalVisible={() =>
              void handleTogglePortalVisible(
                section.id,
                section.portalVisible !== false,
              )
            }
            onDeleteSection={() =>
              setDeleteDialog({
                open: true,
                type: "section",
                sectionId: section.id,
                label: section.title,
              })
            }
            editingItemId={editingItem}
            editItemTitle={editItemTitle}
            editItemDesc={editItemDesc}
            setEditItemTitle={setEditItemTitle}
            setEditItemDesc={setEditItemDesc}
            onStartEditItem={(itemId, title, desc) => {
              setEditingItem(itemId);
              setEditItemTitle(title);
              setEditItemDesc(desc);
            }}
            onCancelEditItem={() => setEditingItem(null)}
            onSaveEditItem={(itemId) =>
              void handleUpdateItem(section.id, itemId)
            }
            onDeleteItem={(itemId, label) =>
              setDeleteDialog({
                open: true,
                type: "item",
                sectionId: section.id,
                itemId,
                label,
              })
            }
            addingItem={addingItemTo === section.id}
            addItemMode={addItemMode}
            onStartAddItem={(mode) => {
              setAddingItemTo(section.id);
              setAddItemMode(mode);
              if (mode === "manual") {
                setNewItemTitle("");
                setNewItemDesc("");
              } else {
                setAiItemDesc("");
                setAiItemResult(null);
              }
            }}
            onCancelAddItem={() => {
              setAddItemMode(null);
              setAddingItemTo(null);
              setNewItemTitle("");
              setNewItemDesc("");
              setAiItemDesc("");
              setAiItemResult(null);
            }}
            newItemTitle={newItemTitle}
            newItemDesc={newItemDesc}
            setNewItemTitle={setNewItemTitle}
            setNewItemDesc={setNewItemDesc}
            onSubmitItemManual={() => void handleCreateItem(section.id)}
            aiAvailable={aiAvailable}
            aiItemDesc={aiItemDesc}
            setAiItemDesc={setAiItemDesc}
            aiItemGenerating={aiItemGenerating}
            aiItemResult={aiItemResult}
            onAiItemGenerate={() => void handleAiGenerateItem(section.title)}
            onAiItemRegenerate={() => {
              setAiItemResult(null);
              void handleAiGenerateItem(section.title);
            }}
            onAiItemSave={() => void handleSaveAiItem(section.id)}
          />
        ))}
      </div>

      <ProtocolAddSection
        mode={addingSectionMode}
        onSetMode={(m) => {
          setAddingSectionMode(m);
          if (m === "manual") {
            setNewSectionTitle("");
            setNewSectionIcon("📋");
          } else if (m === "ai") {
            setAiSectionDesc("");
            setAiSectionResult(null);
          }
        }}
        newSectionTitle={newSectionTitle}
        newSectionIcon={newSectionIcon}
        setNewSectionTitle={setNewSectionTitle}
        setNewSectionIcon={setNewSectionIcon}
        onCreate={() => void handleCreateSection()}
        aiAvailable={aiAvailable}
        aiSectionDesc={aiSectionDesc}
        setAiSectionDesc={setAiSectionDesc}
        aiSectionGenerating={aiSectionGenerating}
        aiSectionResult={aiSectionResult}
        onAiGenerate={() => void handleAiGenerateSection()}
        onAiRegenerate={() => {
          setAiSectionResult(null);
          void handleAiGenerateSection();
        }}
        onAiSave={() => void handleSaveAiSection()}
      />

      <ProtocolDeleteDialog
        state={deleteDialog}
        onOpenChange={(open) => {
          if (!open) setDeleteDialog(null);
        }}
        onConfirm={() => {
          if (!deleteDialog) return;
          if (deleteDialog.type === "section") {
            void handleDeleteSection(deleteDialog.sectionId);
          } else if (deleteDialog.itemId) {
            void handleDeleteItem(
              deleteDialog.sectionId,
              deleteDialog.itemId,
            );
          }
          setDeleteDialog(null);
        }}
      />
    </div>
  );
}
