"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Upload,
  FileSignature,
  Loader2,
  ExternalLink,
  Download,
  Send,
  Eye,
  Trash2,
  Globe,
  FileText,
  ChevronRight,
} from "lucide-react";
import { DOC_STATUS_CONFIG } from "@/lib/docs/token-registry";

interface Contract {
  id: string;
  uniqueId: string;
  title: string;
  category: string;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  alertDaysBefore: number;
  pdfUrl: string | null;
  portalVisible: boolean;
  templateName: string | null;
  deal: { id: string; title: string } | null;
  signatureStatus: string | null;
  signatureRecipients: Array<{ id: string; name: string; email: string; status: string }>;
  createdAt: string;
}

interface WonDeal {
  id: string;
  title: string;
  amount: number | null;
  installationName: string | null;
  activeQuote: {
    id: string;
    code: string;
    name: string;
    monthlyCost: number | null;
    totalPositions: number | null;
    totalGuards: number | null;
  } | null;
  quotesCount: number;
}

interface Template {
  id: string;
  name: string;
  category: string;
}

interface Props {
  accountId: string;
  accountName: string;
  onRefresh?: () => void;
}

export function AccountContractsSection({ accountId, accountName, onRefresh }: Props) {
  const router = useRouter();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadEffective, setUploadEffective] = useState("");
  const [uploadExpiration, setUploadExpiration] = useState("");
  const [uploadSaving, setUploadSaving] = useState(false);

  // Generate dialog
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genStep, setGenStep] = useState(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [wonDeals, setWonDeals] = useState<WonDeal[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [genTitle, setGenTitle] = useState("");
  const [genEffective, setGenEffective] = useState("");
  const [genExpiration, setGenExpiration] = useState("");
  const [genSaving, setGenSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);

  // Action loading states
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const fetchContracts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`);
      const data = await res.json();
      if (data.success) setContracts(data.data ?? []);
    } catch {
      toast.error("Error al cargar contratos");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  // ─── Upload PDF ────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim()) {
      toast.error("Archivo y título son requeridos");
      return;
    }
    setUploadSaving(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle.trim());
      formData.append("category", "contrato_cliente");
      if (uploadEffective) formData.append("effectiveDate", uploadEffective);
      if (uploadExpiration) formData.append("expirationDate", uploadExpiration);

      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Contrato subido exitosamente");
        setUploadOpen(false);
        resetUploadForm();
        fetchContracts();
      } else {
        toast.error(data.error || "Error al subir contrato");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUploadSaving(false);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadEffective("");
    setUploadExpiration("");
  };

  // ─── Generate from Template ────────────────────────────────────
  const openGenerateDialog = async () => {
    setGenerateOpen(true);
    setGenStep(1);
    setSelectedTemplateId("");
    setSelectedDealId("");
    setGenTitle(`Contrato - ${accountName}`);
    setGenEffective("");
    setGenExpiration("");

    // Fetch templates and deals in parallel
    setLoadingTemplates(true);
    setLoadingDeals(true);

    try {
      const [tplRes, dealsRes] = await Promise.all([
        fetch("/api/docs/templates?module=crm&category=contrato_cliente"),
        fetch(`/api/crm/accounts/${accountId}/won-deals`),
      ]);
      const tplData = await tplRes.json();
      const dealsData = await dealsRes.json();

      if (tplData.success) setTemplates(tplData.data ?? []);
      if (dealsData.success) setWonDeals(dealsData.data ?? []);
    } catch {
      toast.error("Error cargando datos");
    } finally {
      setLoadingTemplates(false);
      setLoadingDeals(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplateId || !selectedDealId) {
      toast.error("Selecciona un template y un negocio");
      return;
    }
    setGenSaving(true);
    try {
      const res = await fetch(`/api/crm/accounts/${accountId}/contracts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          dealId: selectedDealId,
          title: genTitle.trim() || `Contrato - ${accountName}`,
          effectiveDate: genEffective || null,
          expirationDate: genExpiration || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Contrato generado. Redirigiendo al editor...");
        setGenerateOpen(false);
        fetchContracts();
        // Redirect to document editor for review
        router.push(`/opai/documentos/${data.data.id}`);
      } else {
        toast.error(data.error || "Error al generar contrato");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setGenSaving(false);
    }
  };

  // ─── Actions ───────────────────────────────────────────────────
  const togglePortal = async (contract: Contract) => {
    setActionLoading((prev) => ({ ...prev, [contract.id]: true }));
    try {
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contract.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ portalVisible: !contract.portalVisible }),
        }
      );
      const data = await res.json();
      if (data.success) {
        toast.success(
          contract.portalVisible
            ? "Contrato removido del portal"
            : "Contrato compartido al portal"
        );
        fetchContracts();
      }
    } catch {
      toast.error("Error actualizando visibilidad");
    } finally {
      setActionLoading((prev) => ({ ...prev, [contract.id]: false }));
    }
  };

  const deleteContract = async (contract: Contract) => {
    if (!confirm(`¿Eliminar el contrato "${contract.title}"?`)) return;
    setActionLoading((prev) => ({ ...prev, [contract.id]: true }));
    try {
      const res = await fetch(
        `/api/crm/accounts/${accountId}/contracts/${contract.id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Contrato eliminado");
        fetchContracts();
        onRefresh?.();
      }
    } catch {
      toast.error("Error eliminando contrato");
    } finally {
      setActionLoading((prev) => ({ ...prev, [contract.id]: false }));
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-CL");
  };

  const getStatusConfig = (status: string) =>
    DOC_STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-700" };

  const getSignatureLabel = (status: string | null) => {
    if (!status) return null;
    const map: Record<string, { label: string; color: string }> = {
      draft: { label: "Firma pendiente", color: "bg-gray-100 text-gray-600" },
      pending: { label: "Enviada a firma", color: "bg-yellow-100 text-yellow-700" },
      in_progress: { label: "En proceso de firma", color: "bg-blue-100 text-blue-700" },
      completed: { label: "Firmado", color: "bg-green-100 text-green-700" },
      cancelled: { label: "Firma cancelada", color: "bg-red-100 text-red-700" },
    };
    return map[status] ?? null;
  };

  // ─── Render ────────────────────────────────────────────────────
  const selectedDeal = wonDeals.find((d) => d.id === selectedDealId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Contratos</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              resetUploadForm();
              setUploadOpen(true);
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Subir PDF
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={openGenerateDialog}
          >
            <FileSignature className="h-3.5 w-3.5" />
            Generar desde Plantilla
          </Button>
        </div>
      </div>

      {/* Contract List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No hay contratos aún</p>
          <p className="text-xs text-muted-foreground mt-1">
            Sube un PDF o genera uno desde una plantilla
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {contracts.map((c) => {
            const statusCfg = getStatusConfig(c.status);
            const sigLabel = getSignatureLabel(c.signatureStatus);
            const isLoading = actionLoading[c.id];

            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {c.title}
                    </span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${statusCfg.color}`}>
                      {statusCfg.label}
                    </Badge>
                    {sigLabel && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sigLabel.color}`}>
                        {sigLabel.label}
                      </Badge>
                    )}
                    {c.portalVisible && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-emerald-50 text-emerald-700">
                        <Globe className="h-2.5 w-2.5 mr-0.5" />
                        Portal
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>
                      {formatDate(c.effectiveDate)} — {formatDate(c.expirationDate)}
                    </span>
                    {c.deal && (
                      <span className="truncate">
                        Negocio: {c.deal.title}
                      </span>
                    )}
                    {c.templateName && (
                      <span className="truncate">
                        Plantilla: {c.templateName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {/* View */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    title="Ver documento"
                    onClick={() => router.push(`/opai/documentos/${c.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  {/* Download PDF */}
                  {c.pdfUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Descargar PDF"
                      asChild
                    >
                      <a href={c.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                  {/* Send for signature */}
                  {c.status === "draft" && !c.pdfUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      title="Enviar a firma"
                      onClick={() => router.push(`/opai/documentos/${c.id}`)}
                    >
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {/* Toggle portal visibility */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 p-0 ${c.portalVisible ? "text-emerald-600" : ""}`}
                    title={c.portalVisible ? "Quitar del portal" : "Compartir en portal"}
                    onClick={() => togglePortal(c)}
                    disabled={isLoading}
                  >
                    <Globe className="h-3.5 w-3.5" />
                  </Button>
                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive"
                    title="Eliminar"
                    onClick={() => deleteContract(c)}
                    disabled={isLoading}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Upload PDF Dialog ─────────────────────────────────────── */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir Contrato PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Archivo PDF</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setUploadFile(f);
                    if (!uploadTitle)
                      setUploadTitle(f.name.replace(/\.pdf$/i, ""));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="Nombre del contrato"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha Inicio</Label>
                <Input
                  type="date"
                  value={uploadEffective}
                  onChange={(e) => setUploadEffective(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha Término</Label>
                <Input
                  type="date"
                  value={uploadExpiration}
                  onChange={(e) => setUploadExpiration(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={uploadSaving || !uploadFile}>
              {uploadSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Subir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Generate from Template Dialog ─────────────────────────── */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Generar Contrato desde Plantilla
              <span className="text-xs text-muted-foreground ml-2">
                Paso {genStep} de 3
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 min-h-[200px]">
            {/* Step 1: Select Template */}
            {genStep === 1 && (
              <div className="space-y-3">
                <Label>Selecciona una plantilla</Label>
                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No hay plantillas con categoría &quot;Contrato Cliente&quot; en módulo CRM.
                    Crea una en Documentos &gt; Templates.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTemplateId(t.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors ${
                          selectedTemplateId === t.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <span className="text-sm font-medium">{t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Select Won Deal */}
            {genStep === 2 && (
              <div className="space-y-3">
                <Label>¿Para qué negocio ganado es el contrato?</Label>
                {loadingDeals ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : wonDeals.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">
                    No hay negocios ganados para esta cuenta. Primero marca un negocio como ganado.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {wonDeals.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => setSelectedDealId(d.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-md border transition-colors ${
                          selectedDealId === d.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{d.title}</span>
                          {d.amount && (
                            <span className="text-xs text-muted-foreground">
                              ${Number(d.amount).toLocaleString("es-CL")}
                            </span>
                          )}
                        </div>
                        {d.activeQuote && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Cotización: {d.activeQuote.code} · {d.activeQuote.totalGuards} guardias · {d.activeQuote.totalPositions} posiciones
                          </p>
                        )}
                        {d.installationName && (
                          <p className="text-xs text-muted-foreground">
                            Instalación: {d.installationName}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Contract details */}
            {genStep === 3 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Título del Contrato</Label>
                  <Input
                    value={genTitle}
                    onChange={(e) => setGenTitle(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Fecha Inicio</Label>
                    <Input
                      type="date"
                      value={genEffective}
                      onChange={(e) => setGenEffective(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fecha Término</Label>
                    <Input
                      type="date"
                      value={genExpiration}
                      onChange={(e) => setGenExpiration(e.target.value)}
                    />
                  </div>
                </div>
                {selectedDeal && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="font-medium">Resumen</p>
                    <p className="text-muted-foreground mt-1">
                      Plantilla: {templates.find((t) => t.id === selectedTemplateId)?.name}
                    </p>
                    <p className="text-muted-foreground">
                      Negocio: {selectedDeal.title}
                    </p>
                    {selectedDeal.activeQuote && (
                      <p className="text-muted-foreground">
                        Cotización: {selectedDeal.activeQuote.code} — $
                        {Number(selectedDeal.activeQuote.monthlyCost ?? 0).toLocaleString("es-CL")}/mes
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancelar
            </Button>
            {genStep > 1 && (
              <Button variant="outline" onClick={() => setGenStep(genStep - 1)}>
                Atrás
              </Button>
            )}
            {genStep < 3 ? (
              <Button
                onClick={() => setGenStep(genStep + 1)}
                disabled={
                  (genStep === 1 && !selectedTemplateId) ||
                  (genStep === 2 && !selectedDealId)
                }
                className="gap-1"
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={genSaving}
                className="gap-1.5"
              >
                {genSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                <FileSignature className="h-3.5 w-3.5" />
                Generar Contrato
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
