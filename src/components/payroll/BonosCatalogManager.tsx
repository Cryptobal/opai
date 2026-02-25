"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  DollarSign,
  Percent,
  Target,
} from "lucide-react";
import { formatNumber, parseLocalizedNumber } from "@/lib/utils";

/* ── Types ──────────────────────────── */

type BonoType = "FIJO" | "PORCENTUAL" | "CONDICIONAL";

interface Bono {
  id: string;
  code: string;
  name: string;
  description: string | null;
  bonoType: BonoType;
  isTaxable: boolean;
  isTributable: boolean;
  defaultAmount: number | null;
  defaultPercentage: number | null;
  conditionType: string | null;
  conditionThreshold: number | null;
  isActive: boolean;
}

interface BonoFormData {
  code: string;
  name: string;
  description: string;
  bonoType: BonoType;
  isTaxable: boolean;
  isTributable: boolean;
  defaultAmount: number;
  defaultPercentage: number;
  conditionType: string;
  conditionThreshold: number;
}

const DEFAULT_FORM: BonoFormData = {
  code: "",
  name: "",
  description: "",
  bonoType: "FIJO",
  isTaxable: false,
  isTributable: false,
  defaultAmount: 0,
  defaultPercentage: 0,
  conditionType: "",
  conditionThreshold: 100,
};

const CONDITION_TYPES = [
  { value: "ASISTENCIA_PERFECTA", label: "Asistencia Perfecta" },
  { value: "CUMPLIMIENTO_RONDAS", label: "Cumplimiento de Rondas" },
  { value: "CUSTOM", label: "Personalizado" },
];

const BONO_TYPE_CONFIG: Record<BonoType, { label: string; icon: typeof DollarSign; color: string }> = {
  FIJO: { label: "Fijo", icon: DollarSign, color: "text-emerald-400" },
  PORCENTUAL: { label: "Porcentual", icon: Percent, color: "text-blue-400" },
  CONDICIONAL: { label: "Condicional", icon: Target, color: "text-amber-400" },
};

/* ── Component ──────────────────────── */

