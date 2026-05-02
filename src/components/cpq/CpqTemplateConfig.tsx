"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileText, Pencil, Plus, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ProposalTemplateSections } from "@/types/cpq";

interface Template {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sections: ProposalTemplateSections;
  isDefault: boolean;
  active: boolean;
}

const SYSTEM_SLUGS = ["standard", "detailed", "tender"];

const SECTION_LABELS: Record<keyof ProposalTemplateSections, string> = {
  showCoverPage: "Portada",
  showCompanyIntro: "Introducción de empresa",
  showPositionsTable: "Tabla de puestos",
  showCostBreakdown: "Desglose de costos",
  showCostSummaryByCategory: "Resumen por categoría",
  showLaborDetail: "Detalle mano de obra",
  showEquipmentDetail: "Detalle equipamiento",
  showVehicleDetail: "Detalle vehículos",
  showAdditionalServices: "Servicios adicionales",
  showConditions: "Condiciones comerciales",
  showIncludedItems: "Ítems incluidos",
  showSignature: "Área de firma",
  showComplianceSection: "Cumplimiento normativo",
  showTechnicalSpecs: "Especificaciones técnicas",
  numberedSections: "Secciones numeradas",
  headerStyle: "Estilo de encabezado",
};

const TOGGLE_KEYS: (keyof ProposalTemplateSections)[] = [
  "showCoverPage",
  "showCompanyIntro",
  "showPositionsTable",
  "showCostBreakdown",
  "showCostSummaryByCategory",
  "showLaborDetail",
  "showEquipmentDetail",
  "showVehicleDetail",
  "showAdditionalServices",
  "showConditions",
  "showIncludedItems",
  "showSignature",
  "showComplianceSection",
  "showTechnicalSpecs",
  "numberedSections",
];

const HEADER_STYLE_OPTIONS = [
  { value: "standard", label: "Estándar" },
  { value: "detailed", label: "Detallado" },
  { value: "formal", label: "Formal (Licitación)" },
];

export function CpqTemplateConfig() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    sections: ProposalTemplateSections;
    isDefault: boolean;
  }>({ name: "", description: "", sections: {} as ProposalTemplateSections, isDefault: false });

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cpq/proposal-templates", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setTemplates(data.data ?? []);
    } catch {
      toast.error("Error al cargar templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openEdit = (t: Template) => {
    setEditTemplate(t);
    setEditForm({
      name: t.name,
      description: t.description ?? "",
      sections: { ...t.sections },
      isDefault: t.isDefault,
    });
  };

  const handleSave = async () => {
    if (!editTemplate) return;
    setSaving(true);
    try {
      const isSystemDefault = editTemplate.id.startsWith("__default_");
      if (isSystemDefault) {
        const res = await fetch("/api/cpq/proposal-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name,
            slug: editTemplate.slug,
            description: editForm.description || null,
            sections: editForm.sections,
            isDefault: editForm.isDefault,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success("Template guardado");
      } else {
        const res = await fetch(`/api/cpq/proposal-templates/${editTemplate.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editForm.name,
            description: editForm.description || null,
            sections: editForm.sections,
            isDefault: editForm.isDefault,
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
        toast.success("Template actualizado");
      }
      setEditTemplate(null);
      fetchTemplates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (t: Template) => {
    try {
      const res = await fetch("/api/cpq/proposal-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${t.name} (copia)`,
          slug: `${t.slug}-copy-${Date.now()}`,
          description: t.description,
          sections: t.sections,
          isDefault: false,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Template duplicado");
      fetchTemplates();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al duplicar";
      toast.error(msg);
    }
  };

  const handleToggleActive = async (t: Template) => {
    if (t.id.startsWith("__default_")) return;
    try {
      const res = await fetch(`/api/cpq/proposal-templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !t.active }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success(t.active ? "Template desactivado" : "Template activado");
      fetchTemplates();
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Templates de Propuesta</h2>
          <p className="text-xs text-muted-foreground">
            Define qué secciones se incluyen en cada tipo de propuesta comercial.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => {
            const base = templates[0];
            if (base) handleDuplicate(base);
          }}
          disabled={!templates.length}
        >
          <Plus className="h-3.5 w-3.5" />
          Crear template
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando templates...
        </div>
      )}

      <div className="grid gap-2">
        {templates.map((t) => {
          const isSystem = SYSTEM_SLUGS.includes(t.slug) || t.id.startsWith("__default_");
          return (
            <Card
              key={t.id}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3 border-border/40 bg-card/50",
                !t.active && "opacity-50",
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate">{t.name}</span>
                    {t.isDefault && (
                      <span className="shrink-0 rounded bg-status-ok-soft px-1.5 py-0.5 text-xs font-medium text-status-ok-fg">
                        Default
                      </span>
                    )}
                    {isSystem && (
                      <span className="shrink-0 rounded bg-status-info-soft px-1.5 py-0.5 text-xs font-medium text-status-info-fg">
                        Sistema
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{t.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(t)} title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDuplicate(t)} title="Duplicar">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                {!isSystem && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn("h-8 text-xs px-2", t.active ? "text-status-danger-fg hover:text-status-danger-fg" : "text-status-ok-fg hover:text-status-ok-fg")}
                    onClick={() => handleToggleActive(t)}
                  >
                    {t.active ? "Desactivar" : "Activar"}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editTemplate} onOpenChange={(o) => !o && setEditTemplate(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar template: {editTemplate?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Nombre</label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Descripción</label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Estilo de encabezado</label>
              <select
                className="flex h-9 w-full rounded-md border border-border bg-card px-3 text-sm"
                value={editForm.sections.headerStyle ?? "standard"}
                onChange={(e) =>
                  setEditForm((p) => ({
                    ...p,
                    sections: { ...p.sections, headerStyle: e.target.value as "standard" | "detailed" | "formal" },
                  }))
                }
              >
                {HEADER_STYLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Secciones incluidas</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {TOGGLE_KEYS.map((key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 rounded-md border border-border/40 px-3 py-2 cursor-pointer hover:bg-accent/30 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={!!editForm.sections[key]}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          sections: { ...p.sections, [key]: e.target.checked },
                        }))
                      }
                      className="rounded"
                    />
                    <span className="text-xs">{SECTION_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editForm.isDefault}
                onChange={(e) => setEditForm((p) => ({ ...p, isDefault: e.target.checked }))}
                className="rounded"
              />
              <span className="text-xs">Template por defecto</span>
            </label>

            {/* Preview */}
            <div className="rounded-md border border-border/40 bg-muted/30 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Preview de secciones
              </p>
              <div className="flex flex-wrap gap-1">
                {TOGGLE_KEYS.filter((k) => editForm.sections[k]).map((k) => (
                  <span
                    key={k}
                    className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary font-medium"
                  >
                    {SECTION_LABELS[k]}
                  </span>
                ))}
                <span className="inline-flex rounded-full bg-status-info-soft px-2 py-0.5 text-xs text-status-info-fg font-medium">
                  Encabezado: {HEADER_STYLE_OPTIONS.find((o) => o.value === editForm.sections.headerStyle)?.label ?? "Estándar"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTemplate(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
