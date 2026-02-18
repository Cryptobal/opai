"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
  CalendarDays,
  Ban,
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
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  bonos: Array<{ name: string; bonoType: string; isTaxable: boolean; amount: number | null; percentage: number | null }>;
}

interface BonoCatalogItem {
  id: string; code: string; name: string; bonoType: string; isTaxable: boolean;
  defaultAmount: number | null; defaultPercentage: number | null;
}

interface BonoEntry { bonoCatalogId: string; overrideAmount?: number; overridePercentage?: number; }

interface GuardSearchResult { id: string; rut: string; name: string; hasSalaryOverride: boolean; }

interface NetEstimate {
  netSalary: number; grossSalary: number; totalDeductions: number;
  deductions: { afp: number; health: number; afc: number; tax: number };
  breakdown: { baseSalary: number; gratification: number; colacion: number; movilizacion: number };
}

function formatCLP(val: number): string { return `$${val.toLocaleString("es-CL")}`; }
function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(typeof d === "string" ? d.slice(0, 10) + "T12:00:00Z" : d);
  return `${dt.getUTCDate().toString().padStart(2, "0")}/${(dt.getUTCMonth() + 1).toString().padStart(2, "0")}/${dt.getUTCFullYear()}`;
}

export function SueldosRutListClient() {
  const [sueldos, setSueldos] = useState<SueldoRut[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SueldoRut | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<SueldoRut | null>(null);
  const [deactivateDate, setDeactivateDate] = useState(new Date().toISOString().slice(0, 10));
  const [searchGuard, setSearchGuard] = useState("");
  const [searchResults, setSearchResults] = useState<GuardSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedGuard, setSelectedGuard] = useState<GuardSearchResult | null>(null);
  const [bonosCatalog, setBonosCatalog] = useState<BonoCatalogItem[]>([]);

  const [formBaseSalary, setFormBaseSalary] = useState(0);
  const [formColacion, setFormColacion] = useState(0);
  const [formMovilizacion, setFormMovilizacion] = useState(0);
  const [formGratType, setFormGratType] = useState<"AUTO_25" | "CUSTOM">("AUTO_25");
  const [formGratAmount, setFormGratAmount] = useState(0);
  const [formBonos, setFormBonos] = useState<BonoEntry[]>([]);
  const [formDateFrom, setFormDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [formDateUntil, setFormDateUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [netEstimate, setNetEstimate] = useState<NetEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);

  const selectClass = "flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm";

  const loadSueldos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payroll/sueldos-rut${showInactive ? "?inactive=true" : ""}`);
      if (res.ok) { const json = await res.json(); setSueldos(json.data || []); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [showInactive]);

  useEffect(() => { loadSueldos(); }, [loadSueldos]);

  const searchGuards = async (term: string) => {
    if (term.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/personas/guardias?search=${encodeURIComponent(term)}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults((json.data || []).map((g: any) => ({
          id: g.id, rut: g.persona?.rut || "",
          name: `${g.persona?.firstName || ""} ${g.persona?.lastName || ""}`.trim(),
          hasSalaryOverride: !!g.salaryStructureId,
        })));
      }
    } catch (err) { console.error(err); }
    finally { setSearching(false); }
  };

  const openCreateFlow = async () => {
    setSelectedGuard(null); setSearchGuard(""); setSearchResults([]);
    setFormBaseSalary(0); setFormColacion(0); setFormMovilizacion(0);
    setFormGratType("AUTO_25"); setFormGratAmount(0); setFormBonos([]);
    setFormDateFrom(new Date().toISOString().slice(0, 10)); setFormDateUntil("");
    setNetEstimate(null);
    try { const r = await fetch("/api/payroll/bonos?active=true"); if (r.ok) setBonosCatalog((await r.json()).data || []); } catch {}
    setCreateOpen(true);
  };

  const selectGuard = (g: GuardSearchResult) => {
    if (g.hasSalaryOverride) { alert("Este guardia ya tiene un sueldo por RUT. Edítalo desde su ficha."); return; }
    setSelectedGuard(g); setCreateOpen(false); setConfirmOpen(true);
  };

  const confirmAndOpenForm = () => { setConfirmOpen(false); setCreateOpen(true); };

  const calculateNet = async () => {
    if (formBaseSalary <= 0) return;
    setEstimating(true);
    try {
      let bonosImp = 0, bonosNoImp = 0;
      for (const b of formBonos) {
        const cat = bonosCatalog.find((c) => c.id === b.bonoCatalogId);
        if (!cat) continue;
        const amt = cat.bonoType === "PORCENTUAL"
          ? Math.round(formBaseSalary * (b.overridePercentage ?? Number(cat.defaultPercentage) ?? 0) / 100)
          : (b.overrideAmount ?? Number(cat.defaultAmount) ?? 0);
        if (cat.isTaxable) bonosImp += amt; else bonosNoImp += amt;
      }
      const res = await fetch("/api/payroll/estimate-net", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseSalary: formBaseSalary, colacion: formColacion, movilizacion: formMovilizacion,
          gratificationType: formGratType, gratificationCustomAmount: formGratAmount,
          bonosImponibles: bonosImp, bonosNoImponibles: bonosNoImp }),
      });
      if (res.ok) setNetEstimate((await res.json()).data);
    } catch (err) { console.error(err); }
    finally { setEstimating(false); }
  };

  const handleSave = async () => {
    if (!selectedGuard || formBaseSalary <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/personas/guardias/${selectedGuard.id}/salary-structure`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: formBaseSalary, colacion: formColacion, movilizacion: formMovilizacion,
          gratificationType: formGratType, gratificationCustomAmount: formGratAmount,
          bonos: formBonos.filter((b) => b.bonoCatalogId),
          effectiveFrom: formDateFrom || null, effectiveUntil: formDateUntil || null,
        }),
      });
      if (!res.ok) { alert((await res.json()).error || "Error"); return; }
      setCreateOpen(false); setSelectedGuard(null); await loadSueldos();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivateConfirm) return;
    try {
      const res = await fetch(`/api/personas/guardias/${deactivateConfirm.guardiaId}/salary-structure`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effectiveUntil: deactivateDate, isActive: false }),
      });
      if (res.ok) { setDeactivateConfirm(null); await loadSueldos(); }
      else alert((await res.json()).error || "Error");
    } catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/personas/guardias/${deleteConfirm.guardiaId}/salary-structure`, { method: "DELETE" });
      if (res.ok) { setDeleteConfirm(null); await loadSueldos(); }
      else alert((await res.json()).error || "Error");
    } catch (err) { console.error(err); }
  };

  const filtered = searchTerm
    ? sueldos.filter((s) => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.rut.includes(searchTerm))
    : sueldos;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o RUT..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant={showInactive ? "default" : "outline"} className="h-8 text-xs"
            onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? "Mostrando todos" : "Mostrar inactivos"}
          </Button>
        </div>
        <Button size="sm" onClick={openCreateFlow}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuevo sueldo por RUT
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          {searchTerm ? "No se encontraron resultados." : "No hay sueldos por RUT configurados."}
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const totalBonos = s.bonos.reduce((sum, b) => sum + (b.amount || 0), 0);
            const totalHaberes = s.baseSalary + s.colacion + s.movilizacion + totalBonos;
            return (
              <Card key={s.structureId} className={`transition-colors ${!s.isActive ? "opacity-60" : "hover:bg-accent/20"}`}>
                <CardContent className="pt-4 pb-4 flex items-center gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${s.isActive ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"}`}>
                    <User className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link href={`/personas/guardias/${s.guardiaId}`} className="font-medium text-sm hover:underline">{s.name}</Link>
                      <Badge className="text-[9px] bg-amber-500/15 text-amber-400 border-amber-500/30">RUT</Badge>
                      {!s.isActive && <Badge variant="outline" className="text-[9px] text-muted-foreground">Inactivo</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground font-mono">{s.rut}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                      {s.installationName && (
                        <span className="flex items-center gap-0.5"><Building2 className="h-2.5 w-2.5" />{s.installationName}</span>
                      )}
                      <span className="flex items-center gap-0.5">
                        <CalendarDays className="h-2.5 w-2.5" />
                        Desde {fmtDate(s.effectiveFrom)}
                        {s.effectiveUntil && <> hasta {fmtDate(s.effectiveUntil)}</>}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Base</p>
                    <p className="text-sm font-semibold">{formatCLP(s.baseSalary)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-sm font-semibold text-emerald-400">{formatCLP(totalHaberes)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Link href={`/personas/guardias/${s.guardiaId}`}>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver ficha"><Eye className="h-3.5 w-3.5" /></Button>
                    </Link>
                    {s.isActive && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-400" title="Desactivar"
                        onClick={() => { setDeactivateDate(new Date().toISOString().slice(0, 10)); setDeactivateConfirm(s); }}>
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Eliminar"
                      onClick={() => setDeleteConfirm(s)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Confirm warning */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-400" />Sueldo por RUT</DialogTitle>
            <DialogDescription>
              Al ingresar un sueldo por RUT para <strong>{selectedGuard?.name}</strong> ({selectedGuard?.rut}),
              este tendrá <strong>prioridad</strong> sobre el sueldo de la instalación asignada dentro de las fechas de vigencia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={confirmAndOpenForm}>Entendido, continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate dialog */}
      <Dialog open={!!deactivateConfirm} onOpenChange={(o) => !o && setDeactivateConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Desactivar sueldo por RUT</DialogTitle>
            <DialogDescription>
              El guardia <strong>{deactivateConfirm?.name}</strong> volverá a tomar el sueldo de la instalación desde la fecha indicada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Fecha de término</Label>
            <input type="date" value={deactivateDate} onChange={(e) => setDeactivateDate(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeactivate}>Desactivar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar sueldo por RUT</DialogTitle>
            <DialogDescription>
              ¿Eliminar permanentemente el sueldo por RUT de <strong>{deleteConfirm?.name}</strong>?
              El guardia volverá a heredar el sueldo de la instalación.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create modal */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedGuard ? `Sueldo por RUT - ${selectedGuard.name}` : "Nuevo sueldo por RUT"}</DialogTitle>
          </DialogHeader>

          {!selectedGuard ? (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Buscar guardia por nombre o RUT</Label>
                <Input placeholder="Ej: Cedeño o 26746990" value={searchGuard} autoFocus
                  onChange={(e) => { setSearchGuard(e.target.value); searchGuards(e.target.value); }} className="h-10" />
              </div>
              {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {searchResults.map((g) => (
                    <div key={g.id} className={`flex items-center justify-between rounded-md border p-2 cursor-pointer transition-colors ${g.hasSalaryOverride ? "opacity-50" : "hover:bg-accent/40"}`}
                      onClick={() => selectGuard(g)}>
                      <div>
                        <p className="text-sm font-medium">{g.name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{g.rut}</p>
                      </div>
                      {g.hasSalaryOverride && <Badge className="text-[9px] bg-amber-500/15 text-amber-400">Ya tiene sueldo RUT</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div>
                  <p className="font-semibold">{selectedGuard.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{selectedGuard.rut}</p>
                </div>
                <Badge className="ml-auto bg-amber-500/15 text-amber-400 border-amber-500/30">Sueldo por RUT</Badge>
              </div>

              {/* Dates */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Fecha inicio *</Label>
                  <input type="date" value={formDateFrom} onChange={(e) => setFormDateFrom(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Fecha término (opcional)</Label>
                  <input type="date" value={formDateUntil} onChange={(e) => setFormDateUntil(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  <p className="text-[9px] text-muted-foreground">Dejar vacío para vigencia indefinida</p>
                </div>
              </div>

              {/* Salary fields */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Sueldo base *</Label>
                  <Input type="text" inputMode="numeric" value={formatNumber(formBaseSalary, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setFormBaseSalary(parseLocalizedNumber(e.target.value))} className="h-9 bg-background text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Colación</Label>
                  <Input type="text" inputMode="numeric" value={formatNumber(formColacion, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setFormColacion(parseLocalizedNumber(e.target.value))} className="h-9 bg-background text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Movilización</Label>
                  <Input type="text" inputMode="numeric" value={formatNumber(formMovilizacion, { minDecimals: 0, maxDecimals: 0 })}
                    onChange={(e) => setFormMovilizacion(parseLocalizedNumber(e.target.value))} className="h-9 bg-background text-sm" />
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
                    <Input type="text" inputMode="numeric" value={formatNumber(formGratAmount, { minDecimals: 0, maxDecimals: 0 })}
                      onChange={(e) => setFormGratAmount(parseLocalizedNumber(e.target.value))} className="h-9 bg-background text-sm" />
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
                          onChange={(e) => { const nb = [...formBonos]; const nc = bonosCatalog.find((c) => c.id === e.target.value); nb[idx] = { bonoCatalogId: e.target.value, overrideAmount: nc?.defaultAmount != null ? Number(nc.defaultAmount) : undefined, overridePercentage: nc?.defaultPercentage != null ? Number(nc.defaultPercentage) : undefined }; setFormBonos(nb); }}>
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
                          onClick={() => setFormBonos(formBonos.filter((_, i) => i !== idx))}><X className="h-3 w-3" /></Button>
                      </div>
                    );
                  })}
                  <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]"
                    onClick={() => setFormBonos([...formBonos, { bonoCatalogId: "" }])}><Plus className="mr-1 h-3 w-3" /> Agregar bono</Button>
                </div>
              )}

              {/* Calculate + desglose */}
              <div className="border-t border-border pt-3 space-y-3">
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={calculateNet} disabled={estimating || formBaseSalary <= 0}>
                  {estimating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Calculator className="mr-1.5 h-3.5 w-3.5" />}
                  Calcular sueldo líquido
                </Button>

                {netEstimate && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Bruto</p>
                        <p className="text-sm font-bold">{formatCLP(netEstimate.grossSalary)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Descuentos</p>
                        <p className="text-sm font-bold text-destructive">-{formatCLP(netEstimate.totalDeductions)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Líquido</p>
                        <p className="text-sm font-bold text-emerald-400">{formatCLP(netEstimate.netSalary)}</p>
                      </div>
                    </div>
                    <div className="border-t border-border/50 pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span>Sueldo Base: {formatCLP(netEstimate.breakdown?.baseSalary || formBaseSalary)}</span>
                      <span>Gratificación: {formatCLP(netEstimate.breakdown?.gratification || 0)}</span>
                      {formColacion > 0 && <span>Colación: {formatCLP(formColacion)}</span>}
                      {formMovilizacion > 0 && <span>Movilización: {formatCLP(formMovilizacion)}</span>}
                    </div>
                    <div className="border-t border-border/50 pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                      <span>AFP: <strong className="text-destructive">-{formatCLP(netEstimate.deductions.afp)}</strong></span>
                      <span>Salud: <strong className="text-destructive">-{formatCLP(netEstimate.deductions.health)}</strong></span>
                      <span>AFC: <strong className="text-destructive">-{formatCLP(netEstimate.deductions.afc)}</strong></span>
                      <span>Imp. Único: <strong className="text-destructive">-{formatCLP(netEstimate.deductions.tax)}</strong></span>
                    </div>
                  </div>
                )}
              </div>

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
