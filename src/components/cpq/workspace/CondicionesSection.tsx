"use client";

/**
 * Sección Condiciones comerciales de la cotización (extraída de CpqQuoteDetail
 * sin cambio visual). En modo multi-instalación las condiciones se gobiernan a
 * nivel propuesta: `proposalGoverned` deja los campos en solo lectura con link
 * al Consolidado.
 */

import type { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SectionCard } from "./SectionCard";
import { FieldTooltip } from "./financieros/FieldTooltip";
import type { ProposalTemplateOption, QuoteFormState } from "./types";

/** Fecha de término estimada (solo display): inicio contrato + N meses. */
function estimatedServiceEnd(startIso: string | null | undefined, months: number): string | null {
  if (!startIso || !Number.isFinite(months) || months <= 0) return null;
  const start = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + Math.round(months));
  return end.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
}

export function CondicionesSection({
  open,
  onToggle,
  quoteId,
  form,
  setForm,
  setDirty,
  isLocked,
  proposalTemplates,
  proposalTemplateId,
  setProposalTemplateId,
  proposalGoverned = false,
  onEditAtProposal,
}: {
  open: boolean;
  onToggle: () => void;
  quoteId: string;
  form: QuoteFormState;
  setForm: Dispatch<SetStateAction<QuoteFormState>>;
  setDirty: () => void;
  isLocked: boolean;
  proposalTemplates: ProposalTemplateOption[];
  proposalTemplateId: string | null;
  setProposalTemplateId: (value: string | null) => void;
  /** Multi-instalación: condiciones gobernadas por la propuesta (solo lectura). */
  proposalGoverned?: boolean;
  onEditAtProposal?: () => void;
}) {
  const disabled = isLocked || proposalGoverned;

  return (
    <SectionCard
      id="sec-condiciones"
      title="Condiciones comerciales"
      open={open}
      onToggle={onToggle}
      cardClassName="overflow-hidden scroll-mt-[calc(var(--app-island-bottom)+var(--cpq-sticky-h))] lg:scroll-mt-32"
      bodyInert={isLocked}
      summary={
        <span className="text-xs text-muted-foreground truncate">
          {form.paymentTerms === "contrafactura" ? "Contrafactura" : form.paymentTerms === "30_dias" ? "30 días" : "Anticipado"} · {form.serviceStartDays}d · {form.contractDuration}m
        </span>
      }
    >
      {proposalGoverned && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-status-info-border bg-status-info-soft/30 px-3 py-2">
          <p className="text-xs text-status-info-fg">
            Las condiciones se gobiernan a nivel propuesta y aplican a todas las instalaciones.
          </p>
          {onEditAtProposal && (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline min-h-[32px]"
              onClick={onEditAtProposal}
            >
              Editar a nivel propuesta →
            </button>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Forma de pago</Label>
          <select
            value={form.paymentTerms}
            onChange={(e) => { setForm(prev => ({ ...prev, paymentTerms: e.target.value })); setDirty(); }}
            disabled={disabled}
            className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="contrafactura">Contrafactura</option>
            <option value="30_dias">30 días</option>
            <option value="anticipado">Pago anticipado</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Inicio servicios</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={90}
              value={form.serviceStartDays}
              onChange={(e) => { setForm(prev => ({ ...prev, serviceStartDays: Number(e.target.value) || 5 })); setDirty(); }}
              disabled={disabled}
              className="h-8 bg-card text-foreground border-border text-xs w-16"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {form.isOngoingService ? "Compromiso / reajuste" : "Duración"}
          </Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={60}
              value={form.contractDuration}
              onChange={(e) => { setForm(prev => ({ ...prev, contractDuration: Number(e.target.value) || 12 })); setDirty(); }}
              disabled={disabled}
              className="h-8 bg-card text-foreground border-border text-xs w-16"
            />
            <span className="text-xs text-muted-foreground">meses</span>
          </div>
          {!form.isOngoingService && estimatedServiceEnd(form.contractStartDate, form.contractDuration) && (
            <p className="text-xs text-muted-foreground">Termina ~{estimatedServiceEnd(form.contractStartDate, form.contractDuration)}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Servicio continuo</Label>
          <div className="flex h-8 items-center gap-2">
            <Switch
              checked={form.isOngoingService}
              onCheckedChange={(checked) => { setForm(prev => ({ ...prev, isOngoingService: checked })); setDirty(); }}
              disabled={disabled}
            />
            <span className="text-xs text-muted-foreground">
              {form.isOngoingService ? "Indefinido" : "Plazo definido"}
            </span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Propuesta económica</Label>
          <div className="flex items-center gap-1.5">
            <select
              value={proposalTemplateId ?? ""}
              onChange={(e) => {
                const val = e.target.value || null;
                setProposalTemplateId(val);
                fetch(`/api/cpq/quotes/${quoteId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ proposalTemplateId: val }),
                }).catch(() => {});
              }}
              disabled={isLocked}
              className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {proposalTemplates
                .filter(
                  (t) =>
                    !(
                      (t.name || "").toLowerCase().includes("presentación") &&
                      (t.name || "").toLowerCase().includes("empresa")
                    )
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Contract service fields */}
      <div className="border-t border-border pt-3 mt-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Contrato de Servicio</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tipo de reajuste</Label>
            <select
              value={form.adjustmentType}
              onChange={(e) => {
                const type = e.target.value;
                setForm(prev => ({
                  ...prev,
                  adjustmentType: type,
                  ...(type === "NONE" ? { adjustmentFreq: null, ipcWeight: null, imoWeight: null } : {}),
                  ...(type === "IPC" || type === "IMO" ? { ipcWeight: null, imoWeight: null } : {}),
                }));
                setDirty();
              }}
              disabled={disabled}
              className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="NONE">Sin reajuste</option>
              <option value="IPC">IPC</option>
              <option value="IMO">Índice Mano de Obra</option>
              <option value="POLYNOMIAL">Polinomio mixto</option>
            </select>
          </div>

          {form.adjustmentType !== "NONE" && (
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frecuencia</Label>
              <select
                value={form.adjustmentFreq ?? ""}
                onChange={(e) => { setForm(prev => ({ ...prev, adjustmentFreq: e.target.value || null })); setDirty(); }}
                disabled={disabled}
                className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Seleccionar</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
          )}

          {form.adjustmentType === "POLYNOMIAL" && (
            <>
              <div className="space-y-1">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">% IPC</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} value={form.ipcWeight ?? ""}
                    onChange={(e) => { const ipc = Number(e.target.value) || 0; setForm(prev => ({ ...prev, ipcWeight: ipc, imoWeight: 100 - ipc })); setDirty(); }}
                    disabled={disabled} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">% IMO</Label>
                <div className="flex items-center gap-1">
                  <Input type="number" min={0} max={100} value={form.imoWeight ?? ""}
                    onChange={(e) => { const imo = Number(e.target.value) || 0; setForm(prev => ({ ...prev, imoWeight: imo, ipcWeight: 100 - imo })); setDirty(); }}
                    disabled={disabled} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Días de pago</Label>
            <div className="flex items-center gap-1">
              <Input type="number" min={1} max={30} value={form.paymentDays}
                onChange={(e) => { setForm(prev => ({ ...prev, paymentDays: Number(e.target.value) || 5 })); setDirty(); }}
                disabled={disabled} className="h-8 bg-card text-foreground border-border text-xs w-16" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Póliza RC — monto asegurado
              </Label>
              <FieldTooltip
                label="Póliza RC — monto asegurado"
                text="Cobertura de responsabilidad civil exigida por el cliente. Aparece en la cláusula del contrato y, si activas el bloque de RC en Financieros, también en el costo."
              />
            </div>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} step={0.01} value={form.insurancePolicyUF ?? 1500} placeholder="1500"
                onChange={(e) => { setForm(prev => ({ ...prev, insurancePolicyUF: e.target.value ? Number(e.target.value) : 1500 })); setDirty(); }}
                disabled={disabled} className="h-8 bg-card text-foreground border-border text-xs w-20" />
              <span className="text-xs text-muted-foreground">UF</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Límite responsabilidad</Label>
            <div className="flex items-center gap-1">
              <Input type="number" min={1} max={24} value={form.liabilityMonths}
                onChange={(e) => { setForm(prev => ({ ...prev, liabilityMonths: Number(e.target.value) || 3 })); setDirty(); }}
                disabled={disabled} className="h-8 bg-card text-foreground border-border text-xs w-16" />
              <span className="text-xs text-muted-foreground">meses</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Incremento real anual</Label>
            <div className="flex items-center gap-1">
              <Input type="number" min={0} max={100} step={1} value={form.realAnnualIncrement ?? 3}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? 0 : Number(raw);
                  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
                  setForm(prev => ({ ...prev, realAnnualIncrement: clamped }));
                  setDirty();
                }}
                disabled={disabled} className="h-8 bg-card text-foreground border-border text-xs w-16" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fecha inicio contrato</Label>
            <Input type="date" value={form.contractStartDate ?? ""}
              onChange={(e) => { setForm(prev => ({ ...prev, contractStartDate: e.target.value || null })); setDirty(); }}
              disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs" />
          </div>

          <div className="space-y-1 flex items-end gap-2 pb-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={form.hasCCTV}
                onChange={(e) => { setForm(prev => ({ ...prev, hasCCTV: e.target.checked })); setDirty(); }}
                disabled={isLocked} className="rounded border-border" />
              <span className="text-xs text-muted-foreground">Incluye CCTV</span>
            </label>
          </div>

          {form.hasCCTV && (
            <div className="space-y-1">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Retención CCTV</Label>
              <div className="flex items-center gap-1">
                <Input type="number" min={1} max={365} value={form.cctvRetentionDays ?? 30}
                  onChange={(e) => { setForm(prev => ({ ...prev, cctvRetentionDays: Number(e.target.value) || 30 })); setDirty(); }}
                  disabled={isLocked} className="h-8 bg-card text-foreground border-border text-xs w-16" />
                <span className="text-xs text-muted-foreground">días</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
