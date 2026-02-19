"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContractEditor } from "./ContractEditor";
import { DOC_CATEGORIES, DOC_MODULES, WA_USAGE_SLUGS } from "@/lib/docs/token-registry";
import { toast } from "sonner";

interface DocTemplateEditorClientProps {
  templateId?: string; // null = creating new
}

export function DocTemplateEditorClient({
  templateId,
}: DocTemplateEditorClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(!!templateId);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [module, setModule] = useState("crm");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState<any>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [usageSlug, setUsageSlug] = useState<string>("");
  const [categoriesFromApi, setCategoriesFromApi] = useState<{ key: string; label: string }[]>([]);

  const categories =
    categoriesFromApi.length > 0 ? categoriesFromApi : (DOC_CATEGORIES[module] || []);

  const filterModules = useMemo(
    () =>
      module === "crm"
        ? ["account", "contact", "installation", "deal", "quote", "system", "signature"]
        : module === "payroll"
        ? ["empresa", "guardia", "labor_event", "system", "signature"]
        : module === "mail" || module === "whatsapp"
        ? ["account", "contact", "deal", "system", "signature"]
        : ["account", "contact", "system", "signature"],
    [module]
  );

  // Fetch template if editing
  const fetchTemplate = useCallback(async () => {
    if (!templateId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/docs/templates/${templateId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setName(data.data.name);
        setDescription(data.data.description || "");
        setModule(data.data.module);
        setCategory(data.data.category);
        setContent(data.data.content);
        setIsDefault(data.data.isDefault);
        setUsageSlug(data.data.usageSlug ?? "");
      }
    } catch (error) {
      console.error("Error fetching template:", error);
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/docs/categories?module=${encodeURIComponent(module)}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !data.success || !Array.isArray(data.data)) return;
        setCategoriesFromApi(
          data.data.map((c: { key: string; label: string }) => ({ key: c.key, label: c.label }))
        );
      } catch {
        setCategoriesFromApi([]);
      }
    })();
    return () => { cancelled = true; };
  }, [module]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (module !== "whatsapp" && !category) {
      toast.error("Selecciona una categoría");
      return;
    }
    if (!content) {
      toast.error("El documento no puede estar vacío");
      return;
    }

    setSaving(true);
    try {
      const url = templateId
        ? `/api/docs/templates/${templateId}`
        : "/api/docs/templates";
      const method = templateId ? "PATCH" : "POST";

      // Para WhatsApp la categoría se asigna automáticamente
      const finalCategory = module === "whatsapp"
        ? (usageSlug || "general")
        : category;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          module,
          category: finalCategory,
          content,
          isDefault,
          usageSlug: module === "whatsapp" ? (usageSlug || null) : undefined,
          ...(templateId ? { changeNote: "Actualización desde editor" } : {}),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al guardar");
        return;
      }

      toast.success(templateId ? "Template actualizado" : "Template creado");

      if (!templateId && data.data?.id) {
        router.push(`/opai/documentos/templates/${data.data.id}`);
      }
    } catch (error) {
      console.error("Error saving template:", error);
      toast.error("Error al guardar template");
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/opai/documentos/templates")}
        >
          <ArrowLeft className="h-4 w-4" />
          Templates
        </Button>
        <div className="flex-1" />
        <Button
          size="sm"
          className="gap-1.5"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {templateId ? "Guardar Cambios" : "Crear Template"}
        </Button>
      </div>

      {/* Meta fields */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-xl border border-border bg-card">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Nombre del Template *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Contrato de Servicios de Seguridad"
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Módulo *
          </label>
          <select
            value={module}
            onChange={(e) => {
              const next = e.target.value;
              setModule(next);
              setCategory("");
              if (next !== "whatsapp") setUsageSlug("");
            }}
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {DOC_MODULES.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        {module !== "whatsapp" && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Categoría *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Seleccionar...</option>
              {categories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Descripción
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Breve descripción..."
            className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        {module === "whatsapp" && (
          <div className="col-span-full">
            <label className="text-xs font-medium text-muted-foreground">
              Uso en el sistema
            </label>
            <select
              value={usageSlug}
              onChange={(e) => setUsageSlug(e.target.value)}
              className="mt-1 w-full px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Plantilla personalizada (elegir desde CRM)</option>
              {Object.entries(WA_USAGE_SLUGS).map(([slug, { label, usedIn }]) => (
                <option key={slug} value={slug} title={usedIn}>
                  {label} — {usedIn}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Si asignas un uso, esta plantilla se usará automáticamente en ese flujo. Vacío = solo para elegir al enviar WhatsApp desde contacto/negocio.
            </p>
          </div>
        )}
      </div>

      {/* Default toggle */}
      <label className="flex items-center gap-2 px-4">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
        />
        <span className="text-xs text-muted-foreground">
          Template por defecto para esta categoría
        </span>
      </label>

      {/* Editor */}
      <ContractEditor
        content={content}
        onChange={setContent}
        filterModules={filterModules}
        placeholder="Escribe el contenido del template aquí... Usa el botón 'Insertar Token' para agregar placeholders dinámicos"
      />
    </div>
  );
}