export function BonosCatalogManager() {
  const [bonos, setBonos] = useState<Bono[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BonoFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  const loadBonos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/bonos?active=false");
      const json = await res.json();
      setBonos(json.data || []);
    } catch (err) {
      console.error("Error loading bonos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBonos();
  }, [loadBonos]);

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setModalOpen(true);
  };

  const openEdit = (bono: Bono) => {
    setEditingId(bono.id);
    setForm({
      code: bono.code,
      name: bono.name,
      description: bono.description || "",
      bonoType: bono.bonoType,
      isTaxable: bono.isTaxable,
      isTributable: bono.isTributable,
      defaultAmount: Number(bono.defaultAmount) || 0,
      defaultPercentage: Number(bono.defaultPercentage) || 0,
      conditionType: bono.conditionType || "",
      conditionThreshold: Number(bono.conditionThreshold) || 100,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code,
        name: form.name,
        description: form.description || null,
        bonoType: form.bonoType,
        isTaxable: form.isTaxable,
        isTributable: form.isTributable,
        defaultAmount: form.bonoType === "FIJO" || form.bonoType === "CONDICIONAL" ? form.defaultAmount : null,
        defaultPercentage: form.bonoType === "PORCENTUAL" || form.bonoType === "CONDICIONAL" ? form.defaultPercentage : null,
        conditionType: form.bonoType === "CONDICIONAL" ? form.conditionType : null,
        conditionThreshold: form.bonoType === "CONDICIONAL" ? form.conditionThreshold : null,
      };

      const url = editingId ? `/api/payroll/bonos/${editingId}` : "/api/payroll/bonos";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error al guardar");
        return;
      }

      setModalOpen(false);
      await loadBonos();
    } catch (err) {
      console.error("Error saving bono:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (bono: Bono) => {
    if (!confirm(`¿Eliminar el bono "${bono.name}"?`)) return;
    try {
      const res = await fetch(`/api/payroll/bonos/${bono.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        alert(json.error || "Error al eliminar");
        return;
      }
      await loadBonos();
    } catch (err) {
      console.error("Error deleting bono:", err);
    }
  };

  const handleToggleActive = async (bono: Bono) => {
    try {
      await fetch(`/api/payroll/bonos/${bono.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !bono.isActive }),
      });
      await loadBonos();
    } catch (err) {
      console.error("Error toggling bono:", err);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Catálogo de Bonos</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nuevo bono
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : bonos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay bonos configurados. Crea el primero con el botón de arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {bonos.map((bono) => {
              const cfg = BONO_TYPE_CONFIG[bono.bonoType];
              const Icon = cfg.icon;
              return (
                <div
                  key={bono.id}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                    bono.isActive ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
                  }`}
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted ${cfg.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{bono.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {cfg.label}
                      </Badge>
                      {bono.isTaxable ? (
                        <Badge variant="secondary" className="text-[10px]">Imponible</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">No imponible</Badge>
                      )}
                      {!bono.isActive && (
                        <Badge variant="destructive" className="text-[10px]">Inactivo</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="font-mono text-[10px]">{bono.code}</span>
                      {bono.bonoType === "FIJO" && bono.defaultAmount != null && (
                        <> · ${formatNumber(Number(bono.defaultAmount), { minDecimals: 0, maxDecimals: 0 })}</>
                      )}
                      {bono.bonoType === "PORCENTUAL" && bono.defaultPercentage != null && (
                        <> · {Number(bono.defaultPercentage)}% del sueldo base</>
                      )}
                      {bono.bonoType === "CONDICIONAL" && bono.conditionType && (
                        <> · {CONDITION_TYPES.find((c) => c.value === bono.conditionType)?.label || bono.conditionType}</>
                      )}
                      {bono.description && <> · {bono.description}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => handleToggleActive(bono)}
                      title={bono.isActive ? "Desactivar" : "Activar"}
                    >
                      <span className={`h-2 w-2 rounded-full ${bono.isActive ? "bg-emerald-400" : "bg-muted-foreground"}`} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(bono)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(bono)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* ── Modal Crear/Editar ── */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar bono" : "Nuevo bono"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Código *
                </Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase().replace(/\s/g, "_") }))}
                  placeholder="BONO_ASISTENCIA"
                  className="h-9 bg-background text-sm font-mono"
                  disabled={!!editingId}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nombre *
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Bono Asistencia Perfecta"
                  className="h-9 bg-background text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Descripción
              </Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Descripción opcional"
                className="h-9 bg-background text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tipo de bono *
              </Label>
              <div className="flex gap-2">
                {(["FIJO", "PORCENTUAL", "CONDICIONAL"] as BonoType[]).map((type) => {
                  const cfg = BONO_TYPE_CONFIG[type];
                  const Icon = cfg.icon;
                  return (
                    <Button
                      key={type}
                      type="button"
                      variant={form.bonoType === type ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setForm((p) => ({ ...p, bonoType: type }))}
                    >
                      <Icon className="mr-1.5 h-3.5 w-3.5" />
                      {cfg.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Campos según tipo */}
            {(form.bonoType === "FIJO" || form.bonoType === "CONDICIONAL") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Monto por defecto (CLP)
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={formatNumber(form.defaultAmount, { minDecimals: 0, maxDecimals: 0 })}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, defaultAmount: parseLocalizedNumber(e.target.value) }))
                  }
                  className="h-9 bg-background text-sm"
                />
              </div>
            )}

            {(form.bonoType === "PORCENTUAL" || form.bonoType === "CONDICIONAL") && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Porcentaje sobre sueldo base (%)
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.defaultPercentage}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, defaultPercentage: Number(e.target.value) }))
                  }
                  className="h-9 bg-background text-sm"
                />
              </div>
            )}

            {form.bonoType === "CONDICIONAL" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Tipo de condición
                  </Label>
                  <select
                    className={selectClass}
                    value={form.conditionType}
                    onChange={(e) => setForm((p) => ({ ...p, conditionType: e.target.value }))}
                  >
                    <option value="">Selecciona...</option>
                    {CONDITION_TYPES.map((ct) => (
                      <option key={ct.value} value={ct.value}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Umbral (%)
                  </Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={form.conditionThreshold}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, conditionThreshold: Number(e.target.value) }))
                    }
                    className="h-9 bg-background text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Porcentaje mínimo de cumplimiento para otorgar el bono
                  </p>
                </div>
              </div>
            )}

            <div className="border-t border-border pt-3" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isTaxable"
                  checked={form.isTaxable}
                  onChange={(e) => setForm((p) => ({ ...p, isTaxable: e.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="isTaxable" className="text-sm cursor-pointer">
                  Imponible (afecto a AFP/Salud/AFC)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isTributable"
                  checked={form.isTributable}
                  onChange={(e) => setForm((p) => ({ ...p, isTributable: e.target.checked }))}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="isTributable" className="text-sm cursor-pointer">
                  Tributable (afecto a Impuesto Único)
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving || !form.code || !form.name}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? "Actualizar" : "Crear"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
