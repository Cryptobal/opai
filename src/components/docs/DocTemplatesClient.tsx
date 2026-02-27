"use client";

/**
 * DocTemplatesClient — Refactored
 *
 * Desktop: Grid 3-4 cols with compact cards (no description visible by default)
 * Mobile: Compact vertical list (~64px per template) with sticky category headers
 * Categorías como labels discretos
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LayoutTemplate,
  Plus,
  Search,
  FileText,
  MoreHorizontal,
  Trash2,
  Pencil,
  Copy,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DOC_CATEGORIES, WA_USAGE_SLUGS } from "@/lib/docs/token-registry";
import type { DocTemplate } from "@/types/docs";
import { EmptyState } from "@/components/opai";
import { useCanDelete } from "@/lib/permissions-context";

function getCategoryLabel(module: string, category: string): string {
  const cats = DOC_CATEGORIES[module];
  if (!cats) return category;
  return cats.find((c) => c.key === category)?.label || category;
}

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM",
  payroll: "Payroll",
  legal: "Legal",
  mail: "Mail",
  whatsapp: "WhatsApp",
};

export function DocTemplatesClient() {
  return (
    <Suspense fallback={null}>
      <DocTemplatesInner />
    </Suspense>
  );
}

function DocTemplatesInner() {
  const router = useRouter();
  const canDeleteTemplate = useCanDelete("docs", "gestion");
  const searchParams = useSearchParams();
  const moduleFromUrl = searchParams.get("module");
  const [templates, setTemplates] = useState<DocTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/docs/templates", { cache: "no-store" });
      const data = await res.json();
      if (data.success) setTemplates(data.data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filtered = (search
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.module.toLowerCase().includes(search.toLowerCase())
      )
    : templates
  ).filter((t) => !moduleFromUrl || t.module === moduleFromUrl);

  const deleteTemplate = async (id: string) => {
    if (!canDeleteTemplate) return;
    if (!confirm("¿Desactivar este template?")) return;
    try {
      await fetch(`/api/docs/templates/${id}`, { method: "DELETE" });
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  // Group by module
  const grouped = filtered.reduce(
    (acc, t) => {
      if (!acc[t.module]) acc[t.module] = [];
      acc[t.module].push(t);
      return acc;
    },
    {} as Record<string, DocTemplate[]>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        <div className="flex-1" />

        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/opai/documentos/templates/nuevo")}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo Template
        </Button>
      </div>

      {/* Templates */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate className="h-10 w-10" />}
          title="No hay templates de documentos"
          description="Crea tu primer template para empezar a generar documentos"
          action={
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => router.push("/opai/documentos/templates/nuevo")}
            >
              <Plus className="h-3.5 w-3.5" />
              Crear Template
            </Button>
          }
        />
      ) : (
        Object.entries(grouped).map(([module, temps]) => (
          <div key={module}>
            {/* Section label — discrete */}
            <div className="flex items-center gap-2 mb-2 sticky top-0 z-10 bg-background/80 backdrop-blur-sm py-1 -mx-1 px-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {MODULE_LABELS[module] || module}
              </span>
              <div className="flex-1 h-px bg-border" />
              <span className="text-[11px] text-muted-foreground/50">{temps.length}</span>
            </div>

            {/* Desktop: grid 3-4 cols */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 mb-4">
              {temps.map((template) => (
                <div
                  key={template.id}
                  className="group relative flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/30 hover:bg-accent/30 transition-all cursor-pointer"
                  onClick={() => router.push(`/opai/documentos/templates/${template.id}`)}
                >
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold truncate">
                        {template.name}
                      </span>
                      {template.isDefault && (
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                      {template.module === "whatsapp" && template.usageSlug && WA_USAGE_SLUGS[template.usageSlug] ? (
                        <span className="truncate italic">{WA_USAGE_SLUGS[template.usageSlug].usedIn}</span>
                      ) : (
                        <span className="truncate">{getCategoryLabel(template.module, template.category)}</span>
                      )}
                      <span className="text-muted-foreground/30">·</span>
                      <span className="shrink-0">{template._count?.documents || 0} docs</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="shrink-0 font-mono">v{template._count?.versions || 1}</span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-accent text-muted-foreground transition-all shrink-0"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/opai/documentos/templates/${template.id}`); }}>
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); router.push(`/opai/documentos/nuevo?templateId=${template.id}`); }}>
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Generar Documento
                      </DropdownMenuItem>
                      {canDeleteTemplate && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Desactivar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>

            {/* Mobile: compact list */}
            <div className="md:hidden space-y-1 mb-4">
              {temps.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-card active:scale-[0.98] transition-transform cursor-pointer"
                  onClick={() => router.push(`/opai/documentos/templates/${template.id}`)}
                >
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold truncate">{template.name}</span>
                      {template.isDefault && (
                        <Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground/50 font-mono shrink-0">
                        v{template._count?.versions || 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="truncate">
                        {template.module === "whatsapp" && template.usageSlug && WA_USAGE_SLUGS[template.usageSlug]
                          ? WA_USAGE_SLUGS[template.usageSlug].usedIn
                          : getCategoryLabel(template.module, template.category)}
                      </span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="shrink-0">{template._count?.documents || 0} docs</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
