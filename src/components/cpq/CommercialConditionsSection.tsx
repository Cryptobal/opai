"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Suma `months` meses a una fecha ISO (yyyy-mm-dd). Solo display; no persiste. */
function estimatedEndDate(startIso: string | null | undefined, months: number): string | null {
  if (!startIso || !Number.isFinite(months) || months <= 0) return null;
  const start = new Date(`${startIso}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + Math.round(months));
  return end.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });
}

export interface CommercialConditionsData {
  paymentTerms: string;
  serviceStartDays: number;
  contractDuration: number;
  /** true = servicio continuo/indefinido (default); false = plazo definido */
  isOngoingService?: boolean;
  proposalTemplateId: string | null;
  // Contract service fields (optional — only used in full CPQ detail)
  adjustmentType?: string;
  adjustmentFreq?: string | null;
  ipcWeight?: number | null;
  imoWeight?: number | null;
  insurancePolicyUF?: number | null;
  contractStartDate?: string | null;
  liabilityMonths?: number;
  hasCCTV?: boolean;
  cctvRetentionDays?: number | null;
  contractTemplateId?: string | null;
  paymentDays?: number;
  realAnnualIncrement?: number;
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

  // Continuidad del servicio: default continuo (indefinido), como el schema.
  const isOngoing = value.isOngoingService ?? true;
  const estimatedEnd = estimatedEndDate(value.contractStartDate, value.contractDuration);

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
          <Label className="text-sm text-muted-foreground">
            {isOngoing ? "Compromiso / reajuste" : "Duración"}
          </Label>
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
          {!isOngoing && estimatedEnd && (
            <p className="text-xs text-muted-foreground">Termina ~{estimatedEnd}</p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-sm text-muted-foreground">Servicio continuo</Label>
          <div className="flex h-8 items-center gap-2">
            <Switch
              checked={isOngoing}
              onCheckedChange={(checked) => update({ isOngoingService: checked })}
              disabled={isLocked}
            />
            <span className="text-xs text-muted-foreground">
              {isOngoing ? "Indefinido" : "Plazo definido"}
            </span>
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

      {/* Contract service section — only rendered when contract fields are available */}
      {value.adjustmentType !== undefined && <div className="border-t border-border pt-3">
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
                // Default 1500 UF when missing — standard póliza for
                // security-service contracts. User can override.
                value={value.insurancePolicyUF ?? 1500}
                onChange={(e) =>
                  update({
                    insurancePolicyUF: e.target.value ? Number(e.target.value) : 1500,
                  })
                }
                disabled={isLocked}
                className="h-8 bg-card text-foreground border-border text-xs w-20"
                placeholder="1500"
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
            <Label className="text-sm text-muted-foreground">Incremento real anual</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={value.realAnnualIncrement ?? 3}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? 0 : Number(raw);
                  update({ realAnnualIncrement: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0 });
                }}
                disabled={isLocked}
                className="h-8 bg-card text-foreground border-border text-xs w-16"
              />
              <span className="text-xs text-muted-foreground">%</span>
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
      </div>}
    </div>
  );
}
