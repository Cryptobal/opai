"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tag,
  Settings2,
  UserCheck,
  ShieldCheck,
  Building2,
  Plus,
  Save,
  Loader2,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface ConfigData {
  kmPerLiter: number;
  fuelPricePerLiter: number;
  vehicleFeePct: number;
  requireImage: boolean;
  requireObservations: boolean;
  requireTollImage: boolean;
  defaultApprover1Id: string | null;
  defaultApprover2Id: string | null;
  maxDailyAmount: number | null;
  maxMonthlyAmount: number | null;
  pendingAlertDays: number;
  approvalAlertDays: number;
  santanderAccountNumber: string | null;
}

interface ItemData {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  active: boolean;
  maxPerDay: number | null;
  maxPerMonth: number | null;
  accountCode: string | null;
}

interface CostCenterData {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
}

interface ApproverOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ConfigClientProps {
  config: ConfigData | null;
  items: ItemData[];
  costCenters: CostCenterData[];
  approverOptions: ApproverOption[];
}

/* ── Tab definition ── */

const TABS = [
  { id: "items", label: "Ítems", icon: Tag },
  { id: "km", label: "Parámetros Km", icon: Settings2 },
  { id: "approvers", label: "Aprobadores", icon: UserCheck },
  { id: "rules", label: "Reglas", icon: ShieldCheck },
  { id: "costcenters", label: "Centros de Costo", icon: Building2 },
] as const;

type TabId = (typeof TABS)[number]["id"];

const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

const NONE_VALUE = "__none__";

/* ── Component ── */

export function ConfigClient({
  config: initialConfig,
  items: initialItems,
  costCenters: initialCostCenters,
  approverOptions,
}: ConfigClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>("items");

  return (
    <div className="space-y-4">
      {/* Tab navigation */}
      <nav className="-mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors shrink-0 flex items-center gap-1.5",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === "items" && <ItemsTab initialItems={initialItems} />}
        {activeTab === "km" && <KmParamsTab initialConfig={initialConfig} />}
        {activeTab === "approvers" && (
          <ApproversTab
            initialConfig={initialConfig}
            approverOptions={approverOptions}
          />
        )}
        {activeTab === "rules" && <RulesTab initialConfig={initialConfig} />}
        {activeTab === "costcenters" && (
          <CostCentersTab initialCostCenters={initialCostCenters} />
        )}
      </div>
    </div>
  );
}

/* ── Items Tab ── */

