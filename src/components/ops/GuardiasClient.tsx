"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { EmptyState, StatusBadge } from "@/components/opai";
import { ShieldUser, Plus, ExternalLink, LayoutGrid, List } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  completeRutWithDv,
  formatRutForInput,
  GUARDIA_LIFECYCLE_STATUSES,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  isChileanRutFormat,
  isValidChileanRut,
  normalizeMobileNineDigits,
  normalizeRut,
  PERSON_SEX,
} from "@/lib/personas";
import { hasOpsCapability } from "@/lib/ops-rbac";

type GuardiaItem = {
  id: string;
  code?: string | null;
  status: string;
  lifecycleStatus: string;
  availableExtraShifts?: boolean;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
  persona: {
    firstName: string;
    lastName: string;
    rut?: string | null;
    email?: string | null;
    phone?: string | null;
    phoneMobile?: string | null;
    addressFormatted?: string | null;
    city?: string | null;
    commune?: string | null;
    birthDate?: string | null;
    afp?: string | null;
    healthSystem?: string | null;
    isapreName?: string | null;
    isapreHasExtraPercent?: boolean | null;
    isapreExtraPercent?: string | null;
    hasMobilization?: boolean | null;
  };
  bankAccounts?: Array<{
    id: string;
    bankName: string;
    accountType: string;
    accountNumber: string;
    isDefault: boolean;
  }>;
};

interface GuardiasClientProps {
  initialGuardias: GuardiaItem[];
  userRole: string;
}

