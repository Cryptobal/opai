"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type ContractType,
  type GuardContract,
  CONTRACT_TYPE_LABELS,
  formatDateUTC,
  canRenewContract,
  shouldBecomeIndefinido,
  shouldAlertContractExpiration,
  businessDaysBetween,
} from "@/lib/guard-events";
import { DocPreviewDialog } from "@/components/docs/DocPreviewDialog";
import { SignatureRequestModal } from "@/components/docs/SignatureRequestModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type DocTemplate = { id: string; name: string; category: string };

interface GuardContractsTabProps {
  guardiaId: string;
  guardiaName: string;
  guardiaEmail?: string | null;
  guardiaRut?: string | null;
  hiredAt: string | null;
  contract: GuardContract | null;
  onContractUpdated?: (contract: GuardContract) => void;
  linkedDocuments?: Array<{
    id: string;
    title: string;
    category: string;
    signatureStatus?: string | null;
    expirationDate?: string | null;
  }>;
  onDocumentsGenerated?: () => void;
  canManageDocs?: boolean;
}

export function GuardContractsTab({
  guardiaId,
  guardiaName,
  guardiaEmail,
  guardiaRut,
  hiredAt,
  contract,
  onContractUpdated,
  linkedDocuments = [],
  onDocumentsGenerated,
  canManageDocs = false,
}: GuardContractsTabProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contractType, setContractType] = useState<ContractType>(
    (contract?.contractType as ContractType) ?? "indefinido"
  );
  const [contractStartDate, setContractStartDate] = useState(
    contract?.contractStartDate?.slice(0, 10) ?? hiredAt?.slice(0, 10) ?? ""
  );
  const [period1End, setPeriod1End] = useState(contract?.contractPeriod1End?.slice(0, 10) ?? "");
  const [period2End, setPeriod2End] = useState(contract?.contractPeriod2End?.slice(0, 10) ?? "");
  const [currentPeriod, setCurrentPeriod] = useState(Math.min(contract?.contractCurrentPeriod ?? 1, 2));

  const [contractTemplates, setContractTemplates] = useState<DocTemplate[]>([]);
  const [annexTemplates, setAnnexTemplates] = useState<DocTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [contractTemplateId, setContractTemplateId] = useState<string>("__none__");
  const [annexTemplateId, setAnnexTemplateId] = useState<string>("__none__");
  const [generatingType, setGeneratingType] = useState<"contrato" | "anexo" | null>(null);

  const [previewDocId, setPreviewDocId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<unknown>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [signatureRequestDocId, setSignatureRequestDocId] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  // Contract end date for current period (solo período 1 y 2; tras período 2 pasa a indefinido)
  const currentEndDate = useMemo(() => {
    if (contractType !== "plazo_fijo") return null;
    switch (currentPeriod) {
      case 2: return period2End;
      default: return period1End;
    }
  }, [contractType, currentPeriod, period1End, period2End]);

  // Alert check
  const today = new Date().toISOString().slice(0, 10);
  const contractObj: GuardContract = {
    contractType,
    contractStartDate,
    contractPeriod1End: period1End || null,
    contractPeriod2End: period2End || null,
    contractPeriod3End: null, // No existe período 3: tras período 2 pasa a indefinido
    contractCurrentPeriod: currentPeriod,
    contractBecameIndefinidoAt: contract?.contractBecameIndefinidoAt ?? null,
  };

  const showAlert = shouldAlertContractExpiration(contractObj, 5, today);
  const isExpired = shouldBecomeIndefinido(contractObj, today);
  const canRenew = canRenewContract(contractObj);

  // Days until expiration
  const daysUntilEnd = useMemo(() => {
    if (!currentEndDate) return null;
    return businessDaysBetween(today, currentEndDate);
  }, [currentEndDate, today]);

  // Contract documents (filtered from linked docs)
  const contractDocs = linkedDocuments.filter(
    (d) => d.category === "contrato_laboral" || d.category === "anexo_contrato"
  );

  const canGenerateContract = contractTemplateId && contractTemplateId !== "__none__";
  const canGenerateAnnex = annexTemplateId && annexTemplateId !== "__none__";

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const [contractRes, annexRes] = await Promise.all([
        fetch("/api/docs/templates?module=payroll&category=contrato_laboral&active=true"),
        fetch("/api/docs/templates?module=payroll&category=anexo_contrato&active=true"),
      ]);
      const contractData = await contractRes.json();
      const annexData = await annexRes.json();
      const contracts = contractData.success ? contractData.data : [];
      const annexes = annexData.success ? annexData.data : [];
      setContractTemplates(contracts);
      setAnnexTemplates(annexes);
    } catch {
      toast.error("Error al cargar templates");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/contract`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType,
          contractStartDate: contractStartDate || null,
          contractPeriod1End: period1End || null,
          contractPeriod2End: period2End || null,
          contractPeriod3End: null, // No período 3: tras período 2 pasa a indefinido
          contractCurrentPeriod: currentPeriod,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Contrato actualizado");
      setEditing(false);
      onContractUpdated?.({
        contractType,
        contractStartDate: contractStartDate || null,
        contractPeriod1End: period1End || null,
        contractPeriod2End: period2End || null,
        contractPeriod3End: null,
        contractCurrentPeriod: currentPeriod,
        contractBecameIndefinidoAt: contract?.contractBecameIndefinidoAt ?? null,
      });
    } catch {
      toast.error("Error al actualizar contrato");
    } finally {
      setSaving(false);
    }
  }

  async function handleRenew() {
    if (!canRenew) return;
    setCurrentPeriod(2);
    setEditing(true);
    toast.info("Renovación activada. Ingresa la fecha de fin del período 2 y guarda. Tras ese plazo pasa a indefinido.");
  }

  async function handleGenerateContract() {
    if (!canGenerateContract) return;
    setGeneratingType("contrato");
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/generate-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contrato_laboral", templateId: contractTemplateId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Contrato generado. Puedes enviarlo a firma.");
      onDocumentsGenerated?.();
    } catch {
      toast.error("Error al generar contrato");
    } finally {
      setGeneratingType(null);
    }
  }

  async function handleGenerateAnnex() {
    if (!canGenerateAnnex) return;
    setGeneratingType("anexo");
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/generate-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "anexo_contrato", templateId: annexTemplateId }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Anexo generado. Puedes enviarlo a firma.");
      onDocumentsGenerated?.();
    } catch {
      toast.error("Error al generar anexo");
    } finally {
      setGeneratingType(null);
    }
  }

  async function handleDeleteDocument(docId: string) {
    setDeletingDocId(docId);
    try {
      const res = await fetch(
        `/api/personas/guardias/${guardiaId}/doc-links?documentId=${encodeURIComponent(docId)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Documento eliminado de la ficha");
      setDeleteDocId(null);
      onDocumentsGenerated?.();
    } catch {
      toast.error("Error al eliminar documento");
    } finally {
      setDeletingDocId(null);
    }
  }

  async function handleDownloadPdf(docId: string) {
    setDownloadingPdfId(docId);
    try {
      const res = await fetch(`/api/docs/documents/${docId}/export-pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al generar PDF");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?(.+)"?/);
      const fileName = match?.[1]?.replace(/^"?|"?$/g, "") || `documento-${docId}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("PDF descargado");
    } catch {
      toast.error("Error al descargar PDF");
    } finally {
      setDownloadingPdfId(null);
    }
  }

  async function handlePreview(docId: string) {
    setPreviewDocId(docId);
    setLoadingPreview(true);
    try {
      const url = `/api/docs/documents/${docId}/preview${guardiaId ? `?guardiaId=${encodeURIComponent(guardiaId)}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setPreviewContent(data.data?.content ?? null);
    } catch {
      toast.error("Error al cargar vista previa");
      setPreviewDocId(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {showAlert && !isExpired && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="text-sm font-medium text-amber-600">Contrato próximo a vencer</p>
            <p className="text-xs text-amber-600/80">
              Quedan {daysUntilEnd} día(s) hábil(es) para el vencimiento
              {currentEndDate && ` (${formatDateUTC(currentEndDate)})`}.
              {canRenew ? " Puedes renovar o finiquitar." : " Máximo de renovaciones alcanzado."}
            </p>
          </div>
        </div>
      )}

      {isExpired && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Contrato vencido</p>
            <p className="text-xs text-destructive/80">
              El contrato a plazo fijo ha vencido. Si el guardia sigue trabajando, el contrato se ha convertido automáticamente en indefinido.
            </p>
          </div>
        </div>
      )}

      {/* Contrato y anexos — PRIMERO */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-medium">Contrato y anexos</h4>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Template de contrato</Label>
              <Select
                value={contractTemplateId}
                onValueChange={setContractTemplateId}
                disabled={loadingTemplates}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecciona template de contrato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguno</SelectItem>
                  {contractTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {contractTemplates.length === 0 && !loadingTemplates && (
                    <SelectItem value="__none__" disabled>Sin templates disponibles</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Template de anexo</Label>
              <Select
                value={annexTemplateId}
                onValueChange={setAnnexTemplateId}
                disabled={loadingTemplates}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Selecciona template de anexo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Ninguno</SelectItem>
                  {annexTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                  {annexTemplates.length === 0 && !loadingTemplates && (
                    <SelectItem value="__none__" disabled>Sin templates disponibles</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={handleGenerateContract}
              disabled={!!generatingType || !canGenerateContract || loadingTemplates}
              className="gap-1.5"
            >
              {generatingType === "contrato" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Generar contrato
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerateAnnex}
              disabled={!!generatingType || !canGenerateAnnex || loadingTemplates}
              className="gap-1.5"
            >
              {generatingType === "anexo" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Generar anexo
            </Button>
          </div>
        </div>

        {contractDocs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-1.5 text-sm text-muted-foreground">
              No hay contratos vinculados a este guardia.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Selecciona un template y usa el botón correspondiente para generar contrato o anexo.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {contractDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-card p-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.category === "contrato_laboral" ? "Contrato" : "Anexo"}
                  </p>
                  {doc.expirationDate && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Vence: {new Date(doc.expirationDate).toLocaleDateString("es-CL")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void handlePreview(doc.id)}
                  >
                    <Eye className="h-3 w-3" />
                    Ver
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    onClick={() => void handleDownloadPdf(doc.id)}
                    disabled={downloadingPdfId === doc.id}
                  >
                    {downloadingPdfId === doc.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                    PDF
                  </Button>
                  {doc.signatureStatus !== "completed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setSignatureRequestDocId(doc.id)}
                    >
                      <Send className="h-3 w-3" />
                      Enviar a firma
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7" asChild>
                    <a href={`/opai/documentos/${doc.id}`} target="_blank" rel="noopener noreferrer">
                      Abrir
                    </a>
                  </Button>
                  {canManageDocs && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteDocId(doc.id)}
                      disabled={deletingDocId === doc.id}
                      title="Eliminar de la ficha"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Datos del contrato — DESPUÉS */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-medium">Datos del contrato</h4>
          </div>
          {!editing && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 gap-1.5 text-xs">
              <Pencil className="h-3 w-3" />
              Editar
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de contrato</Label>
                <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indefinido">Indefinido</SelectItem>
                    <SelectItem value="plazo_fijo">Plazo Fijo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha inicio contrato</Label>
                <Input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>

            {contractType === "plazo_fijo" && (
              <>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">
                        Fin período 1 (original) *
                      </Label>
                      <Input
                        type="date"
                        value={period1End}
                        min={contractStartDate}
                        onChange={(e) => setPeriod1End(e.target.value)}
                        className="text-sm"
                      />
                      {period1End && contractStartDate && (
                        <p className="text-[10px] text-muted-foreground">
                          {Math.round((new Date(period1End).getTime() - new Date(contractStartDate).getTime()) / 86400000)} días
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        Fin período 2 (1ra renovación)
                      </Label>
                      <Input
                        type="date"
                        value={period2End}
                        min={period1End || contractStartDate}
                        onChange={(e) => setPeriod2End(e.target.value)}
                        className="text-sm"
                        placeholder="Sin renovación aún"
                      />
                      {!period2End && (
                        <p className="text-[10px] text-muted-foreground italic">Opcional — se llena al renovar. Tras período 2 pasa a indefinido.</p>
                      )}
                    </div>
                  </div>

                  {/* Visual timeline */}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="font-medium">{contractStartDate ? formatDateUTC(contractStartDate) : "Inicio"}</span>
                    <span className="flex-1 border-t border-dashed border-muted-foreground/30" />
                    {period1End && (
                      <>
                        <span className={`px-1.5 py-0.5 rounded ${currentPeriod === 1 ? "bg-primary/10 text-primary font-medium" : "bg-muted"}`}>
                          P1: {formatDateUTC(period1End)}
                        </span>
                        <span className="flex-1 border-t border-dashed border-muted-foreground/30" />
                      </>
                    )}
                    {period2End && (
                      <>
                        <span className={`px-1.5 py-0.5 rounded ${currentPeriod === 2 ? "bg-primary/10 text-primary font-medium" : "bg-muted"}`}>
                          P2: {formatDateUTC(period2End)}
                        </span>
                        <span className="flex-1 border-t border-dashed border-muted-foreground/30" />
                      </>
                    )}
                    <span className="font-medium">→ Indefinido</span>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Plazo fijo: de 1 día a 1 año por período. Máximo 1 renovación. Tras el período 2 o vencimiento sin finiquito, pasa a indefinido automáticamente.
                </p>
              </>
            )}

            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</p>
              <Badge variant={contractType === "plazo_fijo" ? "warning" : "default"}>
                {CONTRACT_TYPE_LABELS[contractType] ?? contractType}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Inicio</p>
              <p>{contractStartDate ? formatDateUTC(contractStartDate) : "No registrado"}</p>
            </div>
            {contractType === "plazo_fijo" && (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Período actual</p>
                  <p className="font-medium">{currentPeriod === 1 ? "Original" : `Renovación ${currentPeriod - 1}`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimiento actual</p>
                  <p className="font-medium">{currentEndDate ? formatDateUTC(currentEndDate) : "No definido"}</p>
                </div>
                <div className="sm:col-span-2 mt-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Períodos del contrato</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className={`rounded-md border p-2 ${currentPeriod === 1 ? "border-primary bg-primary/5" : "border-border"}`}>
                      <p className="text-muted-foreground">Período 1 (original)</p>
                      <p className="font-medium">{period1End ? formatDateUTC(period1End) : "—"}</p>
                      {currentPeriod === 1 && <Badge variant="default" className="mt-1 text-[9px]">Activo</Badge>}
                    </div>
                    <div className={`rounded-md border p-2 ${currentPeriod === 2 ? "border-primary bg-primary/5" : period2End ? "border-border" : "border-dashed border-border/50"}`}>
                      <p className="text-muted-foreground">Período 2 (1ra renovación)</p>
                      <p className="font-medium">{period2End ? formatDateUTC(period2End) : "Sin renovar → Indefinido"}</p>
                      {currentPeriod === 2 && <Badge variant="default" className="mt-1 text-[9px]">Activo</Badge>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Renew button */}
        {!editing && contractType === "plazo_fijo" && canRenew && !isExpired && (
          <Button size="sm" variant="outline" onClick={handleRenew} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Renovar contrato (período 2)
          </Button>
        )}
      </div>

      {/* Preview dialog */}
      <DocPreviewDialog
        open={!!previewDocId && !loadingPreview}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocId(null);
            setPreviewContent(null);
          }
        }}
        content={previewContent}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteDocId}
        onOpenChange={(open) => !open && setDeleteDocId(null)}
        title="Eliminar contrato/anexo"
        description="¿Quitar este documento de la ficha del guardia? El documento seguirá existiendo en el módulo Documentos."
        confirmLabel="Eliminar"
        variant="destructive"
        loading={!!deletingDocId}
        loadingLabel="Eliminando..."
        onConfirm={deleteDocId ? () => void handleDeleteDocument(deleteDocId) : () => {}}
      />

      {/* Signature request modal */}
      {signatureRequestDocId && (
        <SignatureRequestModal
          open={!!signatureRequestDocId}
          onOpenChange={(open) => !open && setSignatureRequestDocId(null)}
          documentId={signatureRequestDocId}
          initialRecipients={
            guardiaName && guardiaEmail
              ? [{ name: guardiaName, email: guardiaEmail, rut: guardiaRut ?? "" }]
              : undefined
          }
          onCreated={() => {
            setSignatureRequestDocId(null);
            onDocumentsGenerated?.();
          }}
        />
      )}
    </div>
  );
}
