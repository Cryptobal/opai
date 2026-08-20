"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";
import { ErpUserPicker } from "@/components/personas/ErpUserPicker";
import {
  DataTable,
  EmptyState,
  PageHero,
  Surface,
  Tag,
  type DataTableColumn,
} from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatPersonName, formatRutForInput, isValidChileanRut } from "@/lib/personas";
import { PersonasClassSwitch } from "@/components/personas/PersonasClassSwitch";

export type EquipoInternoRow = {
  id: string;
  personaId?: string;
  guardiaId?: string | null;
  firstName: string;
  lastName: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  cargoStaff: string | null;
  cargoLabel: string;
  status: string;
  displayName: string;
  baseSalary: number | null;
  salarySensitive?: boolean;
  admin: { id: string; name: string; email: string } | null;
};

function clp(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-CL")}`;
}

export function EquipoInternoClient({
  initialRows,
  canEdit,
  canViewSensitiveSalary = false,
}: {
  initialRows: EquipoInternoRow[];
  canEdit: boolean;
  canViewSensitiveSalary?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phone: "",
    baseSalary: "",
  });

  function openFicha(row: EquipoInternoRow) {
    if (row.guardiaId) {
      router.push(`/personas/guardias/${row.guardiaId}`);
      return;
    }
    void (async () => {
      try {
        const res = await fetch("/api/personas/equipo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId: row.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "No se pudo abrir la ficha");
        const guardiaId = json.data?.guardiaId as string | undefined;
        if (!guardiaId) throw new Error("La ficha no tiene guardia asociado");
        router.push(`/personas/guardias/${guardiaId}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "No se pudo abrir la ficha");
      }
    })();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialRows;
    return rows.filter((r) => {
      const hay = `${r.displayName} ${r.rut ?? ""} ${r.email ?? ""} ${r.cargoLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const linkedAdminIds = useMemo(
    () => rows.map((r) => r.admin?.id).filter((id): id is string => Boolean(id)),
    [rows],
  );

  async function patchAdmin(row: EquipoInternoRow, admin: { id: string; name: string; email: string } | null) {
    const res = await fetch(`/api/personas/equipo/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId: admin?.id ?? null }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "No se pudo vincular el usuario");
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, admin } : r)),
    );
    router.refresh();
  }

  const columns: DataTableColumn<EquipoInternoRow>[] = [
    {
      id: "nombre",
      header: "Nombre",
      cell: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-ds-text-1 truncate">{row.displayName}</div>
          {row.rut && <div className="text-[12px] text-ds-text-3 font-mono">{row.rut}</div>}
        </div>
      ),
    },
    {
      id: "cargo",
      header: "Cargo",
      cell: (row) => <Tag size="sm">{row.cargoLabel}</Tag>,
    },
    {
      id: "sueldo",
      header: "Sueldo base",
      align: "right",
      cell: (row) =>
        row.salarySensitive && !canViewSensitiveSalary ? "—" : clp(row.baseSalary),
    },
    {
      id: "erp",
      header: "Usuario ERP",
      hideOnMobile: true,
      cell: (row) =>
        canEdit ? (
          <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <ErpUserPicker
              compact
              value={row.admin}
              excludeIds={linkedAdminIds}
              onChange={(admin) => patchAdmin(row, admin)}
            />
          </div>
        ) : row.admin ? (
          <span className="text-ds-text-2 truncate">{row.admin.email}</span>
        ) : (
          <span className="text-ds-text-4">Sin usuario</span>
        ),
    },
    {
      id: "estado",
      header: "Estado",
      cell: (row) => (
        <Tag size="sm" variant={row.status === "active" ? "ok" : "neutral"}>
          {row.status === "active" ? "Activo" : "Inactivo"}
        </Tag>
      ),
    },
  ];

  async function handleCreate() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Nombre y apellido son requeridos");
      return;
    }
    if (form.rut && !isValidChileanRut(form.rut)) {
      toast.error("RUT inválido");
      return;
    }
    const salary = form.baseSalary ? Number(form.baseSalary.replace(/\./g, "").replace(",", ".")) : undefined;
    if (form.baseSalary && (!salary || salary <= 0)) {
      toast.error("Sueldo base inválido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/personas/equipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          rut: form.rut.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          baseSalary: salary,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo crear");
      toast.success("Ficha creada");
      setCreateOpen(false);
      const guardiaId = json.data?.guardiaId as string | undefined;
      router.push(guardiaId ? `/personas/guardias/${guardiaId}` : `/personas/equipo/${json.data.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ds-page-enter space-y-6 min-w-0">
      <PageHero
        icon={<Briefcase />}
        iconTone="sky"
        title="Equipo interno"
        subtitle="misma ficha 360"
        description="Vista de las fichas laborales con tipo Administrativo. Contrato, banco, AFP y finiquito viven en la ficha 360. Art. 22 por defecto: no marcan."
        actions={
          canEdit ? (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 sm:h-9 min-w-[44px]">
                  <Plus className="h-4 w-4 mr-1.5" />
                  Alta interna
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Nueva ficha — administrativo</DialogTitle>
                  <DialogDescription>
                    Crea la misma ficha 360 con tipo Administrativo y Art. 22. Instalación y puesto se asignan ahí.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-first">Nombre</Label>
                      <Input
                        id="staff-first"
                        className="h-10 sm:h-9"
                        value={form.firstName}
                        onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-last">Apellido</Label>
                      <Input
                        id="staff-last"
                        className="h-10 sm:h-9"
                        value={form.lastName}
                        onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-rut">RUT</Label>
                    <Input
                      id="staff-rut"
                      className="h-10 sm:h-9 font-mono"
                      placeholder="12345678-5"
                      value={form.rut}
                      onChange={(e) => setForm((p) => ({ ...p, rut: formatRutForInput(e.target.value) }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-email">Email</Label>
                      <Input
                        id="staff-email"
                        type="email"
                        className="h-10 sm:h-9"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-phone">Teléfono</Label>
                      <Input
                        id="staff-phone"
                        className="h-10 sm:h-9"
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="staff-salary">Sueldo base (CLP)</Label>
                    <Input
                      id="staff-salary"
                      className="h-10 sm:h-9"
                      inputMode="numeric"
                      placeholder="Opcional — se puede cargar en la ficha"
                      value={form.baseSalary}
                      onChange={(e) => setForm((p) => ({ ...p, baseSalary: e.target.value }))}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" className="h-10 sm:h-9" onClick={() => setCreateOpen(false)}>
                      Cancelar
                    </Button>
                    <Button className="h-10 sm:h-9" onClick={() => void handleCreate()} disabled={saving}>
                      {saving ? "Guardando…" : "Crear ficha"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : undefined
        }
      />

      <PersonasClassSwitch active="equipo" />

      <Input
        className="h-10 sm:h-9 max-w-sm"
        placeholder="Buscar por nombre, RUT o cargo…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Sin equipo interno"
          description="Las fichas administrativas se listan aquí y se abren en la ficha 360."
          compact
        />
      ) : (
        <>
          <ul className="ds-list-cascade sm:hidden space-y-2">
            {filtered.map((row) => (
              <li key={row.id}>
                <Surface
                  tappable
                  elevation={1}
                  padding="sm"
                  className="cursor-pointer"
                  onClick={() => openFicha(row)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ds-text-1 truncate">
                        {formatPersonName(row.firstName, row.lastName)}
                      </p>
                      <p className="text-[12px] text-ds-text-3 font-mono">{row.rut ?? "Sin RUT"}</p>
                    </div>
                    <Tag size="sm">{row.cargoLabel}</Tag>
                  </div>
                  <p className="mt-2 text-[13px] text-ds-text-2">
                    {row.salarySensitive && !canViewSensitiveSalary ? "—" : clp(row.baseSalary)}
                  </p>
                </Surface>
              </li>
            ))}
          </ul>
          <DataTable
            className="hidden sm:block"
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            onRowClick={(r) => openFicha(r)}
          />
        </>
      )}
    </div>
  );
}
