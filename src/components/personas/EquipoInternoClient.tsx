"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { STAFF_CARGOS, STAFF_CARGO_LABELS, type StaffCargo } from "@/lib/personas-staff";
import { PersonasClassSwitch } from "@/components/personas/PersonasClassSwitch";

export type EquipoInternoRow = {
  id: string;
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
  admin: { id: string; name: string; email: string } | null;
};

function clp(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("es-CL")}`;
}

export function EquipoInternoClient({
  initialRows,
  canEdit,
}: {
  initialRows: EquipoInternoRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phone: "",
    cargoStaff: "administrativo" as StaffCargo,
    baseSalary: "",
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialRows;
    return initialRows.filter((r) => {
      const hay = `${r.displayName} ${r.rut ?? ""} ${r.email ?? ""} ${r.cargoLabel}`.toLowerCase();
      return hay.includes(q);
    });
  }, [initialRows, search]);

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
      cell: (row) => clp(row.baseSalary),
    },
    {
      id: "erp",
      header: "Usuario ERP",
      hideOnMobile: true,
      cell: (row) =>
        row.admin ? (
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
          cargoStaff: form.cargoStaff,
          baseSalary: salary,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo crear");
      toast.success("Ficha creada");
      setCreateOpen(false);
      router.push(`/personas/equipo/${json.data.id}`);
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
        subtitle="gasto de administración"
        description="Supervisores, jefes, gerentes y administrativos. No entran a pauta ni marcación. El sueldo alimenta las filas de gasto 6.x del flujo de caja."
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
                  <DialogTitle>Nueva persona — equipo interno</DialogTitle>
                  <DialogDescription>
                    Ficha HR con cargo y sueldo. No se crea un guardia ni se asigna instalación.
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
                    <Label htmlFor="staff-cargo">Cargo</Label>
                    <select
                      id="staff-cargo"
                      className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1"
                      value={form.cargoStaff}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, cargoStaff: e.target.value as StaffCargo }))
                      }
                    >
                      {STAFF_CARGOS.map((c) => (
                        <option key={c} value={c}>
                          {STAFF_CARGO_LABELS[c]}
                        </option>
                      ))}
                    </select>
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
          description="Alta de supervisores, jefes, gerentes o administrativos. No se mezclan con guardias de terreno."
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
                  onClick={() => router.push(`/personas/equipo/${row.id}`)}
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
                  <p className="mt-2 text-[13px] text-ds-text-2">{clp(row.baseSalary)}</p>
                </Surface>
              </li>
            ))}
          </ul>
          <DataTable
            className="hidden sm:block"
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/personas/equipo/${r.id}`)}
          />
        </>
      )}
    </div>
  );
}
