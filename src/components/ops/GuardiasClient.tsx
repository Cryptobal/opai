"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { EmptyState } from "@/components/opai";
import { ShieldUser, Plus, ExternalLink, LayoutGrid, List, Phone, MapPin, Building2, UserPlus, ChevronDown, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  completeRutWithDv,
  formatRutForInput,
  getLifecycleTransitions,
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
  currentInstallation?: {
    id: string;
    name: string;
  } | null;
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
    lat?: string | null;
    lng?: string | null;
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
  const router = useRouter();
  const [guardias, setGuardias] = useState<GuardiaItem[]>(initialGuardias);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [loadingPublicForm, setLoadingPublicForm] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("contratado");
  
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
  });
  const [rutError, setRutError] = useState<string | null>(null);

  const LIFECYCLE_LABELS: Record<string, string> = {
    postulante: "Postulante",
    seleccionado: "Seleccionado",
    contratado: "Contratado",
    te: "Turno Extra",
    inactivo: "Inactivo",
  };

  const LIFECYCLE_COLORS: Record<string, string> = {
    postulante: "bg-blue-500/15 text-blue-400",
    seleccionado: "bg-amber-500/15 text-amber-400",
    contratado: "bg-cyan-500/15 text-cyan-400",
    te: "bg-violet-500/15 text-violet-400",
    inactivo: "bg-muted text-muted-foreground",
  };

  const [contractDateModal, setContractDateModal] = useState<{ item: GuardiaItem; nextStatus: string } | null>(null);
  const [contractDate, setContractDate] = useState("");

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    cuenta_corriente: "Cuenta corriente",
    cuenta_vista: "Cuenta vista",
    cuenta_rut: "Cuenta RUT",
  };
  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canChangeLifecycle =
    hasOpsCapability(userRole, "guardias_manage") ||
    hasOpsCapability(userRole, "rrhh_events");
  const canIngresoTe =
    hasOpsCapability(userRole, "guardias_manage") ||
    hasOpsCapability(userRole, "guardias_te_ingreso");
  

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return guardias.filter((item) => {
      if (lifecycleFilter !== "all" && item.lifecycleStatus !== lifecycleFilter) return false;
      if (!query) return true;
      const text =
        `${item.persona.firstName} ${item.persona.lastName} ${item.persona.rut ?? ""} ${item.persona.email ?? ""} ${item.code ?? ""} ${item.persona.addressFormatted ?? ""}`.toLowerCase();
      return text.includes(query);
    });
  }, [guardias, search, lifecycleFilter]);

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
          holderName: normalizeRut(completedRut),
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
    if (lifecycleStatus === "contratado") {
      setContractDateModal({ item, nextStatus: lifecycleStatus });
      setContractDate(new Date().toISOString().slice(0, 10));
      return;
    }
    await doLifecycleChange(item, lifecycleStatus, undefined);
  };

  const doLifecycleChange = async (item: GuardiaItem, lifecycleStatus: string, effectiveAt?: string) => {
    setUpdatingId(item.id);
    try {
      const body: { lifecycleStatus: string; effectiveAt?: string } = { lifecycleStatus };
      if (effectiveAt) body.effectiveAt = effectiveAt;
      const response = await fetch(`/api/personas/guardias/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      setContractDateModal(null);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar estado laboral");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmContractDate = () => {
    if (!contractDateModal || !contractDate) {
      toast.error("Selecciona la fecha de inicio de contrato");
      return;
    }
    void doLifecycleChange(contractDateModal.item, contractDateModal.nextStatus, contractDate);
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
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {canIngresoTe && (
          <Button
            type="button"
            size="sm"
            className="h-8 px-2 text-xs"
            asChild
          >
            <Link href="/personas/guardias/ingreso-te">
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Ingreso rápido TE
            </Link>
          </Button>
        )}
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
              <div className="grid gap-3 md:grid-cols-3">
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
              </div>
              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={saving}>
                  {saving ? "Guardando..." : "Agregar guardia"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!contractDateModal} onOpenChange={(open) => !open && setContractDateModal(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Fecha de inicio de contrato</DialogTitle>
              <DialogDescription>
                Indica la fecha en que inicia el contrato de este guardia.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Fecha de inicio</label>
                <Input
                  type="date"
                  value={contractDate}
                  onChange={(e) => setContractDate(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setContractDateModal(null)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmContractDate} disabled={updatingId === contractDateModal?.item.id}>
                {updatingId === contractDateModal?.item.id ? "Guardando..." : "Confirmar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs w-full sm:w-[260px] shrink-0"
            />
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                lifecycleFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
              onClick={() => setLifecycleFilter("all")}
            >
              Todos
            </button>
            {GUARDIA_LIFECYCLE_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  lifecycleFilter === status
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setLifecycleFilter(status)}
              >
                {LIFECYCLE_LABELS[status] || status}
              </button>
            ))}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                {filtered.length} persona{filtered.length === 1 ? "" : "s"}
              </span>
              <div className="flex items-center rounded-md border border-border">
                <Button
                  type="button"
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  className="h-7 rounded-none rounded-l-md px-2"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  className="h-7 rounded-none rounded-r-md px-2"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShieldUser className="h-8 w-8" />}
              title="Sin personas"
              description="Agrega personas para habilitar asignación en pauta. Haz clic en una persona para ver su ficha, documentos, cuentas bancarias e historial."
              compact
            />
          ) : (
            <div className={viewMode === "grid" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-2"}>
              {filtered.map((item) => {
                const phone = item.persona.phoneMobile;
                const lat = item.persona.lat;
                const lng = item.persona.lng;
                const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/personas/guardias/${item.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/personas/guardias/${item.id}`);
                      }
                    }}
                    className={
                      viewMode === "grid"
                        ? "rounded-lg border border-border p-3 flex gap-3 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                        : "rounded-lg border border-border p-3 flex flex-col gap-1.5 md:flex-row md:items-center md:gap-6 hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                    }
                  >
                    {/* Nombre y contacto */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">
                          {item.persona.firstName} {item.persona.lastName}
                        </p>
                        {canChangeLifecycle ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className={`inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none hover:opacity-90 ${LIFECYCLE_COLORS[item.lifecycleStatus] || "bg-muted text-muted-foreground"}`}
                              >
                                {LIFECYCLE_LABELS[item.lifecycleStatus] || item.lifecycleStatus}
                                <ChevronDown className="h-3 w-3" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                              {getLifecycleTransitions(item.lifecycleStatus).map((status) => (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleLifecycleChange(item, status);
                                  }}
                                  disabled={updatingId === item.id}
                                >
                                  {updatingId === item.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                  ) : null}
                                  {LIFECYCLE_LABELS[status] || status}
                                </DropdownMenuItem>
                              ))}
                              {getLifecycleTransitions(item.lifecycleStatus).length === 0 && (
                                <DropdownMenuItem disabled>Sin transiciones</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${LIFECYCLE_COLORS[item.lifecycleStatus] || "bg-muted text-muted-foreground"}`}>
                            {LIFECYCLE_LABELS[item.lifecycleStatus] || item.lifecycleStatus}
                          </span>
                        )}
                        {item.code && (
                          <span className="text-[10px] text-muted-foreground/60 shrink-0">{item.code}</span>
                        )}
                      </div>

                      {phone ? (
                        <div className="flex items-center gap-2 mt-1 ml-4" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`tel:+56${phone}`}
                            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3" />
                            +56 {phone}
                          </a>
                          <a
                            href={`https://wa.me/56${phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-green-600/15 px-2 py-0.5 text-[11px] font-medium text-green-500 hover:bg-green-600/25 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            WhatsApp
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1 ml-4">Sin teléfono</p>
                      )}
                    </div>

                    {/* Instalación, ubicación y mapa — a la derecha en grid */}
                    <div className={
                      viewMode === "grid"
                        ? "shrink-0 flex flex-col items-end gap-1 text-right"
                        : "flex items-center gap-6 shrink-0"
                    }>
                      <div className={viewMode === "list" ? "min-w-[180px]" : ""}>
                        {item.currentInstallation ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                            <span className="text-xs font-medium truncate max-w-[160px]">{item.currentInstallation.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">Sin instalación</span>
                        )}
                      </div>
                      {(item.persona.city || item.persona.commune) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">
                            {[item.persona.commune, item.persona.city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                      {lat && lng && mapsKey ? (
                        <div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=14&size=120x80&scale=2&maptype=roadmap&markers=size:small%7Ccolor:red%7C${lat},${lng}&key=${mapsKey}`}
                            alt="Mapa"
                            className="rounded border border-border w-[90px] h-[58px] object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