export function GuardiasClient({ initialGuardias, userRole }: GuardiasClientProps) {
  const [guardias, setGuardias] = useState<GuardiaItem[]>(initialGuardias);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [loadingPublicForm, setLoadingPublicForm] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [blacklistFilter, setBlacklistFilter] = useState<"all" | "blacklisted" | "active">("all");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phoneMobile: "",
    lifecycleStatus: "postulante",
    addressFormatted: "",
    googlePlaceId: "",
    commune: "",
    city: "",
    region: "",
    sex: "",
    lat: "",
    lng: "",
    birthDate: "",
    afp: "",
    healthSystem: "fonasa",
    isapreName: "",
    isapreHasExtraPercent: false,
    isapreExtraPercent: "",
    hasMobilization: "si",
    availableExtraShifts: "si",
    notes: "",
    bankCode: "",
    accountType: "",
    accountNumber: "",
    holderName: "",
  });
  const [rutError, setRutError] = useState<string | null>(null);

  const LIFECYCLE_LABELS: Record<string, string> = {
    postulante: "Postulante",
    seleccionado: "Seleccionado",
    contratado_activo: "Contratado activo",
    inactivo: "Inactivo",
    desvinculado: "Desvinculado",
  };

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    cuenta_corriente: "Cuenta corriente",
    cuenta_vista: "Cuenta vista",
    cuenta_rut: "Cuenta RUT",
  };
  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canManageBlacklist = hasOpsCapability(userRole, "guardias_blacklist");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return guardias.filter((item) => {
      if (lifecycleFilter !== "all" && item.lifecycleStatus !== lifecycleFilter) return false;
      if (blacklistFilter === "blacklisted" && !item.isBlacklisted) return false;
      if (blacklistFilter === "active" && item.isBlacklisted) return false;
      if (!query) return true;
      const text =
        `${item.persona.firstName} ${item.persona.lastName} ${item.persona.rut ?? ""} ${item.persona.email ?? ""} ${item.code ?? ""} ${item.persona.addressFormatted ?? ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [guardias, search, lifecycleFilter, blacklistFilter]);

  const onAddressChange = (result: AddressResult) => {
    setForm((prev) => ({
      ...prev,
      addressFormatted: result.address,
      googlePlaceId: result.placeId || "",
      commune: result.commune || "",
      city: result.city || "",
      region: result.region || "",
      lat: String(result.lat || ""),
      lng: String(result.lng || ""),
    }));
  };

  const handleCreate = async () => {
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.rut.trim() ||
      !form.email.trim() ||
      !form.phoneMobile.trim() ||
      !form.birthDate ||
      !form.sex ||
      !form.afp ||
      !form.bankCode ||
      !form.accountType ||
      !form.accountNumber.trim()
    ) {
      toast.error("Completa todos los campos obligatorios del postulante");
      return;
    }
    const completedRut = completeRutWithDv(form.rut);
    if (!isChileanRutFormat(completedRut) || !isValidChileanRut(completedRut)) {
      setRutError("RUT inválido. Debe incluir guión y dígito verificador correcto.");
      toast.error("Corrige el RUT antes de continuar");
      return;
    }
    setForm((prev) => ({ ...prev, rut: completedRut }));
    setRutError(null);
    if (!form.googlePlaceId || !form.addressFormatted) {
      toast.error("Debes seleccionar la dirección desde Google Maps");
      return;
    }
    setSaving(true);
    try {
      const selectedBank = CHILE_BANKS.find((b) => b.code === form.bankCode);
      const response = await fetch("/api/personas/guardias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          rut: normalizeRut(completedRut),
          email: form.email.trim(),
          phoneMobile: normalizeMobileNineDigits(form.phoneMobile),
          lifecycleStatus: form.lifecycleStatus,
          addressFormatted: form.addressFormatted,
          googlePlaceId: form.googlePlaceId,
          commune: form.commune || null,
          city: form.city || null,
          region: form.region || null,
          sex: form.sex || null,
          lat: form.lat || null,
          lng: form.lng || null,
          birthDate: form.birthDate || null,
          afp: form.afp || null,
          healthSystem: form.healthSystem,
          isapreName: form.healthSystem === "isapre" ? form.isapreName || null : null,
          isapreHasExtraPercent: form.healthSystem === "isapre" ? form.isapreHasExtraPercent : false,
          isapreExtraPercent:
            form.healthSystem === "isapre" && form.isapreHasExtraPercent
              ? form.isapreExtraPercent || null
              : null,
          hasMobilization: form.hasMobilization === "si",
          availableExtraShifts: form.availableExtraShifts === "si",
          notes: form.notes || null,
          bankCode: form.bankCode || null,
          bankName: selectedBank?.name ?? null,
          accountType: form.accountType || null,
          accountNumber: form.accountNumber || null,
          holderName: form.holderName || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear guardia");
      }
      setGuardias((prev) => [payload.data as GuardiaItem, ...prev]);
      setForm({
        firstName: "",
        lastName: "",
        rut: "",
        email: "",
        phoneMobile: "",
        lifecycleStatus: "postulante",
        addressFormatted: "",
        googlePlaceId: "",
        commune: "",
        city: "",
        region: "",
        sex: "",
        lat: "",
        lng: "",
        birthDate: "",
        afp: "",
        healthSystem: "fonasa",
        isapreName: "",
        isapreHasExtraPercent: false,
        isapreExtraPercent: "",
        hasMobilization: "si",
        availableExtraShifts: "si",
        notes: "",
        bankCode: "",
        accountType: "",
        accountNumber: "",
        holderName: "",
      });
      setRutError(null);
      toast.success("Guardia creado");
      setCreateModalOpen(false);
    } catch (error) {
      console.error(error);
      const msg = (error as Error)?.message || "No se pudo crear guardia";
      if (/rut|root/i.test(msg)) {
        setRutError("RUT ya ingresado / root ya ingresado. Comunicarse con recursos humanos.");
      }
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleLifecycleChange = async (item: GuardiaItem, lifecycleStatus: string) => {
    setUpdatingId(item.id);
    try {
      const response = await fetch(`/api/personas/guardias/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo cambiar el estado laboral");
      }
      setGuardias((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                lifecycleStatus: payload.data.lifecycleStatus,
                status: payload.data.status,
              }
            : row
        )
      );
      toast.success("Estado laboral actualizado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar estado laboral");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleBlacklistToggle = async (item: GuardiaItem) => {
    const isBlacklisted = !item.isBlacklisted;
    const reason = isBlacklisted
      ? window.prompt("Motivo de lista negra:", item.blacklistReason ?? "") ?? ""
      : null;

    setUpdatingId(item.id);
    try {
      const response = await fetch(`/api/personas/guardias/${item.id}/lista-negra`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isBlacklisted,
          reason,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo actualizar lista negra");
      }
      setGuardias((prev) =>
        prev.map((row) =>
          row.id === item.id
            ? {
                ...row,
                isBlacklisted: payload.data.isBlacklisted,
                blacklistReason: payload.data.blacklistReason,
              }
            : row
        )
      );
      toast.success(isBlacklisted ? "Guardia enviado a lista negra" : "Guardia removido de lista negra");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar lista negra");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenPublicPostulacion = async () => {
    setLoadingPublicForm(true);
    try {
      const response = await fetch("/api/personas/postulacion-link");
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo generar el link de postulación");
      }
      const path = payload.data?.path as string | undefined;
      if (!path) {
        throw new Error("No se recibió el link");
      }
      window.open(path, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo abrir el formulario de postulación");
    } finally {
      setLoadingPublicForm(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          disabled={loadingPublicForm || !canManageGuardias}
          onClick={() => void handleOpenPublicPostulacion()}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1" />
          Acceder al formulario de postulación
        </Button>
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-8 w-8"
              title="Agregar postulante manualmente"
              disabled={!canManageGuardias}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>Nuevo postulante (manual)</DialogTitle>
              <DialogDescription>
                Crea un postulante manualmente desde Ops. Los campos obligatorios son nombre, apellido, RUT, email, celular y dirección.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="Nombre *"
                  value={form.firstName}
                  onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                />
                <Input
                  placeholder="Apellido *"
                  value={form.lastName}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                />
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.lifecycleStatus}
                  onChange={(e) => setForm((prev) => ({ ...prev, lifecycleStatus: e.target.value }))}
                >
                  {GUARDIA_LIFECYCLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {LIFECYCLE_LABELS[status] || status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Input
                    placeholder="RUT * (sin puntos y con guión)"
                    value={form.rut}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        rut: formatRutForInput(e.target.value),
                      }))
                    }
                    onBlur={() => {
                      const completed = completeRutWithDv(form.rut);
                      setForm((prev) => ({ ...prev, rut: completed }));
                      if (completed && (!isChileanRutFormat(completed) || !isValidChileanRut(completed))) {
                        setRutError("RUT inválido. Debe incluir guión y dígito verificador correcto.");
                      } else {
                        setRutError(null);
                      }
                    }}
                  />
                  {rutError ? <p className="text-xs text-red-400">{rutError}</p> : null}
                </div>
                <Input
                  placeholder="Email *"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                />
                <Input
                  placeholder="Celular * (9 dígitos)"
                  value={form.phoneMobile}
                  maxLength={9}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      phoneMobile: normalizeMobileNineDigits(e.target.value).slice(0, 9),
                    }))
                  }
                />
              </div>
              <AddressAutocomplete
                value={form.addressFormatted}
                onChange={onAddressChange}
                placeholder="Dirección (Google Maps) *"
                showMap
              />
              <div className="grid gap-3 md:grid-cols-3">
                <Input placeholder="Comuna" value={form.commune} readOnly />
                <Input placeholder="Ciudad" value={form.city} readOnly />
                <Input placeholder="Región" value={form.region} readOnly />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.sex}
                  onChange={(e) => setForm((prev) => ({ ...prev, sex: e.target.value }))}
                >
                  <option value="">Sexo *</option>
                  {PERSON_SEX.map((sex) => (
                    <option key={sex} value={sex}>
                      {sex}
                    </option>
                  ))}
                </select>
                <Input
                  type="date"
                  placeholder="Fecha de nacimiento *"
                  value={form.birthDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                />
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.afp}
                  onChange={(e) => setForm((prev) => ({ ...prev, afp: e.target.value }))}
                >
                  <option value="">AFP *</option>
                  {AFP_CHILE.map((afp) => (
                    <option key={afp} value={afp}>
                      {afp}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.healthSystem}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      healthSystem: e.target.value,
                      isapreName: "",
                      isapreHasExtraPercent: false,
                      isapreExtraPercent: "",
                    }))
                  }
                >
                  {HEALTH_SYSTEMS.map((health) => (
                    <option key={health} value={health}>
                      {health.toUpperCase()}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.hasMobilization}
                  onChange={(e) => setForm((prev) => ({ ...prev, hasMobilization: e.target.value }))}
                >
                  <option value="si">Con movilización</option>
                  <option value="no">Sin movilización</option>
                </select>
              </div>
              {form.healthSystem === "isapre" ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <select
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                    value={form.isapreName}
                    onChange={(e) => setForm((prev) => ({ ...prev, isapreName: e.target.value }))}
                  >
                    <option value="">Isapre *</option>
                    {ISAPRES_CHILE.map((isapre) => (
                      <option key={isapre} value={isapre}>
                        {isapre}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                    value={form.isapreHasExtraPercent ? "si" : "no"}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        isapreHasExtraPercent: e.target.value === "si",
                        isapreExtraPercent: e.target.value === "si" ? prev.isapreExtraPercent : "",
                      }))
                    }
                  >
                    <option value="no">Cotiza solo 7%</option>
                    <option value="si">Cotiza sobre 7%</option>
                  </select>
                  <Input
                    type="number"
                    step="0.01"
                    min="7.01"
                    placeholder="Porcentaje ISAPRE"
                    value={form.isapreExtraPercent}
                    disabled={!form.isapreHasExtraPercent}
                    onChange={(e) => setForm((prev) => ({ ...prev, isapreExtraPercent: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.availableExtraShifts}
                  onChange={(e) => setForm((prev) => ({ ...prev, availableExtraShifts: e.target.value }))}
                >
                  <option value="si">Disponible para turnos extra</option>
                  <option value="no">No disponible para turnos extra</option>
                </select>
                <Input
                  placeholder="Notas / comentarios"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.bankCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, bankCode: e.target.value }))}
                >
                  <option value="">Banco chileno *</option>
                  {CHILE_BANKS.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                  value={form.accountType}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountType: e.target.value }))}
                >
                  <option value="">Tipo de cuenta *</option>
                  {BANK_ACCOUNT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ACCOUNT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Número de cuenta *"
                  value={form.accountNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                />
                <Input
                  placeholder="Titular cuenta"
                  value={form.holderName}
                  onChange={(e) => setForm((prev) => ({ ...prev, holderName: e.target.value }))}
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input placeholder="Latitud" value={form.lat} readOnly />
                <Input placeholder="Longitud" value={form.lng} readOnly />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? "Guardando..." : "Agregar guardia"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <Input
              placeholder="Buscar por nombre, RUT, email o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="lg:flex-1"
            />
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              {GUARDIA_LIFECYCLE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {LIFECYCLE_LABELS[status] || status}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={blacklistFilter}
              onChange={(e) =>
                setBlacklistFilter(e.target.value as "all" | "blacklisted" | "active")
              }
            >
              <option value="all">Todos</option>
              <option value="active">Sin lista negra</option>
              <option value="blacklisted">Solo lista negra</option>
            </select>
            <div className="flex items-center rounded-md border border-border">
              <Button
                type="button"
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                className="h-10 rounded-none rounded-l-md px-3"
                onClick={() => setViewMode("grid")}
              >
                <LayoutGrid className="mr-1.5 h-4 w-4" />
                Grid
              </Button>
              <Button
                type="button"
                variant={viewMode === "list" ? "secondary" : "ghost"}
                className="h-10 rounded-none rounded-r-md px-3"
                onClick={() => setViewMode("list")}
              >
                <List className="mr-1.5 h-4 w-4" />
                Lista
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {filtered.length} guardia{filtered.length === 1 ? "" : "s"} encontrados
          </p>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShieldUser className="h-8 w-8" />}
              title="Sin guardias"
              description="Agrega guardias para habilitar asignación en pauta. Luego haz clic en «Ficha y documentos» para cargar antecedentes, OS-10, cédula, currículum y contratos de cada uno."
              compact
            />
          ) : (
            <div className={viewMode === "grid" ? "grid gap-2 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className={
                    viewMode === "grid"
                      ? "rounded-lg border border-border p-3 sm:p-4 flex h-full flex-col justify-between gap-3"
                      : "rounded-lg border border-border p-3 sm:p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                  }
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.persona.firstName} {item.persona.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.persona.rut || "Sin RUT"}
                      {item.code ? ` · Código ${item.code}` : ""}
                      {item.persona.phoneMobile ? ` · +56 ${item.persona.phoneMobile}` : ""}
                      {typeof item.availableExtraShifts === "boolean"
                        ? ` · ${item.availableExtraShifts ? "TE disponible" : "Sin TE"}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.persona.addressFormatted || "Sin dirección validada"}
                    </p>
                    {item.bankAccounts?.[0] ? (
                      <p className="text-xs text-muted-foreground">
                        {item.bankAccounts[0].bankName} · {ACCOUNT_TYPE_LABELS[item.bankAccounts[0].accountType] || item.bankAccounts[0].accountType}
                      </p>
                    ) : null}
                    {item.blacklistReason && (
                      <p className="text-xs text-red-400 mt-1">Motivo: {item.blacklistReason}</p>
                    )}
                  </div>
                  <div className={viewMode === "grid" ? "flex flex-wrap items-center gap-2" : "flex items-center gap-2"}>
                    <StatusBadge status={item.status} />
                    <select
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                      value={item.lifecycleStatus}
                      disabled={updatingId === item.id || !canManageGuardias}
                      onChange={(e) => void handleLifecycleChange(item, e.target.value)}
                    >
                      {GUARDIA_LIFECYCLE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {LIFECYCLE_LABELS[status] || status}
                        </option>
                      ))}
                    </select>
                    {item.isBlacklisted ? (
                      <span className="text-[11px] rounded-full bg-red-500/15 px-2 py-1 text-red-400">
                        Lista negra
                      </span>
                    ) : null}
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                    >
                      <Link href={`/personas/guardias/${item.id}`}>Ficha y documentos</Link>
                    </Button>
                    {canManageBlacklist ? (
                      <Button
                        size="sm"
                        variant={item.isBlacklisted ? "outline" : "ghost"}
                        disabled={updatingId === item.id}
                        onClick={() => void handleBlacklistToggle(item)}
                      >
                        {item.isBlacklisted ? "Quitar lista negra" : "Lista negra"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
