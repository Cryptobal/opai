"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/opai";
import {
  FileText,
  Hash,
  Plus,
  Search,
  Download,
  Ban,
  FileMinus,
  FilePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface DteRow {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  siiStatus: string;
  currency: string;
  linesCount: number;
  createdAt: string;
}

interface FolioStatus {
  dteType: number;
  lastFolio: number;
  nextFolio: number;
  totalIssued: number;
}

interface Props {
  dtes: DteRow[];
  canManage: boolean;
}

/* ── Constants ── */

const TABS = [
  { id: "dtes", label: "DTEs Emitidos", icon: FileText },
  { id: "folios", label: "Folios", icon: Hash },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

const SII_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ACCEPTED: { label: "Aceptado", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  REJECTED: { label: "Rechazado", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  ANNULLED: { label: "Anulado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/* ── Component ── */

export function FacturacionClient({ dtes, canManage }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("dtes");

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {activeTab === "dtes" && <DtesTab dtes={dtes} canManage={canManage} />}
      {activeTab === "folios" && <FoliosTab canManage={canManage} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 1: DTEs Emitidos
   ═══════════════════════════════════════════════ */

function DtesTab({ dtes, canManage }: { dtes: DteRow[]; canManage: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [voiding, setVoiding] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = dtes;
    if (typeFilter !== "ALL") list = list.filter((d) => String(d.dteType) === typeFilter);
    if (statusFilter !== "ALL") list = list.filter((d) => d.siiStatus === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          String(d.folio).includes(q) ||
          d.receiverRut.toLowerCase().includes(q) ||
          d.receiverName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [dtes, typeFilter, statusFilter, search]);

  const handleDownloadPdf = async (id: string, folio: number) => {
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/pdf`);
      if (!res.ok) throw new Error("Error al descargar PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE-${folio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const handleVoid = async (id: string) => {
    if (!confirm("¿Anular este DTE? Esta acción no se puede deshacer.")) return;
    setVoiding(id);
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/void`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al anular DTE");
      }
      toast.success("DTE anulado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setVoiding(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folio, RUT, nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los tipos</SelectItem>
              {Object.entries(DTE_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {Object.entries(SII_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Link href="/finanzas/facturacion/emitir">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Emitir DTE
            </Button>
          </Link>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} documento(s)</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="Sin documentos"
          description="No hay DTEs emitidos."
          action={
            canManage ? (
              <Link href="/finanzas/facturacion/emitir">
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Emitir DTE
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Folio</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Receptor</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Neto</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">IVA</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Total</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Estado SII</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((d) => {
                      const stCfg = SII_STATUS_CONFIG[d.siiStatus] ?? { label: d.siiStatus, className: "bg-muted" };
                      return (
                        <tr key={d.id} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                          <td className="px-4 py-3 text-xs">
                            {DTE_TYPE_LABELS[d.dteType] ?? `Tipo ${d.dteType}`}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{d.folio}</td>
                          <td className="px-4 py-3">
                            <div>{d.receiverName}</div>
                            <div className="text-xs text-muted-foreground font-mono">{d.receiverRut}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmtCLP.format(d.netAmount)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs">{fmtCLP.format(d.taxAmount)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-medium">{fmtCLP.format(d.totalAmount)}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                              {stCfg.label}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">
                            {format(new Date(d.createdAt), "dd MMM yyyy", { locale: es })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadPdf(d.id, d.folio)}
                                title="Descargar PDF"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                              {canManage && d.siiStatus !== "ANNULLED" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleVoid(d.id)}
                                    disabled={voiding === d.id}
                                    title="Anular"
                                  >
                                    {voiding === d.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Ban className="h-3.5 w-3.5 text-destructive" />
                                    )}
                                  </Button>
                                  {d.dteType === 33 && (
                                    <>
                                      <Link href={`/finanzas/facturacion/notas/credito?referenceDteId=${d.id}`}>
                                        <Button variant="ghost" size="sm" title="Nota de crédito">
                                          <FileMinus className="h-3.5 w-3.5" />
                                        </Button>
                                      </Link>
                                      <Link href={`/finanzas/facturacion/notas/debito?referenceDteId=${d.id}`}>
                                        <Button variant="ghost" size="sm" title="Nota de débito">
                                          <FilePlus className="h-3.5 w-3.5" />
                                        </Button>
                                      </Link>
                                    </>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((d) => {
              const stCfg = SII_STATUS_CONFIG[d.siiStatus] ?? { label: d.siiStatus, className: "bg-muted" };
              return (
                <Card key={d.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {DTE_TYPE_LABELS[d.dteType] ?? `Tipo ${d.dteType}`}
                          </span>
                          <span className="font-mono text-xs">#{d.folio}</span>
                          <Badge variant="outline" className={cn("text-[10px]", stCfg.className)}>
                            {stCfg.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{d.receiverName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.receiverRut}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-sm font-medium">{fmtCLP.format(d.totalAmount)}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(d.createdAt), "dd MMM yyyy", { locale: es })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-3 pt-3 border-t border-border">
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(d.id, d.folio)}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                      {canManage && d.siiStatus !== "ANNULLED" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVoid(d.id)}
                            disabled={voiding === d.id}
                          >
                            {voiding === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <Ban className="h-3.5 w-3.5 mr-1 text-destructive" />
                            )}
                            Anular
                          </Button>
                          {d.dteType === 33 && (
                            <Link href={`/finanzas/facturacion/notas/credito?referenceDteId=${d.id}`}>
                              <Button variant="ghost" size="sm">
                                <FileMinus className="h-3.5 w-3.5 mr-1" />
                                NC
                              </Button>
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Tab 2: Folios
   ═══════════════════════════════════════════════ */

function FoliosTab({ canManage }: { canManage: boolean }) {
  const [folios, setFolios] = useState<FolioStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFolios = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/billing/folios");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setFolios(json.data ?? []);
    } catch {
      toast.error("Error al cargar folios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFolios(); }, [loadFolios]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Estado de folios por tipo de DTE</p>

      {folios.length === 0 ? (
        <EmptyState
          icon={<Hash className="h-10 w-10" />}
          title="Sin datos de folios"
          description="No hay información de folios disponible."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Tipo DTE</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-center">Último folio</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-center">Siguiente folio</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-center">Total emitidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folios.map((f) => (
                      <tr key={f.dteType} className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          {DTE_TYPE_LABELS[f.dteType] ?? `Tipo ${f.dteType}`}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{f.lastFolio || "—"}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{f.nextFolio}</td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{f.totalIssued}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {folios.map((f) => (
              <Card key={f.dteType}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-2">
                    {DTE_TYPE_LABELS[f.dteType] ?? `Tipo ${f.dteType}`}
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Último</span>
                      <p className="font-mono">{f.lastFolio || "—"}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Siguiente</span>
                      <p className="font-mono">{f.nextFolio}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Emitidos</span>
                      <p className="font-mono">{f.totalIssued}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
