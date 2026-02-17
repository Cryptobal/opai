"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  Calculator,
  Plus,
  X,
  AlertTriangle,
  Building2,
  User,
  Trash2,
  Pencil,
} from "lucide-react";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

/* ── Types ──────────────────────────── */

interface ResolvedSalary {
  source: "RUT" | "PUESTO" | "NONE";
  structureId: string | null;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: string;
  gratificationCustomAmount: number;
  bonos: Array<{
    bonoCatalogId: string;
    bonoName: string;
    bonoType: string;
    isTaxable: boolean;
    amount: number;
    percentage: number | null;
  }>;
  installationId: string | null;
  installationName: string | null;
  puestoId: string | null;
  puestoName: string | null;
  hasRutOverride: boolean;
}

type BonoCatalogItem = {
  id: string;
  code: string;
  name: string;
  bonoType: string;
  isTaxable: boolean;
  defaultAmount: number | null;
  defaultPercentage: number | null;
};

interface BonoEntry {
  bonoCatalogId: string;
  overrideAmount?: number;
  overridePercentage?: number;
}

interface SalaryFormData {
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: "AUTO_25" | "CUSTOM";
  gratificationCustomAmount: number;
  bonos: BonoEntry[];
}

/* ── Component ──────────────────────── */

export function GuardiaSalaryTab({ guardiaId }: { guardiaId: string }) {
  const [salary, setSalary] = useState<ResolvedSalary | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bonosCatalog, setBonosCatalog] = useState<BonoCatalogItem[]>([]);
  const [form, setForm] = useState<SalaryFormData>({
    baseSalary: 0,
    colacion: 0,
    movilizacion: 0,
    gratificationType: "AUTO_25",
    gratificationCustomAmount: 0,
    bonos: [],
  });
  const [netEstimate, setNetEstimate] = useState<{
    netSalary: number;
    grossSalary: number;
    totalDeductions: number;
    deductions: { afp: number; health: number; afc: number; tax: number };
  } | null>(null);
  const [estimating, setEstimating] = useState(false);

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

  const loadSalary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/salary-structure`);
      if (res.ok) {
        const json = await res.json();
        setSalary(json.data);
      }
    } catch (err) {
      console.error("Error loading salary:", err);
    } finally {
      setLoading(false);
    }
  }, [guardiaId]);

  useEffect(() => {
    loadSalary();
  }, [loadSalary]);

  const openCreateModal = async () => {
    setIsEditing(false);
    setForm({
      baseSalary: salary?.baseSalary ?? 0,
      colacion: salary?.colacion ?? 0,
      movilizacion: salary?.movilizacion ?? 0,
      gratificationType: (salary?.gratificationType as "AUTO_25" | "CUSTOM") ?? "AUTO_25",
      gratificationCustomAmount: salary?.gratificationCustomAmount ?? 0,
      bonos: salary?.bonos?.map((b) => ({
        bonoCatalogId: b.bonoCatalogId,
        overrideAmount: b.amount,
      })) ?? [],
    });
    setNetEstimate(null);
    // Load bonos catalog
    try {
      const res = await fetch("/api/payroll/bonos?active=true");
      if (res.ok) {
        const json = await res.json();
        setBonosCatalog(json.data || []);
      }
    } catch { /* ignore */ }
    setConfirmOpen(true);
  };

  const openEditModal = async () => {
    if (!salary) return;
    setIsEditing(true);
    setForm({
      baseSalary: salary.baseSalary,
      colacion: salary.colacion,
      movilizacion: salary.movilizacion,
      gratificationType: salary.gratificationType as "AUTO_25" | "CUSTOM",
      gratificationCustomAmount: salary.gratificationCustomAmount,
      bonos: salary.bonos.map((b) => ({
        bonoCatalogId: b.bonoCatalogId,
        overrideAmount: b.amount,
        overridePercentage: b.percentage ?? undefined,
      })),
    });
    setNetEstimate(null);
    try {
      const res = await fetch("/api/payroll/bonos?active=true");
      if (res.ok) {
        const json = await res.json();
        setBonosCatalog(json.data || []);
      }
    } catch { /* ignore */ }
    setModalOpen(true);
  };

  const handleConfirmAndOpen = () => {
    setConfirmOpen(false);
    setModalOpen(true);
  };

  const calculateNetEstimate = async () => {
    if (form.baseSalary <= 0) return;
    setEstimating(true);
    try {
      let bonosImponibles = 0;
      let bonosNoImponibles = 0;
      for (const b of form.bonos) {
        const cat = bonosCatalog.find((c) => c.id === b.bonoCatalogId);
        if (!cat) continue;
        let amt = 0;
        if (cat.bonoType === "FIJO") amt = b.overrideAmount ?? Number(cat.defaultAmount) ?? 0;
        else if (cat.bonoType === "PORCENTUAL") {
          const pct = b.overridePercentage ?? Number(cat.defaultPercentage) ?? 0;
          amt = Math.round(form.baseSalary * pct / 100);
        } else if (cat.bonoType === "CONDICIONAL") {
          amt = b.overrideAmount ?? Number(cat.defaultAmount) ?? 0;
        }
        if (cat.isTaxable) bonosImponibles += amt;
        else bonosNoImponibles += amt;
      }
      const res = await fetch("/api/payroll/estimate-net", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: form.baseSalary,
          colacion: form.colacion,
          movilizacion: form.movilizacion,
          gratificationType: form.gratificationType,
          gratificationCustomAmount: form.gratificationCustomAmount,
          bonosImponibles,
          bonosNoImponibles,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setNetEstimate(json.data);
      }
    } catch (err) {
      console.error("Error estimating:", err);
    } finally {
      setEstimating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(`/api/personas/guardias/${guardiaId}/salary-structure`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: form.baseSalary,
          colacion: form.colacion,
          movilizacion: form.movilizacion,
          gratificationType: form.gratificationType,
          gratificationCustomAmount: form.gratificationCustomAmount,
          bonos: form.bonos.filter((b) => b.bonoCatalogId),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error al guardar");
        return;
      }
      setModalOpen(false);
      await loadSalary();
    } catch (err) {
      console.error("Error saving:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOverride = async () => {
    if (!confirm("¿Eliminar el sueldo por RUT? El guardia heredará el sueldo de la instalación.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardiaId}/salary-structure`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error al eliminar");
        return;
      }
      await loadSalary();
    } catch (err) {
      console.error("Error deleting:", err);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!salary || salary.source === "NONE") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No hay estructura de sueldo definida. El guardia no tiene asignación activa o el puesto no tiene sueldo configurado.
        </p>
        <Button size="sm" onClick={openCreateModal}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Crear sueldo por RUT
        </Button>
      </div>
    );
  }

  const totalBonos = salary.bonos.reduce((sum, b) => sum + b.amount, 0);
  const totalHaberes = salary.baseSalary + salary.colacion + salary.movilizacion + totalBonos;

  return (
    <div className="space-y-4">
      {/* Source badge */}
      <div className="flex items-center gap-2">
        {salary.source === "RUT" ? (
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">
            <User className="mr-1 h-3 w-3" />
            Sueldo por RUT
          </Badge>
        ) : (
          <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
            <Building2 className="mr-1 h-3 w-3" />
            Sueldo por Instalación
          </Badge>
        )}
        {salary.installationName && (
          <span className="text-xs text-muted-foreground">
            {salary.installationName} · {salary.puestoName}
          </span>
        )}
      </div>

      {/* Salary breakdown */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sueldo base</p>
              <p className="text-sm font-medium">${salary.baseSalary.toLocaleString("es-CL")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Colación</p>
              <p className="text-sm font-medium">${salary.colacion.toLocaleString("es-CL")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Movilización</p>
              <p className="text-sm font-medium">${salary.movilizacion.toLocaleString("es-CL")}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total haberes</p>
              <p className="text-sm font-semibold text-emerald-400">${totalHaberes.toLocaleString("es-CL")}</p>
            </div>
          </div>

          {salary.bonos.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Bonos</p>
              <div className="space-y-1">
                {salary.bonos.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {b.bonoName}
                      {b.percentage != null && <span className="ml-1 text-[10px]">({b.percentage}%)</span>}
                    </span>
                    <span className="font-medium">
                      ${b.amount.toLocaleString("es-CL")}
                      <Badge variant="outline" className="ml-1 text-[8px]">
                        {b.isTaxable ? "Imp" : "No imp"}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {salary.hasRutOverride ? (
          <>
            <Button size="sm" variant="outline" onClick={openEditModal}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar sueldo por RUT
            </Button>
            <Button size="sm" variant="outline" className="text-destructive" onClick={handleDeleteOverride} disabled={deleting}>
              {deleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
              Eliminar override
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={openCreateModal}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Crear sueldo por RUT
          </Button>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Sueldo por RUT
            </DialogTitle>
            <DialogDescription>
              Al ingresar un sueldo por RUT, este tendrá <strong>prioridad</strong> sobre el sueldo
              de la instalación asignada al guardia. El sueldo de la instalación seguirá existiendo
              pero no se usará para este guardia en el cálculo de liquidaciones.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmAndOpen}>
              Entendido, continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Editar sueldo por RUT" : "Crear sueldo por RUT"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Sueldo base *</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.baseSalary, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => setForm((p) => ({ ...p, baseSalary: parseLocalizedNumber(e.target.value) }))}
                  className="h-9 bg-background text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Colación</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.colacion, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => setForm((p) => ({ ...p, colacion: parseLocalizedNumber(e.target.value) }))}
                  className="h-9 bg-background text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Movilización</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.movilizacion, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) => setForm((p) => ({ ...p, movilizacion: parseLocalizedNumber(e.target.value) }))}
                  className="h-9 bg-background text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Gratificación</Label>
                <div className="flex gap-1.5">
                  <Button type="button" size="sm" variant={form.gratificationType === "AUTO_25" ? "default" : "outline"} className="h-7 px-2.5 text-[10px]" onClick={() => setForm((p) => ({ ...p, gratificationType: "AUTO_25" }))}>
                    Auto 25%
                  </Button>
                  <Button type="button" size="sm" variant={form.gratificationType === "CUSTOM" ? "default" : "outline"} className="h-7 px-2.5 text-[10px]" onClick={() => setForm((p) => ({ ...p, gratificationType: "CUSTOM" }))}>
                    Monto fijo
                  </Button>
                </div>
              </div>
              {form.gratificationType === "CUSTOM" && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Monto gratificación</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={formatNumber(form.gratificationCustomAmount, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setForm((p) => ({ ...p, gratificationCustomAmount: parseLocalizedNumber(e.target.value) }))}
                    className="h-9 bg-background text-sm"
                  />
                </div>
              )}
            </div>

            {/* Bonos */}
            {bonosCatalog.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">Bonos</Label>
                {form.bonos.map((bono, idx) => {
                  const cat = bonosCatalog.find((c) => c.id === bono.bonoCatalogId);
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        className="flex h-8 flex-1 rounded-md border border-input bg-card px-2 text-xs"
                        value={bono.bonoCatalogId}
                        onChange={(e) => {
                          const newBonos = [...form.bonos];
                          const newCat = bonosCatalog.find((c) => c.id === e.target.value);
                          newBonos[idx] = {
                            bonoCatalogId: e.target.value,
                            overrideAmount: newCat?.defaultAmount != null ? Number(newCat.defaultAmount) : undefined,
                            overridePercentage: newCat?.defaultPercentage != null ? Number(newCat.defaultPercentage) : undefined,
                          };
                          setForm((p) => ({ ...p, bonos: newBonos }));
                        }}
                      >
                        <option value="">Selecciona bono...</option>
                        {bonosCatalog.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {cat && (cat.bonoType === "FIJO" || cat.bonoType === "CONDICIONAL") && (
                        <Input
                          type="text"
                          inputMode="numeric"
                          placeholder="Monto"
                          value={bono.overrideAmount != null ? formatNumber(bono.overrideAmount, { minDecimals: 0, maxDecimals: 0 }) : ""}
                          onChange={(e) => {
                            const newBonos = [...form.bonos];
                            newBonos[idx] = { ...newBonos[idx], overrideAmount: parseLocalizedNumber(e.target.value) };
                            setForm((p) => ({ ...p, bonos: newBonos }));
                          }}
                          className="h-8 w-28 bg-background text-xs"
                        />
                      )}
                      {cat && cat.bonoType === "PORCENTUAL" && (
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.1"
                            value={bono.overridePercentage ?? ""}
                            onChange={(e) => {
                              const newBonos = [...form.bonos];
                              newBonos[idx] = { ...newBonos[idx], overridePercentage: Number(e.target.value) };
                              setForm((p) => ({ ...p, bonos: newBonos }));
                            }}
                            className="h-8 w-20 bg-background text-xs"
                          />
                          <span className="text-[10px] text-muted-foreground">%</span>
                        </div>
                      )}
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" onClick={() => {
                        setForm((p) => ({ ...p, bonos: p.bonos.filter((_, i) => i !== idx) }));
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
                <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setForm((p) => ({ ...p, bonos: [...p.bonos, { bonoCatalogId: "" }] }))}>
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar bono
                </Button>
              </div>
            )}

            {/* Calcular */}
            <div className="flex items-center gap-3 border-t border-border pt-3">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={calculateNetEstimate} disabled={estimating || form.baseSalary <= 0}>
                {estimating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-1.5 h-3.5 w-3.5" />}
                Calcular sueldo líquido
              </Button>
              {netEstimate && (
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Bruto: <strong className="text-foreground">${netEstimate.grossSalary.toLocaleString("es-CL")}</strong></span>
                  <span className="text-muted-foreground">Líquido: <strong className="text-emerald-400">${netEstimate.netSalary.toLocaleString("es-CL")}</strong></span>
                </div>
              )}
            </div>

            {netEstimate && (
              <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 text-[10px] text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                <span>AFP: -${netEstimate.deductions.afp.toLocaleString("es-CL")}</span>
                <span>Salud: -${netEstimate.deductions.health.toLocaleString("es-CL")}</span>
                <span>AFC: -${netEstimate.deductions.afc.toLocaleString("es-CL")}</span>
                <span>Imp. Único: -${netEstimate.deductions.tax.toLocaleString("es-CL")}</span>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || form.baseSalary <= 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Actualizar" : "Crear sueldo por RUT"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
