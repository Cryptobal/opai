"use client";

import { useCallback, useEffect, useState } from "react";
import { Briefcase, DollarSign, User } from "lucide-react";
import { toast } from "sonner";
import { EntityDetailLayout } from "@/components/crm/EntityDetailLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Surface, Tag } from "@/components/opai-ds";
import { AFP_CHILE, formatRutForInput, HEALTH_SYSTEMS, ISAPRES_CHILE } from "@/lib/personas";
import { STAFF_CARGOS, STAFF_CARGO_LABELS, type StaffCargo } from "@/lib/personas-staff";

type StaffDetail = {
  id: string;
  firstName: string;
  lastName: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  personalEmail: string | null;
  cargoStaff: string | null;
  cargoLabel: string;
  status: string;
  displayName: string;
  afp: string | null;
  healthSystem: string | null;
  isapreName: string | null;
  admin: { id: string; name: string; email: string; cargo: string | null } | null;
  adminId: string | null;
};

type SalaryData = {
  source: "PERSONA" | "NONE" | string;
  structureId: string | null;
  baseSalary: number;
  colacion: number;
  movilizacion: number;
  gratificationType: string;
  gratificationCustomAmount: number;
};

function clp(n: number): string {
  return `$${n.toLocaleString("es-CL")}`;
}