function ItemsTab({ initialItems }: { initialItems: ItemData[] }) {
  const [items, setItems] = useState(initialItems);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemData | null>(null);
  const [form, setForm] = useState({
    name: "",
    code: "",
    category: "",
    accountCode: "",
    maxPerDay: "",
    maxPerMonth: "",
  });
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  // Categorías únicas existentes para el selector
  const existingCategories = Array.from(new Set(items.map((i) => i.category).filter(Boolean))) as string[];

  const handleSeedDefaults = useCallback(async () => {
    if (!confirm("¿Cargar ítems por defecto? Los ítems existentes no se duplicarán.")) return;
    setSeeding(true);
    try {
      const res = await fetch("/api/finance/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      toast.success(data.message || "Ítems cargados");
      // Reload items
      const listRes = await fetch("/api/finance/items");
      const listData = await listRes.json();
      if (listRes.ok && listData.data) setItems(listData.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar ítems");
    } finally {
      setSeeding(false);
    }
  }, []);

  const openCreate = useCallback(() => {
    setEditingItem(null);
    setForm({ name: "", code: "", category: "", accountCode: "", maxPerDay: "", maxPerMonth: "" });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((item: ItemData) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      code: item.code ?? "",
      category: item.category ?? "",
      accountCode: item.accountCode ?? "",
      maxPerDay: item.maxPerDay?.toString() ?? "",
      maxPerMonth: item.maxPerMonth?.toString() ?? "",
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        category: form.category.trim() || null,
        accountCode: form.accountCode.trim() || null,
        maxPerDay: form.maxPerDay ? parseInt(form.maxPerDay.replace(/\D/g, "")) : null,
        maxPerMonth: form.maxPerMonth ? parseInt(form.maxPerMonth.replace(/\D/g, "")) : null,
      };

      const url = editingItem
        ? `/api/finance/items/${editingItem.id}`
        : "/api/finance/items";
      const method = editingItem ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      const savedItem = data.data || data;
      if (editingItem) {
        setItems((prev) => prev.map((i) => (i.id === savedItem.id ? savedItem : i)));
      } else {
        setItems((prev) => [...prev, savedItem]);
      }
      toast.success(editingItem ? "Ítem actualizado" : "Ítem creado");
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [form, editingItem]);

  const handleToggleActive = useCallback(async (item: ItemData) => {
    try {
      const res = await fetch(`/api/finance/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !item.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: !i.active } : i)));
      toast.success(item.active ? "Ítem desactivado" : "Ítem activado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("¿Eliminar este ítem?")) return;
    try {
      const res = await fetch(`/api/finance/items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Error");
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("Ítem eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Ítems de rendición</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define los ítems disponibles para clasificar rendiciones.
          </p>
        </div>
        <div className="flex gap-2">
          {items.length === 0 && (
            <Button size="sm" variant="outline" onClick={handleSeedDefaults} disabled={seeding}>
              {seeding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Cargar por defecto
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo ítem
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No hay ítems configurados.</p>
            <Button variant="outline" onClick={handleSeedDefaults} disabled={seeding}>
              {seeding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Cargar ítems por defecto
            </Button>
          </CardContent>
        </Card>
      ) : (() => {
        // Agrupar por categoría
        const grouped: Record<string, ItemData[]> = {};
        items.forEach((item) => {
          const cat = item.category || "Sin categoría";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(item);
        });
        const sortedCategories = Object.keys(grouped).sort((a, b) => a === "Sin categoría" ? 1 : b === "Sin categoría" ? -1 : a.localeCompare(b, "es"));

        return (
          <div className="space-y-4">
            {sortedCategories.map((cat) => (
              <div key={cat}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">{cat}</p>
                <div className="space-y-1">
                  {grouped[cat].map((item) => (
                    <div key={item.id} className={cn("flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors", item.active ? "border-border" : "border-border/50 opacity-60")}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{item.name}</p>
                          {item.code && <span className="text-xs text-muted-foreground font-mono">{item.code}</span>}
                          {!item.active && <Badge className="bg-zinc-500/15 text-zinc-400 text-[10px]">Inactivo</Badge>}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                          {item.accountCode && <span>Cuenta: {item.accountCode}</span>}
                          {item.maxPerDay != null && <span>Máx/día: {fmtCLP.format(item.maxPerDay)}</span>}
                          {item.maxPerMonth != null && <span>Máx/mes: {fmtCLP.format(item.maxPerMonth)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => handleToggleActive(item)} className="h-8 w-8 p-0" title={item.active ? "Desactivar" : "Activar"}>
                          {item.active ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="h-8 w-8 p-0">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="h-8 w-8 p-0 text-red-400 hover:text-red-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Item dialog — mobile-friendly */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar ítem" : "Nuevo ítem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="itemName">Nombre *</Label>
              <Input id="itemName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="itemCode">Código</Label>
                <Input id="itemCode" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ej: ALM" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="itemCategory">Categoría</Label>
                {existingCategories.length > 0 ? (
                  <Select value={form.category || NONE_VALUE} onValueChange={(v) => setForm({ ...form, category: v === NONE_VALUE ? "" : v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>Sin categoría</SelectItem>
                      {existingCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id="itemCategory" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ej: Alimentación" className="mt-1" />
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="accountCode">Código contable</Label>
              <Input id="accountCode" value={form.accountCode} onChange={(e) => setForm({ ...form, accountCode: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="maxPerDay">Máx. diario (CLP)</Label>
                <Input id="maxPerDay" inputMode="numeric" value={form.maxPerDay} onChange={(e) => setForm({ ...form, maxPerDay: e.target.value.replace(/[^\d]/g, "") })} placeholder="Sin límite" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="maxPerMonth">Máx. mensual (CLP)</Label>
                <Input id="maxPerMonth" inputMode="numeric" value={form.maxPerMonth} onChange={(e) => setForm({ ...form, maxPerMonth: e.target.value.replace(/[^\d]/g, "") })} placeholder="Sin límite" className="mt-1" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── KM Parameters Tab ── */

function KmParamsTab({ initialConfig }: { initialConfig: ConfigData | null }) {
  const [kmPerLiter, setKmPerLiter] = useState(initialConfig?.kmPerLiter?.toString() ?? "10");
  const [fuelPrice, setFuelPrice] = useState(initialConfig?.fuelPricePerLiter?.toString() ?? "1500");
  const [feePct, setFeePct] = useState(initialConfig?.vehicleFeePct?.toString() ?? "10");
  const [maxDaily, setMaxDaily] = useState(initialConfig?.maxDailyAmount?.toString() ?? "");
  const [maxMonthly, setMaxMonthly] = useState(initialConfig?.maxMonthlyAmount?.toString() ?? "");
  const [pendingDays, setPendingDays] = useState(initialConfig?.pendingAlertDays?.toString() ?? "5");
  const [approvalDays, setApprovalDays] = useState(initialConfig?.approvalAlertDays?.toString() ?? "3");
  const [santanderAccount, setSantanderAccount] = useState(initialConfig?.santanderAccountNumber ?? "");
  const [saving, setSaving] = useState(false);

  const cleanNum = (v: string) => v.replace(/[^\d]/g, "");

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kmPerLiter: parseFloat(kmPerLiter) || 10,
          fuelPricePerLiter: parseInt(cleanNum(fuelPrice)) || 1500,
          vehicleFeePct: parseFloat(feePct) || 10,
          maxDailyAmount: maxDaily ? parseInt(cleanNum(maxDaily)) : null,
          maxMonthlyAmount: maxMonthly ? parseInt(cleanNum(maxMonthly)) : null,
          pendingAlertDays: parseInt(pendingDays) || 5,
          approvalAlertDays: parseInt(approvalDays) || 3,
          santanderAccountNumber: santanderAccount.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      toast.success("Parámetros guardados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [kmPerLiter, fuelPrice, feePct, maxDaily, maxMonthly, pendingDays, approvalDays, santanderAccount]);

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold">Parámetros de kilometraje</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Configura cómo se calcula el costo de los trayectos.</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="kmPerLiter">Km por litro</Label>
              <Input id="kmPerLiter" inputMode="decimal" value={kmPerLiter} onChange={(e) => setKmPerLiter(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="fuelPrice">Precio combustible (CLP/L)</Label>
              <Input id="fuelPrice" inputMode="numeric" value={fuelPrice} onChange={(e) => setFuelPrice(e.target.value.replace(/[^\d]/g, ""))} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="feePct">Fee vehículo (%)</Label>
              <Input id="feePct" inputMode="decimal" value={feePct} onChange={(e) => setFeePct(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Límites globales</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="maxDaily">Máx. diario (CLP)</Label>
                <Input id="maxDaily" inputMode="numeric" value={maxDaily} onChange={(e) => setMaxDaily(e.target.value.replace(/[^\d]/g, ""))} placeholder="Sin límite" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="maxMonthly">Máx. mensual (CLP)</Label>
                <Input id="maxMonthly" inputMode="numeric" value={maxMonthly} onChange={(e) => setMaxMonthly(e.target.value.replace(/[^\d]/g, ""))} placeholder="Sin límite" className="mt-1" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">Alertas</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pendingDays">Alerta rendición pendiente (días)</Label>
                <Input id="pendingDays" inputMode="numeric" value={pendingDays} onChange={(e) => setPendingDays(e.target.value.replace(/[^\d]/g, ""))} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="approvalDays">Alerta aprobación pendiente (días)</Label>
                <Input id="approvalDays" inputMode="numeric" value={approvalDays} onChange={(e) => setApprovalDays(e.target.value.replace(/[^\d]/g, ""))} className="mt-1" />
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <Label htmlFor="santanderAccount">Cuenta origen Santander</Label>
            <Input id="santanderAccount" value={santanderAccount} onChange={(e) => setSantanderAccount(e.target.value)} placeholder="Número de cuenta" className="mt-1 max-w-sm" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Guardar parámetros
        </Button>
      </div>
    </div>
  );
}

/* ── Approvers Tab ── */

function ApproversTab({ initialConfig, approverOptions }: { initialConfig: ConfigData | null; approverOptions: ApproverOption[] }) {
  const [approver1, setApprover1] = useState(initialConfig?.defaultApprover1Id ?? NONE_VALUE);
  const [approver2, setApprover2] = useState(initialConfig?.defaultApprover2Id ?? NONE_VALUE);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultApprover1Id: approver1 === NONE_VALUE ? null : approver1,
          defaultApprover2Id: approver2 === NONE_VALUE ? null : approver2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      toast.success("Aprobadores guardados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [approver1, approver2]);

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold">Aprobadores por defecto</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Define quién aprueba las rendiciones. Puedes configurar hasta 2 niveles.</p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div>
            <Label>Aprobador nivel 1</Label>
            <Select value={approver1} onValueChange={setApprover1}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar aprobador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sin aprobador</SelectItem>
                {approverOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Aprobador nivel 2 (opcional)</Label>
            <Select value={approver2} onValueChange={setApprover2}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar aprobador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>Sin aprobador</SelectItem>
                {approverOptions
                  .filter((a) => approver1 === NONE_VALUE || a.id !== approver1)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.email})</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Guardar aprobadores
        </Button>
      </div>
    </div>
  );
}

/* ── Rules Tab ── */

function RulesTab({ initialConfig }: { initialConfig: ConfigData | null }) {
  const [requireImage, setRequireImage] = useState(initialConfig?.requireImage ?? true);
  const [requireObservations, setRequireObservations] = useState(initialConfig?.requireObservations ?? false);
  const [requireTollImage, setRequireTollImage] = useState(initialConfig?.requireTollImage ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/finance/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireImage, requireObservations, requireTollImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      toast.success("Reglas guardadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [requireImage, requireObservations, requireTollImage]);

  const rules = [
    { id: "requireImage", label: "Requerir imagen de comprobante", description: "Los usuarios deben adjuntar al menos una imagen al crear una rendición.", enabled: requireImage, toggle: () => setRequireImage(!requireImage) },
    { id: "requireObservations", label: "Requerir observaciones", description: "El campo de descripción/observaciones es obligatorio.", enabled: requireObservations, toggle: () => setRequireObservations(!requireObservations) },
    { id: "requireTollImage", label: "Requerir imagen de peaje", description: "Para rendiciones de kilometraje con peaje, se requiere imagen del comprobante.", enabled: requireTollImage, toggle: () => setRequireTollImage(!requireTollImage) },
  ];

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold">Reglas de validación</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Configura qué campos son obligatorios al crear rendiciones.</p>
      </div>

      <div className="space-y-2">
        {rules.map((rule) => (
          <Card key={rule.id}>
            <CardContent className="pt-4 pb-4">
              <button onClick={rule.toggle} className="w-full flex items-center justify-between gap-3 text-left">
                <div>
                  <p className="text-sm font-medium">{rule.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
                </div>
                <div className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors", rule.enabled ? "bg-primary" : "bg-muted")}>
                  <span className={cn("inline-block h-4 w-4 rounded-full bg-white transition-transform", rule.enabled ? "translate-x-6" : "translate-x-1")} />
                </div>
              </button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
          Guardar reglas
        </Button>
      </div>
    </div>
  );
}

/* ── Cost Centers Tab ── */

function CostCentersTab({ initialCostCenters }: { initialCostCenters: CostCenterData[] }) {
  const [costCenters, setCostCenters] = useState(initialCostCenters);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCC, setEditingCC] = useState<CostCenterData | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [saving, setSaving] = useState(false);

  const openCreate = useCallback(() => {
    setEditingCC(null);
    setForm({ name: "", code: "" });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((cc: CostCenterData) => {
    setEditingCC(cc);
    setForm({ name: cc.name, code: cc.code ?? "" });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), code: form.code.trim() || null };
      const url = editingCC ? `/api/finance/cost-centers/${editingCC.id}` : "/api/finance/cost-centers";
      const method = editingCC ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      const savedCC = data.data || data;
      if (editingCC) {
        setCostCenters((prev) => prev.map((c) => (c.id === savedCC.id ? savedCC : c)));
      } else {
        setCostCenters((prev) => [...prev, savedCC]);
      }
      toast.success(editingCC ? "Centro actualizado" : "Centro creado");
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [form, editingCC]);

  const handleToggleActive = useCallback(async (cc: CostCenterData) => {
    try {
      const res = await fetch(`/api/finance/cost-centers/${cc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !cc.active }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setCostCenters((prev) => prev.map((c) => (c.id === cc.id ? { ...c, active: !c.active } : c)));
      toast.success(cc.active ? "Desactivado" : "Activado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("¿Eliminar este centro de costo?")) return;
    try {
      const res = await fetch(`/api/finance/cost-centers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Error");
      }
      setCostCenters((prev) => prev.filter((c) => c.id !== id));
      toast.success("Centro de costo eliminado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Centros de costo</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Define centros de costo para clasificar rendiciones.</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo centro
        </Button>
      </div>

      {costCenters.length === 0 ? (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-sm text-muted-foreground">No hay centros de costo configurados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {costCenters.map((cc) => (
            <div key={cc.id} className={cn("flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors", cc.active ? "border-border" : "border-border/50 opacity-60")}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{cc.name}</p>
                  {cc.code && <span className="text-xs text-muted-foreground font-mono">{cc.code}</span>}
                  {!cc.active && <Badge className="bg-zinc-500/15 text-zinc-400 text-[10px]">Inactivo</Badge>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(cc)} className="h-8 w-8 p-0">
                  {cc.active ? <ToggleRight className="h-4 w-4 text-emerald-400" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openEdit(cc)} className="h-8 w-8 p-0">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(cc.id)} className="h-8 w-8 p-0 text-red-400 hover:text-red-300">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cost center dialog — mobile-friendly */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCC ? "Editar centro de costo" : "Nuevo centro de costo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ccName">Nombre *</Label>
              <Input id="ccName" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" autoFocus />
            </div>
            <div>
              <Label htmlFor="ccCode">Código</Label>
              <Input id="ccCode" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
