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
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  FileInput,
  Hash,
  Plus,
  Search,
  Download,
  Ban,
  FileMinus,
  FilePlus,
  Loader2,
  RefreshCw,
  Mail,
  FileCode,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { KPIRow, TrendChart } from "./FacturacionDashboardWidgets";
import { LibroIvaTab } from "./LibroIvaTab";

/* ── Types ── */

interface DteRow {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  receiverEmail: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  siiStatus: string;
  currency: string;
  linesCount: number;
  createdAt: string;
  emailSentAt: string | null;
  emailStatus: string | null;
  referenceType: number | null;
  referenceFolio: number | null;
}

interface FolioStatus {
  dteType: number;
  lastFolio: number;
  nextFolio: number;
  totalIssued: number;
}

interface ReceivedDteRow {
  id: string;
  dteType: number;
  folio: number;
  issuerRut: string;
  issuerName: string;
  date: string;
  dueDate: string | null;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  receptionStatus: string;
  paymentStatus: string;
  amountPaid: number;
  amountPending: number;
  supplier: { id: string; name: string; rut: string } | null;
}

interface SupplierOption {
  id: string;
  rut: string;
  name: string;
}

interface FacturacionKpis {
  ventasMes: number;
  ivaDebitoMes: number;
  pendientesSii: number;
  facturasMes: number;
  foliosDisponibles: number;
  foliosLowCount: number;
  comparison: { vs: string; pct: number };
}

interface Props {
  dtes: DteRow[];
  canManage: boolean;
  suppliers?: SupplierOption[];
  kpis: FacturacionKpis;
}

/* ── Constants ── */

