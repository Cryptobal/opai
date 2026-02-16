"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/opai";
import {
  Plus,
  Search,
  Building2,
  Pencil,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types ── */

interface SupplierRow {
  id: string;
  rut: string;
  name: string;
  tradeName: string | null;
  address: string | null;
  commune: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  paymentTermDays: number;
  accountPayableId: string | null;
  accountExpenseId: string | null;
  isActive: boolean;
}

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Props {
  suppliers: SupplierRow[];
  accounts: AccountOption[];
  canManage: boolean;
}

/* ── Constants ── */

const EMPTY_FORM = {
  rut: "",
  name: "",
  tradeName: "",
  address: "",
  commune: "",
  city: "",
  email: "",
  phone: "",
  contactName: "",
  paymentTermDays: "30",
  accountPayableId: "",
  accountExpenseId: "",
  isActive: true,
};

/* ── Component ── */

export function ProveedoresClient({ suppliers, accounts, canManage }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = suppliers;
    if (statusFilter === "ACTIVE") list = list.filter((s) => s.isActive);
    if (statusFilter === "INACTIVE") list = list.filter((s) => !s.isActive);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.rut.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.tradeName?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [suppliers, statusFilter, search]);

  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((s: SupplierRow) => {
    setEditingId(s.id);
    setForm({
      rut: s.rut,
      name: s.name,
      tradeName: s.tradeName ?? "",
      address: s.address ?? "",
      commune: s.commune ?? "",
      city: s.city ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
      contactName: s.contactName ?? "",
      paymentTermDays: String(s.paymentTermDays),
      accountPayableId: s.accountPayableId ?? "",
      accountExpenseId: s.accountExpenseId ?? "",
      isActive: s.isActive,
    });
    setDialogOpen(true);
  }, []);

  const setField = useCallback(
    (key: string, value: string | boolean) =>
      setForm((prev) => ({ ...prev, [key]: value })),
    []
  );

  const handleSave = async () => {
    if (!form.rut.trim() || !form.name.trim()) {
      toast.error("RUT y Razón Social son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        tradeName: form.tradeName.trim() || null,
        address: form.address.trim() || null,
        commune: form.commune.trim() || null,
        city: form.city.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        contactName: form.contactName.trim() || null,
        paymentTermDays: parseInt(form.paymentTermDays) || 30,
        accountPayableId: form.accountPayableId || null,
        accountExpenseId: form.accountExpenseId || null,
      };

      if (editingId) {
        // Update
        const res = await fetch(`/api/finance/purchases/suppliers/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, isActive: form.isActive }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al actualizar proveedor");
        }
        toast.success("Proveedor actualizado");
      } else {
        // Create
        const res = await fetch("/api/finance/purchases/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, rut: form.rut.trim() }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Error al crear proveedor");
        }
        toast.success("Proveedor creado");
      }
      setDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este proveedor? Esta acción no se puede deshacer."))
      return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/finance/purchases/suppliers/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al eliminar proveedor");
      }
      toast.success("Proveedor eliminado");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar RUT, nombre, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as "ALL" | "ACTIVE" | "INACTIVE")}
          >
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="ACTIVE">Activos</SelectItem>
              <SelectItem value="INACTIVE">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Nuevo proveedor
          </Button>
        )}
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">
        {filtered.length} proveedor(es)
      </p>

      {/* Content */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-10 w-10" />}
          title="Sin proveedores"
          description={
            search || statusFilter !== "ALL"
              ? "No se encontraron proveedores con los filtros seleccionados."
              : "No hay proveedores registrados aún."
          }
          action={
            canManage && !search && statusFilter === "ALL" ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1.5" />
                Crear proveedor
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">RUT</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Razón Social</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Email</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Teléfono</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-center">Días pago</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                      {canManage && (
                        <th className="px-4 py-3 font-medium text-muted-foreground" />
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{s.rut}</td>
                        <td className="px-4 py-3">
                          <div>{s.name}</div>
                          {s.tradeName && (
                            <div className="text-xs text-muted-foreground">{s.tradeName}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{s.email ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{s.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-center">{s.paymentTermDays}</td>
                        <td className="px-4 py-3">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              s.isActive
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                            )}
                          >
                            {s.isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(s)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(s.id)}
                                disabled={deleting === s.id}
                              >
                                {deleting === s.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                )}
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {filtered.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium truncate">{s.name}</p>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] shrink-0",
                            s.isActive
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30"
                          )}
                        >
                          {s.isActive ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{s.rut}</p>
                      {s.tradeName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{s.tradeName}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs text-muted-foreground">
                        {s.email && <span>{s.email}</span>}
                        {s.phone && <span>{s.phone}</span>}
                        <span>{s.paymentTermDays} días pago</span>
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(s.id)}
                          disabled={deleting === s.id}
                        >
                          {deleting === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar proveedor" : "Nuevo proveedor"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* RUT (only on create) */}
            {!editingId && (
              <div className="space-y-1.5">
                <Label htmlFor="sup-rut">RUT *</Label>
                <Input
                  id="sup-rut"
                  placeholder="12.345.678-9"
                  value={form.rut}
                  onChange={(e) => setField("rut", e.target.value)}
                />
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-name">Razón Social *</Label>
                <Input
                  id="sup-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-trade">Nombre de Fantasía</Label>
                <Input
                  id="sup-trade"
                  value={form.tradeName}
                  onChange={(e) => setField("tradeName", e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-email">Email</Label>
                <Input
                  id="sup-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-phone">Teléfono</Label>
                <Input
                  id="sup-phone"
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-contact">Contacto</Label>
              <Input
                id="sup-contact"
                value={form.contactName}
                onChange={(e) => setField("contactName", e.target.value)}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="sup-address">Dirección</Label>
                <Input
                  id="sup-address"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-commune">Comuna</Label>
                <Input
                  id="sup-commune"
                  value={form.commune}
                  onChange={(e) => setField("commune", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-city">Ciudad</Label>
                <Input
                  id="sup-city"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sup-days">Días de pago</Label>
              <Input
                id="sup-days"
                type="number"
                min={0}
                max={365}
                value={form.paymentTermDays}
                onChange={(e) => setField("paymentTermDays", e.target.value)}
              />
            </div>

            {/* Accounting accounts */}
            {accounts.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Cuenta por pagar</Label>
                  <Select
                    value={form.accountPayableId}
                    onValueChange={(v) => setField("accountPayableId", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin asignar</SelectItem>
                      {accounts
                        .filter((a) => a.type === "LIABILITY")
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} - {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Cuenta de gasto</Label>
                  <Select
                    value={form.accountExpenseId}
                    onValueChange={(v) => setField("accountExpenseId", v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin asignar</SelectItem>
                      {accounts
                        .filter((a) => a.type === "EXPENSE" || a.type === "COST")
                        .map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} - {a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Active toggle (only on edit) */}
            {editingId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sup-active"
                  checked={form.isActive as boolean}
                  onChange={(e) => setField("isActive", e.target.checked)}
                  className="rounded border-border"
                />
                <Label htmlFor="sup-active">Proveedor activo</Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
