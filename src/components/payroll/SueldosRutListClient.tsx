"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  Search,
  User,
  Building2,
  Calculator,
  AlertTriangle,
  Trash2,
  Eye,
  X,
} from "lucide-react";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

interface SueldoRut {
  structureId: string;
  guardiaId: string;
  guardiaStatus: string;
  rut: string;
  name: string;
  installationName: string | null;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: string;
  bonos: Array<{ name: string; bonoType: string; isTaxable: boolean; amount: number | null; percentage: number | null }>;
}

interface BonoCatalogItem {
  id: string;
  code: string;
  name: string;
  bonoType: string;
  isTaxable: boolean;
  defaultAmount: number | null;
  defaultPercentage: number | null;
}

interface BonoEntry {
  bonoCatalogId: string;
  overrideAmount?: number;
  overridePercentage?: number;
}

interface GuardSearchResult {
  id: string;
  rut: string;
  name: string;
  hasSalaryOverride: boolean;
}

interface NetEstimate {
  netSalary: number;
  grossSalary: number;
  totalDeductions: number;
  deductions: { afp: number; health: number; afc: number; tax: number };
}

function formatCLP(val: number): string {
  return `$${val.toLocaleString("es-CL")}`;
}

export function SueldosRutListClient() {
  const [sueldos, setSueldos] = useState<SueldoRut[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [searchGuard, setSearchGuard] = useState("");
  const [searchResults, setSearchResults] = useState<GuardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedGuard, setSelectedGuard] = useState<GuardSearchResult | null>(null);
  const [bonosCatalog, setBonosCatalog] = useState<BonoCatalogItem[]>([]);

  // Form
  const [formBaseSalary, setFormBaseSalary] = useState(0);
  const [formColacion, setFormColacion] = useState(0);
  const [formMovilizacion, setFormMovilizacion] = useState(0);
  const [formGratType, setFormGratType] = useState<"AUTO_25" | "CUSTOM">("AUTO_25");
  const [formGratAmount, setFormGratAmount] = useState(0);
  const [formBonos, setFormBonos] = useState<BonoEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [netEstimate, setNetEstimate] = useState<NetEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const selectClass = "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

  const loadSueldos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/sueldos-rut");
      if (res.ok) {
        const json = await res.json();
        setSueldos(json.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSueldos(); }, [loadSueldos]);

  const searchGuards = async (term: string) => {
    if (term.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/personas/guardias?search=${encodeURIComponent(term)}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        const guards = (json.data || []).map((g: any) => ({
          id: g.id,
          rut: g.persona?.rut || "",
          name: `${g.persona?.firstName || ""} ${g.persona?.lastName || ""}`.trim(),
          hasSalaryOverride: !!g.salaryStructureId,
        }));
        setSearchResults(guards);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearching(false);
    }
  };

  const openCreateFlow = async () => {
    setSelectedGuard(null);
    setSearchGuard("");
    setSearchResults([]);
    setFormBaseSalary(0);
    setFormColacion(0);
    setFormMovilizacion(0);
    setFormGratType("AUTO_25");
    setFormGratAmount(0);
    setFormBonos([]);
    setNetEstimate(null);
    try {
      const res = await fetch("/api/payroll/bonos?active=true");
      if (res.ok) {
        const json = await res.json();
        setBonosCatalog(json.data || []);
      }
    } catch { /* ignore */ }
    setCreateOpen(true);
  };

  const selectGuard = (g: GuardSearchResult) => {
    if (g.hasSalaryOverride) {
      alert("Este guardia ya tiene un sueldo por RUT configurado. Edítalo desde su ficha.");
      return;
    }
    setSelectedGuard(g);
    setCreateOpen(false);
    setConfirmOpen(true);
  };

  const confirmAndOpenForm = () => {
    setConfirmOpen(false);
    setCreateOpen(true);
  };

  const calculateNet = async () => {
    if (formBaseSalary <= 0) return;
    setEstimating(true);
    try {
      let bonosImp = 0, bonosNoImp = 0;
      for (const b of formBonos) {
        const cat = bonosCatalog.find((c) => c.id === b.bonoCatalogId);
        if (!cat) continue;
        let amt = 0;
        if (cat.bonoType === "FIJO") amt = b.overrideAmount ?? Number(cat.defaultAmount) ?? 0;
        else if (cat.bonoType === "PORCENTUAL") amt = Math.round(formBaseSalary * (b.overridePercentage ?? Number(cat.defaultPercentage) ?? 0) / 100);
        else amt = b.overrideAmount ?? Number(cat.defaultAmount) ?? 0;
        if (cat.isTaxable) bonosImp += amt; else bonosNoImp += amt;
      }
      const res = await fetch("/api/payroll/estimate-net", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: formBaseSalary, colacion: formColacion, movilizacion: formMovilizacion,
          gratificationType: formGratType, gratificationCustomAmount: formGratAmount,
          bonosImponibles: bonosImp, bonosNoImponibles: bonosNoImp,
        }),
      });
      if (res.ok) { const json = await res.json(); setNetEstimate(json.data); }
    } catch (err) { console.error(err); }
    finally { setEstimating(false); }
  };

  const handleSave = async () => {
    if (!selectedGuard || formBaseSalary <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/personas/guardias/${selectedGuard.id}/salary-structure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: formBaseSalary,
          colacion: formColacion,
          movilizacion: formMovilizacion,
          gratificationType: formGratType,
          gratificationCustomAmount: formGratAmount,
          bonos: formBonos.filter((b) => b.bonoCatalogId),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error al guardar");
        return;
      }
      setCreateOpen(false);
      setSelectedGuard(null);
      await loadSueldos();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: SueldoRut) => {
    if (!confirm(`¿Eliminar el sueldo por RUT de ${s.name}? Volverá a heredar el sueldo de la instalación.`)) return;
    try {
      const res = await fetch(`/api/personas/guardias/${s.guardiaId}/salary-structure`, { method: "DELETE" });
      if (res.ok) await loadSueldos();
      else { const json = await res.json(); alert(json.error || "Error"); }
    } catch (err) { console.error(err); }
  };

  const filtered = searchTerm
    ? sueldos.filter((s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.rut.includes(searchTerm)
      )
    : sueldos;

  return (
    <div className="space-y-4">
      {/* Search + Add */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o RUT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button size="sm" onClick={openCreateFlow}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo sueldo por RUT
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {searchTerm ? "No se encontraron resultados." : "No hay sueldos por RUT configurados. Usa el botón para crear el primero."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const totalBonos = s.bonos.reduce((sum, b) => sum + (b.amount || 0), 0);
            const totalHaberes = s.baseSalary + s.colacion + s.movilizacion + totalBonos;
            return (
              <Card key={s.structureId} className="hover:bg-accent/20 transition-colors">
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/personas/guardias/${s.guardiaId}`} className="font-medium text-sm hover:underline">
                        {s.name}
                      </Link>
                      <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                        RUT
                      </Badge>
                      {s.guardiaStatus !== "active" && (
                        <Badge variant="destructive" className="text-[9px]">Inactivo</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">{s.rut}</p>
                    {s.installationName && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Building2 className="h-2.5 w-2.5" />
                        {s.installationName}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Sueldo base</p>
                    <p className="text-sm font-semibold">{formatCLP(s.baseSalary)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Total haberes</p>
                    <p className="text-sm font-semibold text-emerald-400">{formatCLP(totalHaberes)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/personas/guardias/${s.guardiaId}`}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver ficha">
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              Sueldo por RUT
            </DialogTitle>
            <DialogDescription>
              Al ingresar un sueldo por RUT para <strong>{selectedGuard?.name}</strong> ({selectedGuard?.rut}),
              este tendrá <strong>prioridad</strong> sobre el sueldo de la instalación asignada.
              El sueldo de la instalación seguirá existiendo pero no se usará para este guardia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAndOpenForm}>Entendido, continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGuard ? `Sueldo por RUT - ${selectedGuard.name}` : "Nuevo sueldo por RUT"}
            </DialogTitle>
          </DialogHeader>

          {!selectedGuard ? (
            /* Step 1: Search guard */
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Buscar guardia por nombre o RUT</Label>
                <Input
                  placeholder="Ej: Cedeño o 26746990"
                  value={searchGuard}
                  onChange={(e) => { setSearchGuard(e.target.value); searchGuards(e.target.value); }}
                  className="h-10"
                  autoFocus
                />
              </div>
              {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {searchResults.map((g) => (
                    <div
                      key={g.id}
                      className={`flex items-center justify-between rounded-md border p-2 cursor-pointer transition-colors ${
                        g.hasSalaryOverride ? "opacity-50" : "hover:bg-accent/40"
                      }`}
                      onClick={() => selectGuard(g)}
                    >
                      <div>
                        <p className="text-sm font-medium">{g.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{g.rut}</p>
                      </div>
                      {g.hasSalaryOverride && (
                        <Badge className="text-[9px] bg-amber-500/15 text-amber-400">Ya tiene sueldo RUT</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Step 2: Salary form */
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div>
                  <p className="font-semibold">{selectedGuard.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedGuard.rut}</p>
                </div>
                <Badge className="ml-auto bg-amber-500/15 text-amber-400 border-amber-500/30">Sueldo por RUT</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Sueldo base *</Label>
                  <Input type="text" inputMode="numeric"
                    value={formatNumber(formBaseSalary, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setFormBaseSalary(parseLocalizedNumber(e.target.value))}
                    className="h-9 bg-background text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Colación</Label>
                  <Input type="text" inputMode="numeric"
                    value={formatNumber(formColacion, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setFormColacion(parseLocalizedNumber(e.target.value))}
                    className="h-9 bg-background text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Movilización</Label>
                  <Input type="text" inputMode="numeric"
                    value={formatNumber(formMovilizacion, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setFormMovilizacion(parseLocalizedNumber(e.target.value))}
                    className="h-9 bg-background text-sm" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Gratificación</Label>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant={formGratType === "AUTO_25" ? "default" : "outline"} className="h-7 px-2.5 text-[10px]" onClick={() => setFormGratType("AUTO_25")}>Auto 25%</Button>
                    <Button type="button" size="sm" variant={formGratType === "CUSTOM" ? "default" : "outline"} className="h-7 px-2.5 text-[10px]" onClick={() => setFormGratType("CUSTOM")}>Monto fijo</Button>
                  </div>
                </div>
                {formGratType === "CUSTOM" && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Monto gratificación</Label>
                    <Input type="text" inputMode="numeric"
                      value={formatNumber(formGratAmount, { minDecimals: 0, maxDecimals: 0 })}
                      onChange={(e) => setFormGratAmount(parseLocalizedNumber(e.target.value))}
                      className="h-9 bg-background text-sm" />
                  </div>
                )}
              </div>

              {/* Bonos */}
              {bonosCatalog.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-[10px] text-muted-foreground">Bonos</Label>
                  {formBonos.map((bono, idx) => {
                    const cat = bonosCatalog.find((c) => c.id === bono.bonoCatalogId);
                    return (
                      <div key={idx} className="flex items-center gap-2">
                        <select className="flex h-8 flex-1 rounded-md border border-input bg-card px-2 text-xs" value={bono.bonoCatalogId}
                          onChange={(e) => {
                            const nb = [...formBonos];
                            const nc = bonosCatalog.find((c) => c.id === e.target.value);
                            nb[idx] = { bonoCatalogId: e.target.value, overrideAmount: nc?.defaultAmount != null ? Number(nc.defaultAmount) : undefined, overridePercentage: nc?.defaultPercentage != null ? Number(nc.defaultPercentage) : undefined };
                            setFormBonos(nb);
                          }}>
                          <option value="">Selecciona bono...</option>
                          {bonosCatalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        {cat && (cat.bonoType === "FIJO" || cat.bonoType === "CONDICIONAL") && (
                          <Input type="text" inputMode="numeric" placeholder="Monto"
                            value={bono.overrideAmount != null ? formatNumber(bono.overrideAmount, { minDecimals: 0, maxDecimals: 0 }) : ""}
                            onChange={(e) => { const nb = [...formBonos]; nb[idx] = { ...nb[idx], overrideAmount: parseLocalizedNumber(e.target.value) }; setFormBonos(nb); }}
                            className="h-8 w-28 bg-background text-xs" />
                        )}
                        {cat && cat.bonoType === "PORCENTUAL" && (
                          <div className="flex items-center gap-1">
                            <Input type="number" step="0.1" value={bono.overridePercentage ?? ""}
                              onChange={(e) => { const nb = [...formBonos]; nb[idx] = { ...nb[idx], overridePercentage: Number(e.target.value) }; setFormBonos(nb); }}
                              className="h-8 w-20 bg-background text-xs" />
                            <span className="text-[10px] text-muted-foreground">%</span>
                          </div>
                        )}
                        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive"
                          onClick={() => setFormBonos(formBonos.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={() => setFormBonos([...formBonos, { bonoCatalogId: "" }])}>
                    <Plus className="mr-1 h-3 w-3" /> Agregar bono
                  </Button>
                </div>
              )}

              {/* Calculate */}
              <div className="flex items-center gap-3 border-t border-border pt-3">
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={calculateNet} disabled={estimating || formBaseSalary <= 0}>
                  {estimating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-1.5 h-3.5 w-3.5" />}
                  Calcular sueldo líquido
                </Button>
                {netEstimate && (
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">Bruto: <strong className="text-foreground">{formatCLP(netEstimate.grossSalary)}</strong></span>
                    <span className="text-muted-foreground">Líquido: <strong className="text-emerald-400">{formatCLP(netEstimate.netSalary)}</strong></span>
                  </div>
                )}
              </div>

              {netEstimate && (
                <div className="rounded-md border border-border/50 bg-muted/20 p-2.5 text-[10px] text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1">
                  <span>AFP: -{formatCLP(netEstimate.deductions.afp)}</span>
                  <span>Salud: -{formatCLP(netEstimate.deductions.health)}</span>
                  <span>AFC: -{formatCLP(netEstimate.deductions.afc)}</span>
                  <span>Imp. Único: -{formatCLP(netEstimate.deductions.tax)}</span>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); setSelectedGuard(null); }} disabled={saving}>Cancelar</Button>
                <Button onClick={handleSave} disabled={saving || formBaseSalary <= 0}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Guardar sueldo por RUT
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
