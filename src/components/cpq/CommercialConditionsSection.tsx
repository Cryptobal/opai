"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CommercialConditionsData {
  paymentTerms: string;
  serviceStartDays: number;
  contractDuration: number;
  proposalTemplateId: string | null;
  // Contract service fields
  adjustmentType: string;
  adjustmentFreq: string | null;
  ipcWeight: number | null;
  imoWeight: number | null;
  insurancePolicyUF: number | null;
  contractStartDate: string | null;
  liabilityMonths: number;
  hasCCTV: boolean;
  cctvRetentionDays: number | null;
  contractTemplateId: string | null;
  paymentDays: number;
}

interface CommercialConditionsSectionProps {
  value: CommercialConditionsData;
  onChange: (data: CommercialConditionsData) => void;
  proposalTemplates?: { id: string; name: string; slug?: string }[];
  contractTemplates?: { id: string; name: string }[];
  isLocked?: boolean;
}

export function CommercialConditionsSection({
  value,
  onChange,
  proposalTemplates = [],
  contractTemplates = [],
  isLocked,
}: CommercialConditionsSectionProps) {
  const update = (patch: Partial<CommercialConditionsData>) => onChange({ ...value, ...patch });

  const filteredTemplates = proposalTemplates.filter(
    (t) =>
      !((t.name || "").toLowerCase().includes("presentación") &&
        (t.name || "").toLowerCase().includes("empresa"))
  );

  return (
    <div className="space-y-4">
      {/* Existing commercial conditions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-sm text-muted-foreground">Forma de pago</Label>
          <select
            value={value.paymentTerms}
            onChange={(e) => update({ paymentTerms: e.target.value })}
            disabled={isLocked}
            className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="contrafactura">Contrafactura</option>
            <option value="30_dias">30 días</option>
            <option value="anticipado">Pago anticipado</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-sm text-muted-foreground">Inicio servicios</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={90}
              value={value.serviceStartDays}
              onChange={(e) => update({ serviceStartDays: Number(e.target.value) || 5 })}
              disabled={isLocked}
              className="h-8 bg-card text-foreground border-border text-xs w-16"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-sm text-muted-foreground">Duración contrato</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={1}
              max={60}
              value={value.contractDuration}
              onChange={(e) => update({ contractDuration: Number(e.target.value) || 12 })}
              disabled={isLocked}
              className="h-8 bg-card text-foreground border-border text-xs w-16"
            />
            <span className="text-xs text-muted-foreground">meses</span>
          </div>
        </div>
        {filteredTemplates.length > 0 && (
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Propuesta económica</Label>
            <select
              value={value.proposalTemplateId ?? ""}
              onChange={(e) => update({ proposalTemplateId: e.target.value || null })}
              disabled={isLocked}
              className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Contract service section */}
      <div className="border-t border-border pt-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Contrato de Servicio</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Tipo de reajuste</Label>
            <select
              value={value.adjustmentType}
              onChange={(e) => {
                const type = e.target.value;
                const patch: Partial<CommercialConditionsData> = { adjustmentType: type };
                if (type === "NONE") {
                  patch.adjustmentFreq = null;
                  patch.ipcWeight = null;
                  patch.imoWeight = null;
                }
                if (type === "IPC" || type === "IMO") {
                  patch.ipcWeight = null;
                  patch.imoWeight = null;
                }
                update(patch);
              }}
              disabled={isLocked}
              className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="NONE">Sin reajuste</option>
              <option value="IPC">IPC</option>
              <option value="IMO">Índice Mano de Obra</option>
              <option value="POLYNOMIAL">Polinomio mixto</option>
            </select>
          </div>

          {value.adjustmentType !== "NONE" && (
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Frecuencia</Label>
              <select
                value={value.adjustmentFreq ?? ""}
                onChange={(e) => update({ adjustmentFreq: e.target.value || null })}
                disabled={isLocked}
                className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Seleccionar</option>
                <option value="TRIMESTRAL">Trimestral</option>
                <option value="SEMESTRAL">Semestral</option>
                <option value="ANUAL">Anual</option>
              </select>
            </div>
          )}

          {value.adjustmentType === "POLYNOMIAL" && (
            <>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">% IPC</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={value.ipcWeight ?? ""}
                    onChange={(e) => {
                      const ipc = Number(e.target.value) || 0;
                      update({ ipcWeight: ipc, imoWeight: 100 - ipc });
                    }}
                    disabled={isLocked}
                    className="h-8 bg-card text-foreground border-border text-xs w-16"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">% IMO</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={value.imoWeight ?? ""}
                    onChange={(e) => {
                      const imo = Number(e.target.value) || 0;
                      update({ imoWeight: imo, ipcWeight: 100 - imo });
                    }}
                    disabled={isLocked}
                    className="h-8 bg-card text-foreground border-border text-xs w-16"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Días de pago</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={30}
                value={value.paymentDays}
                onChange={(e) => update({ paymentDays: Number(e.target.value) || 5 })}
                disabled={isLocked}
                className="h-8 bg-card text-foreground border-border text-xs w-16"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">días háb.</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Monto póliza</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                step={0.01}
                value={value.insurancePolicyUF ?? ""}
                onChange={(e) => update({ insurancePolicyUF: e.target.value ? Number(e.target.value) : null })}
                disabled={isLocked}
                className="h-8 bg-card text-foreground border-border text-xs w-20"
                placeholder="0.00"
              />
              <span className="text-xs text-muted-foreground">UF</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Límite responsabilidad</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={24}
                value={value.liabilityMonths}
                onChange={(e) => update({ liabilityMonths: Number(e.target.value) || 3 })}
                disabled={isLocked}
                className="h-8 bg-card text-foreground border-border text-xs w-16"
              />
              <span className="text-xs text-muted-foreground">meses</span>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Fecha inicio contrato</Label>
            <Input
              type="date"
              value={value.contractStartDate ?? ""}
              onChange={(e) => update({ contractStartDate: e.target.value || null })}
              disabled={isLocked}
              className="h-8 bg-card text-foreground border-border text-xs"
            />
          </div>

          <div className="space-y-1 flex items-end gap-2 pb-0.5">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={value.hasCCTV}
                onChange={(e) => update({ hasCCTV: e.target.checked })}
                disabled={isLocked}
                className="rounded border-border"
              />
              <span className="text-xs text-muted-foreground">Incluye CCTV</span>
            </label>
          </div>

          {value.hasCCTV && (
            <div className="space-y-1">
              <Label className="text-sm text-muted-foreground">Retención CCTV</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={value.cctvRetentionDays ?? 30}
                  onChange={(e) => update({ cctvRetentionDays: Number(e.target.value) || 30 })}
                  disabled={isLocked}
                  className="h-8 bg-card text-foreground border-border text-xs w-16"
                />
                <span className="text-xs text-muted-foreground">días</span>
              </div>
            </div>
          )}

          {contractTemplates.length > 0 && (
            <div className="space-y-1 col-span-2">
              <Label className="text-sm text-muted-foreground">Template de contrato</Label>
              <select
                value={value.contractTemplateId ?? ""}
                onChange={(e) => update({ contractTemplateId: e.target.value || null })}
                disabled={isLocked}
                className="flex h-8 w-full rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Seleccionar template</option>
                {contractTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