export function EquipoInternoDetailClient({
  initial,
  canEdit,
}: {
  initial: StaffDetail;
  canEdit: boolean;
}) {
  const [tab, setTab] = useState("info");
  const [persona, setPersona] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [salary, setSalary] = useState<SalaryData | null>(null);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryForm, setSalaryForm] = useState({
    baseSalary: "",
    colacion: "0",
    movilizacion: "0",
    gratificationType: "AUTO_25",
  });

  const [info, setInfo] = useState({
    firstName: initial.firstName,
    lastName: initial.lastName,
    rut: initial.rut ?? "",
    email: initial.email ?? "",
    phone: initial.phone ?? "",
    cargoStaff: (initial.cargoStaff as StaffCargo | null) ?? "administrativo",
    status: initial.status,
    afp: initial.afp ?? "",
    healthSystem: initial.healthSystem ?? "",
    isapreName: initial.isapreName ?? "",
  });

  const loadSalary = useCallback(async () => {
    setSalaryLoading(true);
    try {
      const res = await fetch(`/api/personas/equipo/${persona.id}/salary-structure`);
      if (!res.ok) return;
      const json = await res.json();
      const data = json.data as SalaryData;
      setSalary(data);
      if (data.source !== "NONE") {
        setSalaryForm({
          baseSalary: String(data.baseSalary),
          colacion: String(data.colacion),
          movilizacion: String(data.movilizacion),
          gratificationType: data.gratificationType || "AUTO_25",
        });
      }
    } finally {
      setSalaryLoading(false);
    }
  }, [persona.id]);

  useEffect(() => {
    if (tab === "sueldo") void loadSalary();
  }, [tab, loadSalary]);

  async function saveInfo() {
    setSaving(true);
    try {
      const res = await fetch(`/api/personas/equipo/${persona.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: info.firstName.trim(),
          lastName: info.lastName.trim(),
          rut: info.rut.trim() || null,
          email: info.email.trim() || null,
          phone: info.phone.trim() || null,
          cargoStaff: info.cargoStaff,
          status: info.status,
          afp: info.afp || null,
          healthSystem: info.healthSystem || null,
          isapreName: info.isapreName || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar");
      setPersona((p) => ({ ...p, ...json.data }));
      toast.success("Ficha actualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveSalary() {
    const base = Number(salaryForm.baseSalary);
    if (!base || base <= 0) {
      toast.error("Sueldo base es requerido");
      return;
    }
    setSaving(true);
    try {
      const method = salary?.structureId ? "PATCH" : "POST";
      const res = await fetch(`/api/personas/equipo/${persona.id}/salary-structure`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseSalary: base,
          colacion: Number(salaryForm.colacion) || 0,
          movilizacion: Number(salaryForm.movilizacion) || 0,
          gratificationType: salaryForm.gratificationType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "No se pudo guardar el sueldo");
      setSalary(json.data);
      toast.success("Sueldo guardado — proyecta a gasto 6.x en caja");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EntityDetailLayout
      breadcrumb={["Personas", "Equipo interno", persona.displayName]}
      header={{
        entityId: persona.id,
        avatar: { initials: persona.firstName.slice(0, 1).toUpperCase(), icon: Briefcase },
        title: persona.displayName,
        subtitle: persona.cargoLabel,
        status: {
          label: persona.status === "active" ? "Activo" : "Inactivo",
          variant: persona.status === "active" ? "success" : "secondary",
        },
      }}
      tabs={[
        { id: "info", label: "Ficha", icon: User },
        { id: "sueldo", label: "Sueldo", icon: DollarSign },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "info" && (
        <div className="ds-page-enter space-y-4">
          <Surface elevation={1} padding="md" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre">
                <Input
                  className="h-10 sm:h-9"
                  value={info.firstName}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, firstName: e.target.value }))}
                />
              </Field>
              <Field label="Apellido">
                <Input
                  className="h-10 sm:h-9"
                  value={info.lastName}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, lastName: e.target.value }))}
                />
              </Field>
              <Field label="RUT">
                <Input
                  className="h-10 sm:h-9 font-mono"
                  value={info.rut}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, rut: formatRutForInput(e.target.value) }))}
                />
              </Field>
              <Field label="Cargo">
                <select
                  className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  value={info.cargoStaff}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, cargoStaff: e.target.value as StaffCargo }))}
                >
                  {STAFF_CARGOS.map((c) => (
                    <option key={c} value={c}>
                      {STAFF_CARGO_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Email">
                <Input
                  className="h-10 sm:h-9"
                  type="email"
                  value={info.email}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, email: e.target.value }))}
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  className="h-10 sm:h-9"
                  value={info.phone}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, phone: e.target.value }))}
                />
              </Field>
              <Field label="AFP">
                <select
                  className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  value={info.afp}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, afp: e.target.value }))}
                >
                  <option value="">—</option>
                  {AFP_CHILE.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Salud">
                <select
                  className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  value={info.healthSystem}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, healthSystem: e.target.value }))}
                >
                  <option value="">—</option>
                  {HEALTH_SYSTEMS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </Field>
              {info.healthSystem === "isapre" && (
                <Field label="Isapre">
                  <select
                    className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                    value={info.isapreName}
                    disabled={!canEdit}
                    onChange={(e) => setInfo((p) => ({ ...p, isapreName: e.target.value }))}
                  >
                    <option value="">—</option>
                    {ISAPRES_CHILE.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Estado">
                <select
                  className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                  value={info.status}
                  disabled={!canEdit}
                  onChange={(e) => setInfo((p) => ({ ...p, status: e.target.value }))}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </Field>
            </div>
            {canEdit && (
              <div className="flex justify-end">
                <Button className="h-10 sm:h-9" onClick={() => void saveInfo()} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar ficha"}
                </Button>
              </div>
            )}
          </Surface>

          <Surface elevation={1} padding="md" className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-ds-text-3">Usuario ERP</p>
            {persona.admin ? (
              <p className="text-[13px] text-ds-text-2">
                Vinculado a <span className="text-ds-text-1 font-medium">{persona.admin.name}</span>{" "}
                ({persona.admin.email})
              </p>
            ) : (
              <p className="text-[13px] text-ds-text-3">
                Sin usuario de OPAI. Se puede vincular desde Configuración → Usuarios.
              </p>
            )}
          </Surface>
        </div>
      )}

      {tab === "sueldo" && (
        <div className="ds-page-enter space-y-4">
          <Surface elevation={1} padding="md" className="space-y-4">
            <div className="flex items-center gap-2">
              <Tag size="sm" variant="info">
                Gasto 6.x
              </Tag>
              <p className="text-[13px] text-ds-text-3">
                Proyecta líquido / quincena / Previred en Equipo interno. No genera liquidación de payroll en esta etapa.
              </p>
            </div>
            {salaryLoading ? (
              <p className="text-[13px] text-ds-text-3">Cargando sueldo…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sueldo base">
                  <Input
                    className="h-10 sm:h-9"
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={salaryForm.baseSalary}
                    onChange={(e) => setSalaryForm((p) => ({ ...p, baseSalary: e.target.value }))}
                  />
                </Field>
                <Field label="Colación">
                  <Input
                    className="h-10 sm:h-9"
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={salaryForm.colacion}
                    onChange={(e) => setSalaryForm((p) => ({ ...p, colacion: e.target.value }))}
                  />
                </Field>
                <Field label="Movilización">
                  <Input
                    className="h-10 sm:h-9"
                    inputMode="numeric"
                    disabled={!canEdit}
                    value={salaryForm.movilizacion}
                    onChange={(e) => setSalaryForm((p) => ({ ...p, movilizacion: e.target.value }))}
                  />
                </Field>
                <Field label="Gratificación">
                  <select
                    className="h-10 sm:h-9 w-full rounded-md border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
                    disabled={!canEdit}
                    value={salaryForm.gratificationType}
                    onChange={(e) => setSalaryForm((p) => ({ ...p, gratificationType: e.target.value }))}
                  >
                    <option value="AUTO_25">Automática 25%</option>
                    <option value="CUSTOM">Monto custom</option>
                  </select>
                </Field>
              </div>
            )}
            {salary && salary.source !== "NONE" && (
              <p className="text-[13px] text-ds-text-2">
                Base actual {clp(salary.baseSalary)} · colación {clp(salary.colacion)} · movilización{" "}
                {clp(salary.movilizacion)}
              </p>
            )}
            {canEdit && (
              <div className="flex justify-end">
                <Button className="h-10 sm:h-9" onClick={() => void saveSalary()} disabled={saving || salaryLoading}>
                  {saving ? "Guardando…" : salary?.structureId ? "Actualizar sueldo" : "Crear sueldo"}
                </Button>
              </div>
            )}
          </Surface>
        </div>
      )}
    </EntityDetailLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
