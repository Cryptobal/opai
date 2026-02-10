"use client";

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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DOC_CATEGORIES, WA_USAGE_SLUGS } from "@/lib/docs/token-registry";
import type { DocTemplate } from "@/types/docs";

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-xl border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-muted/20">
          <LayoutTemplate className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No hay templates de documentos
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Crea tu primer template para empezar a generar documentos
          </p>
          <Button
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => router.push("/opai/documentos/templates/nuevo")}
          >
            <Plus className="h-3.5 w-3.5" />
            Crear Template
          </Button>
        </div>
      ) : (
        Object.entries(grouped).map(([module, temps]) => (
          <div key={module}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">
              {MODULE_LABELS[module] || module}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {temps.map((template) => (
                <div
                  key={template.id}
                  className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() =>
                    router.push(`/opai/documentos/templates/${template.id}`)
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold truncate">
                          {template.name}
                        </p>
                        {template.isDefault && (
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                        )}
                      </div>
                      {template.module === "whatsapp" ? (
                        template.usageSlug && WA_USAGE_SLUGS[template.usageSlug] ? (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">
                            {WA_USAGE_SLUGS[template.usageSlug].usedIn}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Plantilla personalizada
                          </p>
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {getCategoryLabel(template.module, template.category)}
                        </p>
                      )}
                    </div>
                  </div>

                  {template.description && (
                    <p className="text-xs text-muted-foreground mt-3 line-clamp-2">
                      {template.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground/70">
                    <span>
                      {template._count?.documents || 0} documentos
                    </span>
                    <span>
                      v{template._count?.versions || 1}
                    </span>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-3 right-3 h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(
                            `/opai/documentos/templates/${template.id}`
                          );
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(
                            `/opai/documentos/nuevo?templateId=${template.id}`
                          );
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-2" />
                        Generar Documento
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTemplate(template.id);
                        }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Desactivar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
