"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Plus,
  Search,
  Filter,
  FileEdit,
  Eye,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Building2,
  Calendar,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { DOC_STATUS_CONFIG, DOC_CATEGORIES } from "@/lib/docs/token-registry";
import type { DocDocument } from "@/types/docs";
import { useCanDelete } from "@/lib/permissions-context";

const STATUS_ICONS: Record<string, React.ComponentType<any>> = {
  draft: FileEdit,
  review: Eye,
  approved: CheckCircle,
  active: CheckCircle2,
  expiring: AlertTriangle,
  expired: XCircle,
  renewed: RefreshCw,
};

function StatusBadge({ status }: { status: string }) {
  const config = DOC_STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  const Icon = STATUS_ICONS[status] || FileText;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

function getCategoryLabel(module: string, category: string): string {
  const cats = DOC_CATEGORIES[module];
  if (!cats) return category;
  const cat = cats.find((c) => c.key === category);
  return cat?.label || category;
}

export function DocsClient() {
  const router = useRouter();
  const canDeleteDocument = useCanDelete("docs", "gestion");
  const [documents, setDocuments] = useState<DocDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterModule, setFilterModule] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterModule) params.set("module", filterModule);
      if (filterStatus) params.set("status", filterStatus);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/docs/documents?${params}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        setDocuments(data.data || []);
        setStatusCounts(data.meta?.statusCounts || {});
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterStatus, search]);

  useEffect(() => {
    const t = setTimeout(() => {
      fetchDocuments();
    }, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchDocuments]);

  const filtered = documents;

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const activeCount = statusCounts["active"] || 0;
  const expiringCount = statusCounts["expiring"] || 0;
  const draftCount = statusCounts["draft"] || 0;

  const kpis = [
    { label: "Total", value: totalCount, active: !filterStatus, onClick: () => setFilterStatus(null) },
    { label: "Activos", value: activeCount, active: filterStatus === "active", onClick: () => setFilterStatus(filterStatus === "active" ? null : "active"), color: "text-green-600" },
    { label: "Por Vencer", value: expiringCount, active: filterStatus === "expiring", onClick: () => setFilterStatus(filterStatus === "expiring" ? null : "expiring"), color: "text-orange-600" },
    { label: "Borradores", value: draftCount, active: filterStatus === "draft", onClick: () => setFilterStatus(filterStatus === "draft" ? null : "draft"), color: "text-gray-600" },
  ];

  const deleteDocument = async (id: string) => {
    if (!canDeleteDocument) return;
    if (!confirm("¿Eliminar este documento?")) return;
    try {
      await fetch(`/api/docs/documents/${id}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.onClick}
            className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
              kpi.active
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {kpi.label}
            </p>
            <p className={`text-2xl font-bold mt-1 ${kpi.color || ""}`}>
              {kpi.value}
            </p>
          </button>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por título, nombre o RUT del guardia..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Module filter */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {filterModule
                ? filterModule === "crm"
                  ? "CRM"
                  : filterModule === "payroll"
                  ? "Payroll"
                  : "Legal"
                : "Módulo"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setFilterModule(null)}>
              Todos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterModule("crm")}>
              CRM
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterModule("payroll")}>
              Payroll
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilterModule("legal")}>
              Legal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/opai/documentos/templates")}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          Templates
        </Button>

        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/opai/documentos/nuevo")}
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo Documento
        </Button>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-xl border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-muted/20">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No hay documentos
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Crea un nuevo documento o genera uno desde un template
          </p>
          <Button
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => router.push("/opai/documentos/nuevo")}
          >
            <Plus className="h-3.5 w-3.5" />
            Crear Documento
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => router.push(`/opai/documentos/${doc.id}`)}
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">
                    {doc.title}
                  </p>
                  <StatusBadge status={doc.status} />
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {doc.module.toUpperCase()} · {getCategoryLabel(doc.module, doc.category)}
                  </span>
                  {doc.guardiaName && (
                    <span>
                      {doc.guardiaName}
                      {doc.guardiaRut ? ` · RUT ${doc.guardiaRut}` : ""}
                    </span>
                  )}
                  {doc.expirationDate && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-white" />
                      Vence: {new Date(doc.expirationDate).toLocaleDateString("es-CL")}
                    </span>
                  )}
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/opai/documentos/${doc.id}`);
                    }}
                  >
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    Abrir
                  </DropdownMenuItem>
                  {canDeleteDocument ? (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteDocument(doc.id);
                      }}
                      className="text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Eliminar
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
