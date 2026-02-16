"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  FileText,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Shield,
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
  MAX_RENEWALS,
  MAX_FIXED_TERM_DAYS,
  getContractEndDate,
  formatDateUTC,
  canRenewContract,
  shouldBecomeIndefinido,
  shouldAlertContractExpiration,
  businessDaysBetween,
} from "@/lib/guard-events";

interface GuardContractsTabProps {
  guardiaId: string;
  guardiaName: string;
  hiredAt: string | null;
  contract: GuardContract | null;
  onContractUpdated?: (contract: GuardContract) => void;
  linkedDocuments?: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    signatureStatus?: string | null;
    createdAt: string;
  }>;
}

export function GuardContractsTab({
  guardiaId,
  guardiaName,
  hiredAt,
  contract,
  onContractUpdated,
  linkedDocuments = [],
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
  const [period3End, setPeriod3End] = useState(contract?.contractPeriod3End?.slice(0, 10) ?? "");
  const [currentPeriod, setCurrentPeriod] = useState(contract?.contractCurrentPeriod ?? 1);

  const [generatingContract, setGeneratingContract] = useState(false);

  // Contract end date for current period
  const currentEndDate = useMemo(() => {
    if (contractType !== "plazo_fijo") return null;
    switch (currentPeriod) {
      case 3: return period3End;
      case 2: return period2End;
      default: return period1End;
    }
  }, [contractType, currentPeriod, period1End, period2End, period3End]);

  // Alert check
  const today = new Date().toISOString().slice(0, 10);
  const contractObj: GuardContract = {
    contractType,
    contractStartDate,
    contractPeriod1End: period1End || null,
    contractPeriod2End: period2End || null,
    contractPeriod3End: period3End || null,
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
          contractPeriod3End: period3End || null,
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
        contractPeriod3End: period3End || null,
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
    const nextPeriod = currentPeriod + 1;
    setCurrentPeriod(nextPeriod);
    toast.info(`Renovación ${nextPeriod - 1} activada. Ingresa la nueva fecha de término.`);
    setEditing(true);
  }

  async function handleGenerateContract() {
    setGeneratingContract(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/generate-contract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "contrato_laboral" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success("Contrato generado. Puedes enviarlo a firma.");
    } catch {
      toast.error("Error al generar contrato");
    } finally {
      setGeneratingContract(false);
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

      {/* Contract info */}
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
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fin período 1 (original)</Label>
                    <Input
                      type="date"
                      value={period1End}
                      min={contractStartDate}
                      onChange={(e) => setPeriod1End(e.target.value)}
                      className="text-sm"
                    />
                  </div>
                  {currentPeriod >= 2 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fin período 2 (1ra renovación)</Label>
                      <Input
                        type="date"
                        value={period2End}
                        min={period1End}
                        onChange={(e) => setPeriod2End(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                  {currentPeriod >= 3 && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fin período 3 (2da renovación)</Label>
                      <Input
                        type="date"
                        value={period3End}
                        min={period2End}
                        onChange={(e) => setPeriod3End(e.target.value)}
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Plazo fijo: de 1 día a 1 año por período. Máximo 2 renovaciones. Tras la 2da renovación o vencimiento sin finiquito, pasa a indefinido.
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
                  <p>{currentPeriod === 1 ? "Original" : `Renovación ${currentPeriod - 1}`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vencimiento</p>
                  <p>{currentEndDate ? formatDateUTC(currentEndDate) : "No definido"}</p>
                </div>
                {period1End && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fin período 1</p>
                    <p>{formatDateUTC(period1End)}</p>
                  </div>
                )}
                {period2End && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fin período 2 (1ra renov.)</p>
                    <p>{formatDateUTC(period2End)}</p>
                  </div>
                )}
                {period3End && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fin período 3 (2da renov.)</p>
                    <p>{formatDateUTC(period3End)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Renew button */}
        {!editing && contractType === "plazo_fijo" && canRenew && !isExpired && (
          <Button size="sm" variant="outline" onClick={handleRenew} className="gap-1.5 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            Renovar contrato (renovación {currentPeriod})
          </Button>
        )}
      </div>

      {/* Linked contract documents */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-muted-foreground">Contratos y anexos</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateContract}
            disabled={generatingContract}
            className="h-7 gap-1.5 text-xs"
          >
            {generatingContract ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Generar contrato
          </Button>
        </div>

        {contractDocs.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-1.5 text-sm text-muted-foreground">
              No hay contratos vinculados a este guardia.
            </p>
            <p className="text-xs text-muted-foreground/70">
              Genera un contrato desde un template o vincula uno existente.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {contractDocs.map((doc) => (
              <a
                key={doc.id}
                href={`/opai/documentos/${doc.id}`}
                className="flex items-center gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-accent/50"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.category === "contrato_laboral" ? "Contrato" : "Anexo"} · {new Date(doc.createdAt).toLocaleDateString("es-CL")}
                  </p>
                </div>
                <Badge variant={doc.signatureStatus === "completed" ? "success" : "secondary"} className="shrink-0 text-[10px]">
                  {doc.signatureStatus === "completed" ? "Firmado" : doc.status}
                </Badge>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