const TABS = [
  { id: "dtes", label: "DTEs Emitidos", icon: FileText },
  { id: "recibidos", label: "DTEs Recibidos", icon: FileInput },
  { id: "libro", label: "Libro IVA", icon: BookOpen },
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

/** Etiqueta corta para badges en filas (mejor para mobile + densidad) */
const DTE_TYPE_SHORT_LABELS: Record<number, string> = {
  33: "Factura",
  34: "F. Exenta",
  39: "Boleta",
  52: "G. Despacho",
  56: "N. Débito",
  61: "N. Crédito",
};

/** Tono semántico DS v3 por tipo. NC=danger (anula), ND=warn (corrige). */
const DTE_TYPE_BADGE_CLASS: Record<number, string> = {
  56: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  61: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
};

const SII_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Pendiente", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  ACCEPTED: { label: "Aceptado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  REJECTED: { label: "Rechazado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  ANNULLED: { label: "Anulado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const RECEPTION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_REVIEW: { label: "Pendiente", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  ACCEPTED: { label: "Aceptado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  CLAIMED: { label: "Reclamado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  PARTIAL_CLAIM: { label: "Reclamo parcial", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
};

const PAYMENT_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  UNPAID: { label: "No pagado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  PARTIAL: { label: "Parcial", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  PAID: { label: "Pagado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
};

const EMPTY_RECEIVED_FORM = {
  dteType: "33",
  folio: "",
  date: "",
  dueDate: "",
  issuerRut: "",
  issuerName: "",
  netAmount: "",
  taxAmount: "",
  totalAmount: "",
  supplierId: "",
  notes: "",
  receptionStatus: "PENDING_REVIEW",
};

/* ── Component ── */

export function FacturacionClient({
  dtes,
  canManage,
  suppliers = [],
  kpis,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("dtes");

  return (
    <div className="space-y-4">
      {/* Dashboard widgets */}
      <KPIRow kpis={kpis} />
      <TrendChart />

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
      {activeTab === "recibidos" && <RecibidosTab suppliers={suppliers} canManage={canManage} />}
      {activeTab === "libro" && <LibroIvaTab />}
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
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);

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

  const handleDownloadXml = async (id: string, folio: number) => {
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/xml`);
      if (!res.ok) throw new Error("Error al descargar XML");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DTE-${folio}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  const handleResendEmail = async (id: string) => {
    setSendingEmail(id);
    try {
      const res = await fetch(`/api/finance/billing/issued/${id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        toast.success("Email enviado");
        router.refresh();
      } else {
        toast.error(body.error ?? "Error enviando email");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSendingEmail(null);
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
          <div className="relative flex-1 max-w-sm min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folio, RUT, nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9">
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
            <SelectTrigger className="w-full sm:w-36 h-9">
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
          icon={FileText}
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
            <DataTable<DteRow>
              columns={[
                {
                  id: "dteType",
                  header: "Tipo",
                  cell: (row) => {
                    const typeClass = DTE_TYPE_BADGE_CLASS[row.dteType];
                    return (
                      <Badge variant="outline" className={cn("text-xs", typeClass)}>
                        {DTE_TYPE_SHORT_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}
                      </Badge>
                    );
                  },
                },
                {
                  id: "folio",
                  header: "Folio",
                  cell: (row) => (
                    <div>
                      <div className="font-mono text-xs">{row.folio}</div>
                      {row.referenceFolio != null && row.referenceType != null && (
                        <div className="text-[12px] text-ds-text-3 font-mono mt-0.5">
                          Ref: {row.referenceType}-{row.referenceFolio}
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  id: "receiverName",
                  header: "Receptor",
                  cell: (row) => (
                    <div>
                      <div>{row.receiverName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.receiverRut}</div>
                    </div>
                  ),
                },
                {
                  id: "netAmount",
                  header: "Neto",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.netAmount),
                },
                {
                  id: "taxAmount",
                  header: "IVA",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.taxAmount),
                },
                {
                  id: "totalAmount",
                  header: "Total",
                  align: "right",
                  cell: (row) => <span className="font-medium">{fmtCLP.format(row.totalAmount)}</span>,
                },
                {
                  id: "siiStatus",
                  header: "Estado SII",
                  cell: (row) => {
                    const stCfg = SII_STATUS_CONFIG[row.siiStatus] ?? { label: row.siiStatus, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                        {stCfg.label}
                      </Badge>
                    );
                  },
                },
                {
                  id: "createdAt",
                  header: "Fecha",
                  cell: (row) => (
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(row.createdAt), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  id: "emailStatus",
                  header: "Email",
                  cell: (row) => {
                    if (row.emailSentAt) {
                      return (
                        <Badge variant="outline" className="text-xs bg-status-ok-soft text-status-ok-fg border-status-ok-border">
                          Enviado {format(new Date(row.emailSentAt), "dd MMM", { locale: es })}
                        </Badge>
                      );
                    }
                    if (row.emailStatus === "FAILED") {
                      return (
                        <Badge variant="outline" className="text-xs bg-status-danger-soft text-status-danger-fg border-status-danger-border">
                          Falló
                        </Badge>
                      );
                    }
                    return (
                      <Badge variant="outline" className="text-xs">
                        Pendiente
                      </Badge>
                    );
                  },
                },
                {
                  id: "_actions",
                  header: "",
                  cell: (row) => (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDownloadPdf(row.id, row.folio); }}
                        title="Descargar PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleDownloadXml(row.id, row.folio); }}
                        title="Descargar XML"
                      >
                        <FileCode className="h-3.5 w-3.5" />
                      </Button>
                      {canManage && row.receiverEmail && row.siiStatus !== "ANNULLED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleResendEmail(row.id); }}
                          disabled={sendingEmail === row.id}
                          title={row.emailSentAt ? "Reenviar email" : "Enviar email"}
                        >
                          {sendingEmail === row.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Mail className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      {canManage && row.siiStatus !== "ANNULLED" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleVoid(row.id); }}
                            disabled={voiding === row.id}
                            title="Anular"
                          >
                            {voiding === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Ban className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </Button>
                          {row.dteType === 33 && (
                            <>
                              <Link href={`/finanzas/facturacion/notas/credito?referenceDteId=${row.id}`}>
                                <Button variant="ghost" size="sm" title="Nota de crédito">
                                  <FileMinus className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                              <Link href={`/finanzas/facturacion/notas/debito?referenceDteId=${row.id}`}>
                                <Button variant="ghost" size="sm" title="Nota de débito">
                                  <FilePlus className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  ),
                },
              ] satisfies DataTableColumn<DteRow>[]}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={FileText} title="Sin documentos" compact />}
            />
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
                          <Badge
                            variant="outline"
                            className={cn("text-xs", DTE_TYPE_BADGE_CLASS[d.dteType])}
                          >
                            {DTE_TYPE_SHORT_LABELS[d.dteType] ?? `Tipo ${d.dteType}`}
                          </Badge>
                          <span className="font-mono text-xs">#{d.folio}</span>
                          <Badge variant="outline" className={cn("text-xs", stCfg.className)}>
                            {stCfg.label}
                          </Badge>
                        </div>
                        {d.referenceFolio != null && d.referenceType != null && (
                          <p className="text-[12px] text-ds-text-3 font-mono mb-1">
                            Ref: {d.referenceType}-{d.referenceFolio}
                          </p>
                        )}
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
                    {(d.emailSentAt || d.emailStatus === "FAILED") && (
                      <div className="mt-2">
                        {d.emailSentAt ? (
                          <Badge variant="outline" className="text-xs bg-status-ok-soft text-status-ok-fg border-status-ok-border">
                            Email enviado {format(new Date(d.emailSentAt), "dd MMM", { locale: es })}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-status-danger-soft text-status-danger-fg border-status-danger-border">
                            Email falló
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="flex gap-1 mt-3 pt-3 border-t border-border flex-wrap">
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadPdf(d.id, d.folio)}>
                        <Download className="h-3.5 w-3.5 mr-1" />
                        PDF
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDownloadXml(d.id, d.folio)}>
                        <FileCode className="h-3.5 w-3.5 mr-1" />
                        XML
                      </Button>
                      {canManage && d.receiverEmail && d.siiStatus !== "ANNULLED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResendEmail(d.id)}
                          disabled={sendingEmail === d.id}
                        >
                          {sendingEmail === d.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <Mail className="h-3.5 w-3.5 mr-1" />
                          )}
                          {d.emailSentAt ? "Reenviar" : "Email"}
                        </Button>
                      )}
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
          icon={Hash}
          title="Sin datos de folios"
          description="No hay información de folios disponible."
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<FolioStatus>
              columns={[
                {
                  id: "dteType",
                  header: "Tipo DTE",
                  cell: (row) => <>{DTE_TYPE_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}</>,
                },
                {
                  id: "lastFolio",
                  header: "Último folio",
                  align: "center",
                  cell: (row) => <span className="font-mono text-xs">{row.lastFolio || "—"}</span>,
                },
                {
                  id: "nextFolio",
                  header: "Siguiente folio",
                  align: "center",
                  cell: (row) => <span className="font-mono text-xs">{row.nextFolio}</span>,
                },
                {
                  id: "totalIssued",
                  header: "Total emitidos",
                  align: "center",
                  cell: (row) => <span className="font-mono text-xs">{row.totalIssued}</span>,
                },
              ] satisfies DataTableColumn<FolioStatus>[]}
              rows={folios}
              rowKey={(row) => String(row.dteType)}
              empty={<EmptyState icon={Hash} title="Sin datos de folios" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {folios.map((f) => (
              <Card key={f.dteType}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-2">
                    {DTE_TYPE_LABELS[f.dteType] ?? `Tipo ${f.dteType}`}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
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

/* ═══════════════════════════════════════════════
   Tab 3: DTEs Recibidos
   ═══════════════════════════════════════════════ */

function RecibidosTab({ suppliers, canManage }: { suppliers: SupplierOption[]; canManage: boolean }) {
  const router = useRouter();
  const [receivedDtes, setReceivedDtes] = useState<ReceivedDteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_RECEIVED_FORM);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [receptionFilter, setReceptionFilter] = useState("ALL");
  const [paymentFilter, setPaymentFilter] = useState("ALL");
  const [syncing, setSyncing] = useState(false);

  const loadReceivedDtes = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/billing/received");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setReceivedDtes(json.data ?? []);
    } catch {
      toast.error("Error al cargar DTEs recibidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReceivedDtes(); }, [loadReceivedDtes]);

  const filtered = useMemo(() => {
    let list = receivedDtes;
    if (typeFilter !== "ALL") list = list.filter((d) => String(d.dteType) === typeFilter);
    if (receptionFilter !== "ALL") list = list.filter((d) => d.receptionStatus === receptionFilter);
    if (paymentFilter !== "ALL") list = list.filter((d) => d.paymentStatus === paymentFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          String(d.folio).includes(q) ||
          d.issuerRut.toLowerCase().includes(q) ||
          d.issuerName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [receivedDtes, typeFilter, receptionFilter, paymentFilter, search]);

  // Auto-calc total when net or tax changes
  const updateFormField = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "netAmount" || field === "taxAmount") {
        const net = parseFloat(next.netAmount) || 0;
        const tax = parseFloat(next.taxAmount) || 0;
        next.totalAmount = String(net + tax);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        dteType: Number(form.dteType),
        folio: Number(form.folio),
        date: form.date,
        dueDate: form.dueDate || null,
        issuerRut: form.issuerRut,
        issuerName: form.issuerName,
        netAmount: parseFloat(form.netAmount) || 0,
        taxAmount: parseFloat(form.taxAmount) || 0,
        totalAmount: parseFloat(form.totalAmount) || 0,
        supplierId: form.supplierId || null,
        notes: form.notes || null,
        receptionStatus: form.receptionStatus,
      };
      const res = await fetch("/api/finance/billing/received", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al registrar DTE recibido");
      }
      toast.success("DTE recibido registrado");
      setDialogOpen(false);
      setForm(EMPTY_RECEIVED_FORM);
      loadReceivedDtes();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncRcv = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/finance/config/dte-provider/sync-rcv", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Error");
      toast.success(
        `Sincronización completada: ${body.data.fetched} consultados, ${body.data.inserted} nuevos.`
      );
      await loadReceivedDtes();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <div className="relative flex-1 max-w-sm min-w-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar folio, RUT, emisor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-40 h-9">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los tipos</SelectItem>
              <SelectItem value="33">Factura</SelectItem>
              <SelectItem value="34">Factura Exenta</SelectItem>
              <SelectItem value="56">Nota Débito</SelectItem>
              <SelectItem value="61">Nota Crédito</SelectItem>
            </SelectContent>
          </Select>
          <Select value={receptionFilter} onValueChange={setReceptionFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Recepción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {Object.entries(RECEPTION_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-36 h-9">
              <SelectValue placeholder="Pago" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              {Object.entries(PAYMENT_STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncRcv}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1.5" />
              )}
              Sincronizar RCV
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Registrar DTE
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} documento(s) recibido(s)</p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={FileInput}
          title="Sin documentos recibidos"
          description="No hay DTEs recibidos registrados."
          action={
            canManage ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Registrar DTE
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable<ReceivedDteRow>
              columns={[
                {
                  id: "dteType",
                  header: "Tipo",
                  cell: (row) => (
                    <span className="text-xs">{DTE_TYPE_LABELS[row.dteType] ?? `Tipo ${row.dteType}`}</span>
                  ),
                },
                {
                  id: "folio",
                  header: "Folio",
                  cell: (row) => <span className="font-mono text-xs">{row.folio}</span>,
                },
                {
                  id: "issuerName",
                  header: "Emisor",
                  cell: (row) => (
                    <div>
                      <div>{row.issuerName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{row.issuerRut}</div>
                    </div>
                  ),
                },
                {
                  id: "date",
                  header: "Fecha",
                  cell: (row) => (
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(row.date), "dd MMM yyyy", { locale: es })}
                    </span>
                  ),
                },
                {
                  id: "netAmount",
                  header: "Neto",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.netAmount),
                },
                {
                  id: "taxAmount",
                  header: "IVA",
                  align: "right",
                  cell: (row) => fmtCLP.format(row.taxAmount),
                },
                {
                  id: "totalAmount",
                  header: "Total",
                  align: "right",
                  cell: (row) => <span className="font-medium">{fmtCLP.format(row.totalAmount)}</span>,
                },
                {
                  id: "receptionStatus",
                  header: "Recepción",
                  cell: (row) => {
                    const recCfg = RECEPTION_STATUS_CONFIG[row.receptionStatus] ?? { label: row.receptionStatus, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", recCfg.className)}>
                        {recCfg.label}
                      </Badge>
                    );
                  },
                },
                {
                  id: "paymentStatus",
                  header: "Pago",
                  cell: (row) => {
                    const payCfg = PAYMENT_STATUS_CONFIG[row.paymentStatus] ?? { label: row.paymentStatus, className: "bg-muted" };
                    return (
                      <Badge variant="outline" className={cn("text-xs", payCfg.className)}>
                        {payCfg.label}
                      </Badge>
                    );
                  },
                },
              ] satisfies DataTableColumn<ReceivedDteRow>[]}
              rows={filtered}
              rowKey={(row) => row.id}
              empty={<EmptyState icon={FileInput} title="Sin documentos recibidos" compact />}
            />
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((d) => {
              const recCfg = RECEPTION_STATUS_CONFIG[d.receptionStatus] ?? { label: d.receptionStatus, className: "bg-muted" };
              const payCfg = PAYMENT_STATUS_CONFIG[d.paymentStatus] ?? { label: d.paymentStatus, className: "bg-muted" };
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
                          <Badge variant="outline" className={cn("text-[10px]", recCfg.className)}>
                            {recCfg.label}
                          </Badge>
                          <Badge variant="outline" className={cn("text-[10px]", payCfg.className)}>
                            {payCfg.label}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm">{d.issuerName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.issuerRut}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-mono text-sm font-medium">{fmtCLP.format(d.totalAmount)}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(d.date), "dd MMM yyyy", { locale: es })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Dialog: Registrar DTE Recibido */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar DTE recibido</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo DTE</Label>
                <Select value={form.dteType} onValueChange={(v) => updateFormField("dteType", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="33">Factura</SelectItem>
                    <SelectItem value="34">Factura Exenta</SelectItem>
                    <SelectItem value="56">Nota Débito</SelectItem>
                    <SelectItem value="61">Nota Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Folio</Label>
                <Input
                  type="number"
                  placeholder="Ej: 1234"
                  value={form.folio}
                  onChange={(e) => updateFormField("folio", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha emisión</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateFormField("date", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha vencimiento</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => updateFormField("dueDate", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RUT emisor</Label>
                <Input
                  placeholder="Ej: 76.123.456-7"
                  value={form.issuerRut}
                  onChange={(e) => updateFormField("issuerRut", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Nombre emisor</Label>
                <Input
                  placeholder="Razón social"
                  value={form.issuerName}
                  onChange={(e) => updateFormField("issuerName", e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Monto neto</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.netAmount}
                  onChange={(e) => updateFormField("netAmount", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>IVA</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.taxAmount}
                  onChange={(e) => updateFormField("taxAmount", e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label>Total</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={form.totalAmount}
                  readOnly
                  className="h-9 bg-muted"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Select value={form.supplierId} onValueChange={(v) => updateFormField("supplierId", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.rut})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado recepción</Label>
                <Select value={form.receptionStatus} onValueChange={(v) => updateFormField("receptionStatus", v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RECEPTION_STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                placeholder="Observaciones opcionales..."
                value={form.notes}
                onChange={(e) => updateFormField("notes", e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
