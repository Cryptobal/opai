"use client";

/**
 * DocsClient — Gestión Documental — Refactored
 *
 * Desktop: Métricas compactas en fila + table-like rows (~50px)
 * Mobile: Compact cards (~72px) with tap-to-expand
 * Filtros: Pills horizontales
 */

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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/opai";
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

/** Dark-mode safe colors per status (the DOC_STATUS_CONFIG ones use light-theme bg/text) */
const STATUS_COLORS: Record<string, { compact: string; full: string }> = {
  draft:    { compact: "text-gray-400",    full: "bg-gray-500/15 text-gray-400 border-gray-500/20" },
  review:   { compact: "text-yellow-400",  full: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20" },
  approved: { compact: "text-blue-400",    full: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  active:   { compact: "text-emerald-400", full: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  expiring: { compact: "text-orange-400",  full: "bg-orange-500/15 text-orange-400 border-orange-500/20" },
  expired:  { compact: "text-red-400",     full: "bg-red-500/15 text-red-400 border-red-500/20" },
  renewed:  { compact: "text-purple-400",  full: "bg-purple-500/15 text-purple-400 border-purple-500/20" },
};

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const config = DOC_STATUS_CONFIG[status];
  if (!config) return <Badge variant="outline">{status}</Badge>;
  const Icon = STATUS_ICONS[status] || FileText;
  const colors = STATUS_COLORS[status] || { compact: "text-muted-foreground", full: "bg-muted text-muted-foreground border-border" };

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold whitespace-nowrap ${colors.compact}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${colors.full}`}
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

const MODULE_FILTER_OPTIONS = [
  { key: null, label: 'Módulo' },
  { key: 'crm', label: 'CRM' },
  { key: 'payroll', label: 'Payroll' },
  { key: 'legal', label: 'Legal' },
] as const;

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
    { label: "Total", value: totalCount, key: null as string | null, color: "" },
    { label: "Activos", value: activeCount, key: "active" as string | null, color: "text-emerald-400" },
    { label: "Por Vencer", value: expiringCount, key: "expiring" as string | null, color: "text-amber-400" },
    { label: "Borradores", value: draftCount, key: "draft" as string | null, color: "text-muted-foreground" },
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
    <div className="space-y-4">
      {/* KPIs — Compact row with separators */}
      <div className="hidden sm:flex items-stretch rounded-lg border border-border bg-card divide-x divide-border">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => setFilterStatus(filterStatus === kpi.key ? null : kpi.key)}
            className={`flex-1 py-3 px-4 text-left transition-all hover:bg-accent/30 ${
              filterStatus === kpi.key
                ? "bg-primary/5 ring-1 ring-inset ring-primary/30"
                : ""
            }`}
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </p>
            <p className={`text-2xl font-bold font-mono tracking-tight mt-0.5 ${kpi.color}`}>
              {kpi.value}
            </p>
          </button>
        ))}
      </div>

      {/* Mobile KPIs */}
      <div className="sm:hidden grid grid-cols-4 gap-1.5">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => setFilterStatus(filterStatus === kpi.key ? null : kpi.key)}
            className={`rounded-lg border py-2.5 px-2 text-center transition-all ${
              filterStatus === kpi.key
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
              {kpi.label}
            </p>
            <p className={`text-lg font-bold font-mono mt-0.5 ${kpi.color}`}>
              {kpi.value}
            </p>
          </button>
        ))}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por título, nombre o RUT..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-card border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50"
          />
        </div>

        {/* Module filter pills */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {MODULE_FILTER_OPTIONS.map((m) => (
            <button
              key={m.label}
              onClick={() => setFilterModule(filterModule === m.key ? null : m.key)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 ${
                filterModule === m.key
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-transparent'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/opai/documentos/templates")}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Templates</span>
        </Button>

        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => router.push("/opai/documentos/nuevo")}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Nuevo Documento</span>
          <span className="sm:hidden">Nuevo</span>
        </Button>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="space-y-1">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-md border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No hay documentos"
          description="Crea un nuevo documento o genera uno desde un template"
          action={
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => router.push("/opai/documentos/nuevo")}
            >
              <Plus className="h-3.5 w-3.5" />
              Crear Documento
            </Button>
          }
        />
      ) : (
        <>
          {/* Desktop table header */}
          <div className="hidden lg:grid lg:grid-cols-[32px_2fr_100px_120px_120px_100px_80px_36px] gap-3 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border">
            <span />
            <span>Título</span>
            <span>Módulo</span>
            <span>Tipo</span>
            <span>Persona</span>
            <span>RUT</span>
            <span>Estado</span>
            <span />
          </div>

          <div className="space-y-[2px] lg:space-y-0">
            {filtered.map((doc) => (
              <DocRow
                key={doc.id}
                doc={doc}
                onNavigate={() => router.push(`/opai/documentos/${doc.id}`)}
                onDelete={() => deleteDocument(doc.id)}
                canDelete={canDeleteDocument}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   DocRow — Desktop: table row, Mobile: compact card
   ──────────────────────────────────────────────────────────────── */
function DocRow({
  doc,
  onNavigate,
  onDelete,
  canDelete,
}: {
  doc: DocDocument;
  onNavigate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  return (
    <>
      {/* Desktop */}
      <div
        className="hidden lg:grid lg:grid-cols-[32px_2fr_100px_120px_120px_100px_80px_36px] gap-3 items-center px-3 py-2.5 rounded-md hover:bg-accent/40 transition-colors duration-150 cursor-pointer group border border-transparent hover:border-border/50"
        onClick={onNavigate}
      >
        <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[13px] font-semibold truncate text-foreground" title={doc.title}>
          {doc.title}
        </span>
        <span className="text-[12px] text-muted-foreground uppercase font-mono">
          {doc.module}
        </span>
        <span className="text-[12px] text-muted-foreground truncate">
          {getCategoryLabel(doc.module, doc.category)}
        </span>
        <span className="text-[12px] text-muted-foreground truncate">
          {doc.guardiaName || '—'}
        </span>
        <span className="text-[12px] text-muted-foreground font-mono">
          {doc.guardiaRut || '—'}
        </span>
        <StatusBadge status={doc.status} compact />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 flex items-center justify-center rounded-md sm:opacity-0 sm:group-hover:opacity-100 hover:bg-accent text-muted-foreground transition-all"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNavigate(); }}>
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Abrir
            </DropdownMenuItem>
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile */}
      <div
        className="lg:hidden flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card cursor-pointer active:scale-[0.98] transition-transform"
        onClick={onNavigate}
      >
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold truncate text-foreground">
              {doc.title}
            </span>
            <StatusBadge status={doc.status} compact />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
            <span className="uppercase font-mono">{doc.module}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="truncate">{getCategoryLabel(doc.module, doc.category)}</span>
            {doc.guardiaName && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="truncate">{doc.guardiaName}</span>
              </>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/60 shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNavigate(); }}>
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Abrir
            </DropdownMenuItem>
            {canDelete && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Eliminar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
