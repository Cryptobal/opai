"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PayrollParameters } from "@/modules/payroll/engine";

type Mode = "editor" | "versions";

type FxData = {
  uf: Array<{ date: string; value: number; source: string | null; fetchedAt: string }>;
  utm: Array<{ month: string; value: number; source: string | null; fetchedAt: string }>;
};

type VersionSummary = {
  id: string;
  name: string;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  data?: PayrollParameters;
  created_at: string;
  created_by: string | null;
};

export function PayrollParametersEditor({ mode }: { mode: Mode }) {
  if (mode === "editor") return <EditorMode />;
  return <VersionsMode />;
}

// ============================================================================
// EDITOR MODE
// ============================================================================

function EditorMode() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<VersionSummary | null>(null);
  const [fx, setFx] = useState<FxData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [paramsRes, fxRes] = await Promise.all([
        fetch("/api/payroll/parameters?active_only=true", { cache: "no-store" }),
        fetch("/api/payroll/fx", { cache: "no-store" }),
      ]);
      if (paramsRes.ok) {
        const data = await paramsRes.json();
        setActive(data?.data?.current_version ?? null);
      } else if (paramsRes.status === 404) {
        setActive(null);
      } else {
        throw new Error(`Parámetros: HTTP ${paramsRes.status}`);
      }
      if (fxRes.ok) {
        const data = await fxRes.json();
        setFx(data?.data ?? { uf: [], utm: [] });
      } else {
        throw new Error(`FX: HTTP ${fxRes.status}`);
      }
    } catch (err: any) {
      setError(err.message || "Error cargando datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Cargando…</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <FxSection fx={fx} onChanged={load} />

      {!active && (
        <Card className="border-status-warn-border">
          <CardHeader>
            <CardTitle>Sin versión activa</CardTitle>
            <CardDescription>
              No existe una versión de parámetros activa. Crea una a continuación para comenzar.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <NewVersionForm active={active} onCreated={load} />
    </div>
  );
}

// ============================================================================
// FX SECTION
// ============================================================================

function FxSection({ fx, onChanged }: { fx: FxData | null; onChanged: () => void }) {
  const [editingUf, setEditingUf] = useState(false);
  const [editingUtm, setEditingUtm] = useState(false);

  const latestUf = fx?.uf?.[0];
  const latestUtm = fx?.utm?.[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referencias FX (UF / UTM)</CardTitle>
        <CardDescription>Valores vigentes. Solo administradores pueden actualizarlos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* UF */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">UF (diaria)</div>
              <div className="text-xs text-muted-foreground">
                {latestUf
                  ? `Última: ${latestUf.date} — $${latestUf.value.toLocaleString("es-CL")}`
                  : "Sin valores cargados"}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditingUf((v) => !v)}>
              {editingUf ? "Cancelar" : "Editar"}
            </Button>
          </div>
          {editingUf && (
            <FxUpsertForm
              type="uf"
              initialDate={latestUf?.date}
              initialValue={latestUf?.value}
              onDone={() => {
                setEditingUf(false);
                onChanged();
              }}
            />
          )}
          {fx?.uf && fx.uf.length > 1 && (
            <div className="mt-3 text-xs text-muted-foreground">
              Anteriores:{" "}
              {fx.uf.slice(1, 4).map((r) => (
                <span key={r.date} className="mr-3">
                  {r.date}: ${r.value.toLocaleString("es-CL")}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border" />

        {/* UTM */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">UTM (mensual)</div>
              <div className="text-xs text-muted-foreground">
                {latestUtm
                  ? `Última: ${latestUtm.month} — $${latestUtm.value.toLocaleString("es-CL")}`
                  : "Sin valores cargados"}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditingUtm((v) => !v)}>
              {editingUtm ? "Cancelar" : "Editar"}
            </Button>
          </div>
          {editingUtm && (
            <FxUpsertForm
              type="utm"
              initialDate={latestUtm?.month}
              initialValue={latestUtm?.value}
              onDone={() => {
                setEditingUtm(false);
                onChanged();
              }}
            />
          )}
          {fx?.utm && fx.utm.length > 1 && (
            <div className="mt-3 text-xs text-muted-foreground">
              Anteriores:{" "}
              {fx.utm.slice(1, 4).map((r) => (
                <span key={r.month} className="mr-3">
                  {r.month}: ${r.value.toLocaleString("es-CL")}
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FxUpsertForm({
  type,
  initialDate,
  initialValue,
  onDone,
}: {
  type: "uf" | "utm";
  initialDate?: string;
  initialValue?: number;
  onDone: () => void;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [value, setValue] = useState(initialValue ? String(initialValue) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/payroll/fx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, date, value: Number(value) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 rounded-md border border-border bg-card p-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{type === "uf" ? "Fecha (YYYY-MM-DD)" : "Mes (YYYY-MM)"}</Label>
          <Input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            placeholder={type === "uf" ? "2026-04-01" : "2026-04"}
          />
        </div>
        <div>
          <Label className="text-xs">Valor (CLP)</Label>
          <Input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="39500.00"
          />
        </div>
      </div>
      {error && <div className="text-xs text-destructive">{error}</div>}
      <Button size="sm" onClick={submit} disabled={saving || !date || !value}>
        {saving ? "Guardando…" : "Guardar"}
      </Button>
    </div>
  );
}

// ============================================================================
// NEW VERSION FORM
// ============================================================================

type Commission = { afp: string; rate_pct: string };
type Bracket = { from: string; to: string; factor_pct: string; rebate: string };

function NewVersionForm({
  active,
  onCreated,
}: {
  active: VersionSummary | null;
  onCreated: () => void;
}) {
  const activeData = active?.data;

  const initCommissions = useMemo<Commission[]>(() => {
    if (!activeData?.afp?.commissions) return [];
    return Object.entries(activeData.afp.commissions).map(([afp, c]) => ({
      afp,
      rate_pct: (c.commission_rate * 100).toFixed(2),
    }));
  }, [activeData]);

  const initBrackets = useMemo<Bracket[]>(() => {
    if (!activeData?.tax_brackets) return [];
    return activeData.tax_brackets.map((b) => ({
      from: String(b.from_clp),
      to: b.to_clp === null ? "" : String(b.to_clp),
      factor_pct: (b.factor * 100).toFixed(2),
      rebate: String(b.rebate_clp),
    }));
  }, [activeData]);

  const [name, setName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [imm, setImm] = useState(activeData?.imm?.value_clp ? String(activeData.imm.value_clp) : "");
  const [sisPct, setSisPct] = useState(
    activeData?.sis?.employer_rate ? (activeData.sis.employer_rate * 100).toFixed(2) : ""
  );
  const [pensionUf, setPensionUf] = useState(
    activeData?.caps?.pension_uf ? String(activeData.caps.pension_uf) : ""
  );
  const [healthUf, setHealthUf] = useState(
    activeData?.caps?.health_uf ? String(activeData.caps.health_uf) : ""
  );
  const [workInjuryUf, setWorkInjuryUf] = useState(
    activeData?.caps?.work_injury_uf ? String(activeData.caps.work_injury_uf) : ""
  );
  const [afcUf, setAfcUf] = useState(activeData?.caps?.afc_uf ? String(activeData.caps.afc_uf) : "");
  const [commissions, setCommissions] = useState<Commission[]>(initCommissions);
  const [brackets, setBrackets] = useState<Bracket[]>(initBrackets);

  // Salud
  const pctStr = (v: number | undefined, digits = 2) =>
    v == null ? "" : (v * 100).toFixed(digits);
  const [fonasaRate, setFonasaRate] = useState(pctStr(activeData?.health?.fonasa?.rate));
  const [isapreMinRate, setIsapreMinRate] = useState(pctStr(activeData?.health?.isapre?.min_rate));

  // AFC — indefinite
  const [afcIndWCic, setAfcIndWCic] = useState(pctStr(activeData?.afc?.indefinite?.worker?.cic_rate));
  const [afcIndWFcs, setAfcIndWFcs] = useState(pctStr(activeData?.afc?.indefinite?.worker?.fcs_rate));
  const [afcIndECic, setAfcIndECic] = useState(pctStr(activeData?.afc?.indefinite?.employer?.cic_rate));
  const [afcIndEFcs, setAfcIndEFcs] = useState(pctStr(activeData?.afc?.indefinite?.employer?.fcs_rate));
  // AFC — fixed_term
  const [afcFtWCic, setAfcFtWCic] = useState(pctStr(activeData?.afc?.fixed_term?.worker?.cic_rate));
  const [afcFtWFcs, setAfcFtWFcs] = useState(pctStr(activeData?.afc?.fixed_term?.worker?.fcs_rate));
  const [afcFtECic, setAfcFtECic] = useState(pctStr(activeData?.afc?.fixed_term?.employer?.cic_rate));
  const [afcFtEFcs, setAfcFtEFcs] = useState(pctStr(activeData?.afc?.fixed_term?.employer?.fcs_rate));

  // Mutual / Work injury
  const [wiBase, setWiBase] = useState(pctStr(activeData?.work_injury?.base_rate));
  const [wiAdditional, setWiAdditional] = useState(pctStr(activeData?.work_injury?.additional_rate_default));
  const [wiEmployerDefault, setWiEmployerDefault] = useState(pctStr(activeData?.work_injury?.employer_rate_default));
  const [wiLow, setWiLow] = useState(pctStr(activeData?.work_injury?.risk_levels?.low));
  const [wiMedium, setWiMedium] = useState(pctStr(activeData?.work_injury?.risk_levels?.medium));
  const [wiHigh, setWiHigh] = useState(pctStr(activeData?.work_injury?.risk_levels?.high));
  const [wiSecurity, setWiSecurity] = useState(pctStr(activeData?.work_injury?.risk_levels?.security_industry));

  // Gratificación
  const [gratifMonthly, setGratifMonthly] = useState(
    pctStr(activeData?.gratification?.regime_25_monthly?.monthly_rate)
  );
  const [gratifCap, setGratifCap] = useState(
    activeData?.gratification?.regime_25_monthly?.annual_cap_imm_multiple
      ? String(activeData.gratification.regime_25_monthly.annual_cap_imm_multiple)
      : ""
  );
  const [setActiveFlag, setSetActiveFlag] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setCommissions(initCommissions);
    setBrackets(initBrackets);
  }, [initCommissions, initBrackets]);

  const submit = async () => {
    setError(null);
    setSuccess(null);
    if (!name || !effectiveFrom || !activeData) {
      setError(
        !activeData
          ? "Se requiere una versión activa como base. Contacta a un administrador."
          : "Nombre y vigente desde son requeridos"
      );
      return;
    }
    setSaving(true);
    try {
      const newData: PayrollParameters = {
        ...activeData,
        version_metadata: {
          ...activeData.version_metadata,
          name,
          effective_from: effectiveFrom,
          effective_until: null,
          source: "MANUAL",
        },
        imm: {
          ...activeData.imm,
          value_clp: Number(imm) || activeData.imm.value_clp,
          effective_from: effectiveFrom,
        },
        sis: {
          ...activeData.sis,
          employer_rate: Number(sisPct) / 100,
        },
        health: {
          fonasa: {
            ...activeData.health.fonasa,
            rate: Number(fonasaRate) / 100,
          },
          isapre: {
            ...activeData.health.isapre,
            min_rate: Number(isapreMinRate) / 100,
          },
        },
        afc: {
          indefinite: {
            worker: {
              ...activeData.afc.indefinite.worker,
              cic_rate: Number(afcIndWCic) / 100,
              fcs_rate: Number(afcIndWFcs) / 100,
              total_rate: (Number(afcIndWCic) + Number(afcIndWFcs)) / 100,
            },
            employer: {
              ...activeData.afc.indefinite.employer,
              cic_rate: Number(afcIndECic) / 100,
              fcs_rate: Number(afcIndEFcs) / 100,
              total_rate: (Number(afcIndECic) + Number(afcIndEFcs)) / 100,
            },
          },
          fixed_term: {
            worker: {
              ...activeData.afc.fixed_term.worker,
              cic_rate: Number(afcFtWCic) / 100,
              fcs_rate: Number(afcFtWFcs) / 100,
              total_rate: (Number(afcFtWCic) + Number(afcFtWFcs)) / 100,
            },
            employer: {
              ...activeData.afc.fixed_term.employer,
              cic_rate: Number(afcFtECic) / 100,
              fcs_rate: Number(afcFtEFcs) / 100,
              total_rate: (Number(afcFtECic) + Number(afcFtEFcs)) / 100,
            },
          },
        },
        work_injury: {
          ...activeData.work_injury,
          base_rate: Number(wiBase) / 100,
          additional_rate_default: Number(wiAdditional) / 100,
          employer_rate_default: Number(wiEmployerDefault) / 100,
          risk_levels: {
            low: Number(wiLow) / 100,
            medium: Number(wiMedium) / 100,
            high: Number(wiHigh) / 100,
            security_industry: Number(wiSecurity) / 100,
          },
        },
        gratification: {
          ...activeData.gratification,
          regime_25_monthly: {
            ...activeData.gratification.regime_25_monthly,
            monthly_rate: Number(gratifMonthly) / 100,
            annual_cap_imm_multiple:
              Number(gratifCap) || activeData.gratification.regime_25_monthly.annual_cap_imm_multiple,
          },
        },
        caps: {
          pension_uf: Number(pensionUf) || activeData.caps.pension_uf,
          health_uf: Number(healthUf) || activeData.caps.health_uf,
          work_injury_uf: Number(workInjuryUf) || activeData.caps.work_injury_uf,
          afc_uf: Number(afcUf) || activeData.caps.afc_uf,
        },
        afp: {
          ...activeData.afp,
          commissions: commissions.reduce((acc, c) => {
            if (!c.afp) return acc;
            acc[c.afp] = {
              commission_rate: Number(c.rate_pct) / 100,
              sis_included: false,
              last_updated: effectiveFrom,
            };
            return acc;
          }, {} as PayrollParameters["afp"]["commissions"]),
        },
        tax_brackets: brackets.map((b) => {
          const factor = Number(b.factor_pct) / 100;
          return {
            from_clp: Number(b.from) || 0,
            to_clp: b.to === "" ? null : Number(b.to),
            factor,
            rebate_clp: Number(b.rebate) || 0,
            effective_rate_max: factor,
          };
        }),
      };

      const res = await fetch("/api/payroll/parameters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          effective_from: effectiveFrom,
          data: newData,
          set_as_active: setActiveFlag,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
      }
      setSuccess("Versión creada correctamente");
      setName("");
      setEffectiveFrom("");
      setSetActiveFlag(false);
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!activeData;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear nueva versión de parámetros</CardTitle>
        <CardDescription>
          Crea una nueva versión partiendo de la activa. Solo los administradores pueden persistirla.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Nombre de versión</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2026-05" />
          </div>
          <div>
            <Label>Vigente desde</Label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>IMM (CLP)</Label>
            <Input type="number" value={imm} onChange={(e) => setImm(e.target.value)} />
          </div>
          <div>
            <Label>Tasa SIS empleador (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={sisPct}
              onChange={(e) => setSisPct(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label>AFP Base</Label>
          <div className="text-sm text-muted-foreground mt-1">10% (fijo por ley)</div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label>Comisiones AFP (%)</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCommissions((prev) => [...prev, { afp: "", rate_pct: "" }])}
            >
              + AFP
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {commissions.map((c, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input
                  placeholder="Nombre AFP"
                  value={c.afp}
                  onChange={(e) => {
                    const next = [...commissions];
                    next[idx] = { ...next[idx], afp: e.target.value };
                    setCommissions(next);
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="1.27"
                  value={c.rate_pct}
                  onChange={(e) => {
                    const next = [...commissions];
                    next[idx] = { ...next[idx], rate_pct: e.target.value };
                    setCommissions(next);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setCommissions(commissions.filter((_, i) => i !== idx))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-border" />

        <div>
          <div className="text-sm font-medium">Salud (cotización legal)</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fonasa (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={fonasaRate}
                onChange={(e) => setFonasaRate(e.target.value)}
                placeholder="7"
              />
            </div>
            <div>
              <Label className="text-xs">Isapre piso (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={isapreMinRate}
                onChange={(e) => setIsapreMinRate(e.target.value)}
                placeholder="7"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        <div>
          <div className="text-sm font-medium">AFC (Seguro de Cesantía)</div>
          <div className="text-xs text-muted-foreground">Tasas CIC y FCS por tipo de contrato</div>

          <div className="mt-3 space-y-3">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Contrato indefinido</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Trabajador CIC (%)</Label>
                  <Input type="number" step="0.01" value={afcIndWCic} onChange={(e) => setAfcIndWCic(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Trabajador FCS (%)</Label>
                  <Input type="number" step="0.01" value={afcIndWFcs} onChange={(e) => setAfcIndWFcs(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Empleador CIC (%)</Label>
                  <Input type="number" step="0.01" value={afcIndECic} onChange={(e) => setAfcIndECic(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Empleador FCS (%)</Label>
                  <Input type="number" step="0.01" value={afcIndEFcs} onChange={(e) => setAfcIndEFcs(e.target.value)} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Plazo fijo</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Trabajador CIC (%)</Label>
                  <Input type="number" step="0.01" value={afcFtWCic} onChange={(e) => setAfcFtWCic(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Trabajador FCS (%)</Label>
                  <Input type="number" step="0.01" value={afcFtWFcs} onChange={(e) => setAfcFtWFcs(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Empleador CIC (%)</Label>
                  <Input type="number" step="0.01" value={afcFtECic} onChange={(e) => setAfcFtECic(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Empleador FCS (%)</Label>
                  <Input type="number" step="0.01" value={afcFtEFcs} onChange={(e) => setAfcFtEFcs(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        <div>
          <div className="text-sm font-medium">Mutual (Ley 16.744)</div>
          <div className="mt-2 grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Base legal (%)</Label>
              <Input type="number" step="0.01" value={wiBase} onChange={(e) => setWiBase(e.target.value)} placeholder="0.93" />
            </div>
            <div>
              <Label className="text-xs">Adicional default (%)</Label>
              <Input type="number" step="0.01" value={wiAdditional} onChange={(e) => setWiAdditional(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Total default (%)</Label>
              <Input type="number" step="0.01" value={wiEmployerDefault} onChange={(e) => setWiEmployerDefault(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Bajo (%)</Label>
              <Input type="number" step="0.01" value={wiLow} onChange={(e) => setWiLow(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Medio (%)</Label>
              <Input type="number" step="0.01" value={wiMedium} onChange={(e) => setWiMedium(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Alto (%)</Label>
              <Input type="number" step="0.01" value={wiHigh} onChange={(e) => setWiHigh(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Seguridad privada (%)</Label>
              <Input type="number" step="0.01" value={wiSecurity} onChange={(e) => setWiSecurity(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        <div>
          <div className="text-sm font-medium">Gratificación Legal</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Tasa mensual (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={gratifMonthly}
                onChange={(e) => setGratifMonthly(e.target.value)}
                placeholder="25"
              />
              <div className="mt-1 text-xs text-muted-foreground">Art. 50 CT — usualmente 25%</div>
            </div>
            <div>
              <Label className="text-xs">Cap anual (× IMM)</Label>
              <Input
                type="number"
                step="0.01"
                value={gratifCap}
                onChange={(e) => setGratifCap(e.target.value)}
                placeholder="4.75"
              />
              <div className="mt-1 text-xs text-muted-foreground">Máximo mensual = (IMM × cap) / 12</div>
            </div>
          </div>
        </div>

        <div className="border-t border-border" />

        <div>
          <div className="flex items-center justify-between">
            <Label>Tramos impuesto único</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setBrackets((prev) => [
                  ...prev,
                  { from: "", to: "", factor_pct: "", rebate: "" },
                ])
              }
            >
              + Tramo
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
              <span>Desde CLP</span>
              <span>Hasta CLP (vacío = ∞)</span>
              <span>Factor (%)</span>
              <span>Rebaja CLP</span>
              <span />
            </div>
            {brackets.map((b, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                <Input
                  type="number"
                  value={b.from}
                  onChange={(e) => {
                    const next = [...brackets];
                    next[idx] = { ...next[idx], from: e.target.value };
                    setBrackets(next);
                  }}
                />
                <Input
                  type="number"
                  value={b.to}
                  onChange={(e) => {
                    const next = [...brackets];
                    next[idx] = { ...next[idx], to: e.target.value };
                    setBrackets(next);
                  }}
                />
                <Input
                  type="number"
                  step="0.01"
                  value={b.factor_pct}
                  onChange={(e) => {
                    const next = [...brackets];
                    next[idx] = { ...next[idx], factor_pct: e.target.value };
                    setBrackets(next);
                  }}
                />
                <Input
                  type="number"
                  value={b.rebate}
                  onChange={(e) => {
                    const next = [...brackets];
                    next[idx] = { ...next[idx], rebate: e.target.value };
                    setBrackets(next);
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setBrackets(brackets.filter((_, i) => i !== idx))}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Tope Pensión (UF)</Label>
            <Input
              type="number"
              step="0.01"
              value={pensionUf}
              onChange={(e) => setPensionUf(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Tope Salud (UF)</Label>
            <Input
              type="number"
              step="0.01"
              value={healthUf}
              onChange={(e) => setHealthUf(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Tope Mutual (UF)</Label>
            <Input
              type="number"
              step="0.01"
              value={workInjuryUf}
              onChange={(e) => setWorkInjuryUf(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Tope AFC (UF)</Label>
            <Input
              type="number"
              step="0.01"
              value={afcUf}
              onChange={(e) => setAfcUf(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={setActiveFlag}
            onChange={(e) => setSetActiveFlag(e.target.checked)}
          />
          Activar inmediatamente
        </label>
        {setActiveFlag && (
          <div className="text-xs text-status-warn-fg dark:text-status-warn-fg">
            Esto desactivará la versión actual.
          </div>
        )}

        {error && <div className="text-sm text-destructive">{error}</div>}
        {success && <div className="text-sm text-status-ok-fg dark:text-status-ok-fg">{success}</div>}

        <Button onClick={submit} disabled={saving || !canSubmit}>
          {saving ? "Creando…" : "Crear versión"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// VERSIONS MODE
// ============================================================================

function VersionsMode() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, PayrollParameters>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/payroll/parameters?active_only=false", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setVersions(data?.data?.all_versions ?? []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadDetail = async (id: string) => {
    if (detail[id]) {
      setExpanded(expanded === id ? null : id);
      return;
    }
    try {
      const res = await fetch(`/api/payroll/parameters?active_only=false`, { cache: "no-store" });
      // Endpoint returns summaries; fetch active-by-date via effective_date for the full data
      const v = versions.find((x) => x.id === id);
      if (!v) return;
      const resFull = await fetch(
        `/api/payroll/parameters?effective_date=${encodeURIComponent(v.effective_from)}`,
        { cache: "no-store" }
      );
      if (resFull.ok) {
        const data = await resFull.json();
        const fullData = data?.data?.current_version?.data;
        if (fullData) {
          setDetail((d) => ({ ...d, [id]: fullData }));
          setExpanded(id);
        }
      }
      void res;
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Cargando…</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Versiones de parámetros</CardTitle>
        <CardDescription>Historial completo con estado de vigencia.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && <div className="text-sm text-destructive mb-3">{error}</div>}
        {versions.length === 0 ? (
          <div className="text-sm text-muted-foreground">No hay versiones registradas.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Nombre</th>
                  <th className="py-2 pr-3">Vigente desde</th>
                  <th className="py-2 pr-3">Vigente hasta</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <Fragment key={v.id}>
                    <tr className="border-b border-border">
                      <td className="py-2 pr-3 font-medium">{v.name}</td>
                      <td className="py-2 pr-3">{v.effective_from}</td>
                      <td className="py-2 pr-3">{v.effective_until ?? "—"}</td>
                      <td className="py-2 pr-3">
                        {v.is_active ? (
                          <Badge>Activa</Badge>
                        ) : (
                          <Badge variant="secondary">Inactiva</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <Button size="sm" variant="outline" onClick={() => loadDetail(v.id)}>
                          {expanded === v.id ? "Ocultar datos" : "Ver datos"}
                        </Button>
                      </td>
                    </tr>
                    {expanded === v.id && detail[v.id] && (
                      <tr>
                        <td colSpan={5} className="py-2">
                          <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
                            {JSON.stringify(detail[v.id], null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
