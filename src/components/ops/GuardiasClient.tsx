"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import { Avatar, EmptyState } from "@/components/opai";
import { ShieldUser, Plus, ExternalLink, Phone, MapPin, Building2, UserPlus, ChevronDown, ChevronRight, Loader2, RefreshCw, Share2, MessageCircle, FileCheck, FileX } from "lucide-react";
import { ListToolbar } from "@/components/shared/ListToolbar";
import type { ViewMode } from "@/components/shared/ViewToggle";
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
import { formatPersonName } from "@/lib/personas";
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
import { canEditGuardiasPlanSeleccion, hasOpsCapability } from "@/lib/ops-rbac";
import { SeleccionadoDestinoFields } from "@/components/ops/SeleccionadoDestinoFields";

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
  intendedInstallationId?: string | null;
  intendedContractDate?: string | null;
  intendedInstallation?: {
    id: string;
    name: string;
    account?: { id?: string; name?: string | null } | null;
  } | null;
  intendedPlanUpdatedAt?: string | null;
  intendedPlanUpdatedBy?: { id: string; name: string } | null;
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
  faceIdPhotoUrl?: string | null;
  marcacionPin?: string | null;
  marcacionPinVisible?: string | null;
  hasHistorialPenal?: boolean;
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
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
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
  const [refreshing, setRefreshing] = useState(false);
  const [bulkPinLoading, setBulkPinLoading] = useState(false);
  const [gridData, setGridData] = useState<Record<string, Record<string, string>[]> | null>(null);
  const [gridSummary, setGridSummary] = useState<Record<string, { dotacion: number; asignados: number; ppc: number }>>({});
  const [gridLoading, setGridLoading] = useState(false);
  const [gridCollapsed, setGridCollapsed] = useState<Record<string, boolean>>({});

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  const handleBulkPinVisible = async () => {
    setBulkPinLoading(true);
    try {
      const res = await fetch("/api/ops/marcacion/pin/bulk", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.error || "Error generando PINs visibles");
        return;
      }
      toast.success(data.message ?? `PINs visibles generados para ${data.data?.updated ?? 0} guardias`);
      router.refresh();
    } catch {
      toast.error("Error de conexión");
    } finally {
      setBulkPinLoading(false);
    }
  };

  const handleExportExcel = async (mode: "activos" | "historico") => {
    try {
      const response = await fetch(`/api/personas/guardias/export-excel?mode=${mode}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "No se pudo generar el Excel");
      }
      const blob = await response.blob();
      const fileName =
        mode === "activos"
          ? `guardias-activos-${new Date().toISOString().slice(0, 10)}.xlsx`
          : `guardias-activos-e-inactivos-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel descargado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo descargar el Excel");
    }
  };

  const handleLoadGrid = async () => {
    setGridLoading(true);
    try {
      const mode = lifecycleFilter === "inactivo" ? "historico" : "activos";
      const res = await fetch(`/api/personas/guardias/grid-data?mode=${mode}`);
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        toast.error(payload.error || "No se pudo cargar la grilla");
        return;
      }
      setGridData(payload.data);
      setGridSummary(payload.summary ?? {});
      // Start with all collapsed
      const collapsed: Record<string, boolean> = {};
      for (const inst of Object.keys(payload.data)) {
        collapsed[inst] = true;
      }
      setGridCollapsed(collapsed);
    } catch {
      toast.error("Error de conexión al cargar grilla");
    } finally {
      setGridLoading(false);
    }
  };

  const handleViewChange = (newView: ViewMode) => {
    setViewMode(newView);
    if (newView === "spreadsheet" && !gridData) {
      void handleLoadGrid();
    }
  };

  const toggleInstallation = (inst: string) => {
    setGridCollapsed((prev) => ({ ...prev, [inst]: !prev[inst] }));
  };

  const GRID_COLUMNS = [
    { key: "puesto", label: "Puesto", width: "140px" },
    { key: "jornada", label: "Jornada", width: "100px" },
    { key: "codigo", label: "Código", width: "90px" },
    { key: "estadoLaboral", label: "Estado", width: "100px" },
    { key: "nombre", label: "Nombre", width: "130px" },
    { key: "apellido", label: "Apellido", width: "150px" },
    { key: "rut", label: "RUT", width: "110px" },
    { key: "nacionalidad", label: "Nacionalidad", width: "110px" },
    { key: "sexo", label: "Sexo", width: "60px" },
    { key: "fechaNac", label: "F. Nac.", width: "95px" },
    { key: "edad", label: "Edad", width: "50px" },
    { key: "os10", label: "OS-10", width: "60px" },
    { key: "os10Expira", label: "Venc. OS-10", width: "110px" },
    { key: "afp", label: "AFP", width: "90px" },
    { key: "salud", label: "Salud", width: "130px" },
    { key: "movilizacion", label: "Mov.", width: "55px" },
    { key: "turnosExtra", label: "T. Extra", width: "65px" },
    { key: "contrato", label: "Contrato", width: "70px" },
    { key: "fechaIngreso", label: "F. Ingreso", width: "95px" },
    { key: "fechaTermino", label: "F. Término", width: "95px" },
    { key: "calzado", label: "Calzado", width: "65px" },
    { key: "pantalon", label: "Pantalón", width: "70px" },
    { key: "polera", label: "Polera", width: "60px" },
    { key: "camisa", label: "Camisa", width: "65px" },
    { key: "geologo", label: "Geólogo", width: "65px" },
    { key: "polar", label: "Polar", width: "60px" },
    { key: "chaqueta", label: "Chaqueta", width: "70px" },
    { key: "estatura", label: "Est. (cm)", width: "70px" },
    { key: "peso", label: "Peso (kg)", width: "70px" },
    { key: "celular", label: "Celular", width: "120px" },
    { key: "email", label: "Email", width: "200px" },
    { key: "direccion", label: "Dirección", width: "250px" },
    { key: "comuna", label: "Comuna", width: "120px" },
    { key: "ciudad", label: "Ciudad", width: "120px" },
  ];

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    cuenta_corriente: "Cuenta corriente",
    cuenta_vista: "Cuenta vista",
    cuenta_rut: "Cuenta RUT",
  };
  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canEditPlanSeleccion = canEditGuardiasPlanSeleccion(userRole);
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
        `${formatPersonName(item.persona.firstName, item.persona.lastName)} ${item.persona.rut ?? ""} ${item.persona.email ?? ""} ${item.code ?? ""} ${item.persona.addressFormatted ?? ""} ${item.marcacionPinVisible ?? ""} ${item.currentInstallation?.name ?? ""} ${item.intendedInstallation?.name ?? ""} ${item.intendedInstallation?.account?.name ?? ""}`.toLowerCase();
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

  const pinDisplay = (item: GuardiaItem) => {
    if (item.marcacionPinVisible) return `PIN: ${item.marcacionPinVisible}`;
    if (item.marcacionPin) return "Recargar para generar";
    return null;
  };

  return (
    <div className="space-y-4 min-w-0 overflow-x-hidden">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          onClick={handleRefresh}
          disabled={refreshing}
          title="Recargar lista"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Recargar
        </Button>
        {canManageGuardias && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => void handleBulkPinVisible()}
            disabled={bulkPinLoading}
            title="Generar PINs visibles para todos los guardias activos que no lo tienen"
          >
            {bulkPinLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Generar PINs visibles
          </Button>
        )}
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
          onClick={() => void handleExportExcel("activos")}
        >
          Descargar base guardias activos
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs"
          onClick={() => void handleExportExcel("historico")}
        >
          Descargar activos + inactivos
        </Button>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-2 text-xs"
            >
              <Share2 className="h-3.5 w-3.5 mr-1" />
              Compartir enlace
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const url = `${window.location.origin}/ingreso-te`;
                const msg = `Hola, te invitamos a completar tu registro como guardia de Turno Extra. Ingresa aquí: ${url}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
              }}
            >
              <MessageCircle className="h-3.5 w-3.5 mr-2 text-emerald-500" />
              Enviar formulario Turno Extra
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const response = await fetch("/api/personas/postulacion-link");
                  const payload = await response.json();
                  if (!response.ok || !payload.success) throw new Error(payload.error);
                  const url = payload.data?.url || `${window.location.origin}${payload.data?.path}`;
                  const msg = `Hola, te invitamos a postularte como guardia. Completa el formulario aquí: ${url}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
                } catch {
                  toast.error("No se pudo generar el link de postulación");
                }
              }}
            >
              <MessageCircle className="h-3.5 w-3.5 mr-2 text-emerald-500" />
              Enviar formulario Postulación
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                    className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
        <CardContent className="pt-4 space-y-2.5 min-w-0 overflow-hidden">
          <ListToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Buscar por nombre, RUT, email..."
            filters={[
              { key: "all", label: "Todos" },
              ...GUARDIA_LIFECYCLE_STATUSES.map((s) => ({
                key: s,
                label: LIFECYCLE_LABELS[s] || s,
              })),
            ]}
            activeFilter={lifecycleFilter}
            onFilterChange={setLifecycleFilter}
            viewModes={["list", "cards", "spreadsheet"]}
            activeView={viewMode}
            onViewChange={handleViewChange}
            actionSlot={
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} persona{filtered.length === 1 ? "" : "s"}
              </span>
            }
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShieldUser className="h-8 w-8" />}
              title="Sin personas"
              description="Agrega personas para habilitar asignación en pauta. Haz clic en una persona para ver su ficha, documentos, cuentas bancarias e historial."
              compact
            />
          ) : viewMode === "cards" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 min-w-0">
              {filtered.map((item) => {
                const phone = item.persona.phoneMobile;
                const fullName = formatPersonName(item.persona.firstName, item.persona.lastName);

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
                    className="rounded-lg border border-border p-3 flex gap-3 min-w-0 overflow-hidden hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <Avatar name={fullName} photoUrl={item.faceIdPhotoUrl} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <p className="text-sm font-semibold truncate">{fullName}</p>
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
                        </div>
                        {pinDisplay(item) && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-emerald-500/20 text-emerald-400">
                            {pinDisplay(item)}
                          </span>
                        )}
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            item.hasHistorialPenal
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-red-500/15 text-red-400"
                          }`}
                          title={item.hasHistorialPenal ? "Antecedentes penales al día" : "Sin antecedentes penales"}
                        >
                          {item.hasHistorialPenal ? <FileCheck className="h-3 w-3" /> : <FileX className="h-3 w-3" />}
                          Ant. Penales
                        </span>
                      </div>
                      {item.code && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{item.code}</p>
                      )}
                      {phone ? (
                        <div className="flex items-center gap-2 mt-1" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={`tel:+56${phone}`}
                            className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Phone className="h-3 w-3" />
                            +56 {phone}
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">Sin teléfono</p>
                      )}
                      {(item.lifecycleStatus === "seleccionado" ||
                        item.intendedInstallationId ||
                        item.intendedContractDate) && (
                        <SeleccionadoDestinoFields
                          guardiaId={item.id}
                          lifecycleStatus={item.lifecycleStatus}
                          intendedInstallationId={item.intendedInstallationId}
                          intendedContractDate={item.intendedContractDate}
                          intendedInstallation={item.intendedInstallation}
                          intendedPlanUpdatedAt={item.intendedPlanUpdatedAt}
                          intendedPlanUpdatedBy={item.intendedPlanUpdatedBy}
                          canEdit={canEditPlanSeleccion}
                          compact
                          className="mt-2"
                          onUpdated={(patch) => {
                            setGuardias((prev) =>
                              prev.map((g) =>
                                g.id === item.id
                                  ? {
                                      ...g,
                                      ...patch,
                                      intendedInstallation:
                                        patch.intendedInstallation !== undefined
                                          ? patch.intendedInstallation ?? null
                                          : g.intendedInstallation,
                                    }
                                  : g
                              )
                            );
                          }}
                        />
                      )}
                      <div className="mt-1.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {[item.currentInstallation?.name, item.persona.rut].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {(item.persona.city || item.persona.commune) && (
                          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                            <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs text-muted-foreground truncate min-w-0">
                              {[item.persona.commune, item.persona.city].filter(Boolean).join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "list" ? (
            /* ── Vista lista: grid con columnas fijas ── */
            <div className="space-y-1.5 min-w-0">
              {/* Desktop column headers */}
              <div className="hidden md:grid grid-cols-[auto_1fr_auto_minmax(120px,180px)_minmax(140px,200px)] items-center gap-4 px-3 py-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                <div className="w-8" />
                <div>Persona</div>
                <div className="w-[120px]">Teléfono</div>
                <div>Ubicación</div>
                <div>Instalación</div>
              </div>
              {filtered.map((item) => {
                const phone = item.persona.phoneMobile;
                const fullName = formatPersonName(item.persona.firstName, item.persona.lastName);

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
                    className="rounded-lg border border-border px-3 py-2.5 grid grid-cols-[auto_1fr_auto_minmax(120px,180px)_minmax(140px,200px)] items-center gap-4 min-w-0 overflow-hidden hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer max-md:grid-cols-[auto_1fr_auto] max-md:gap-2"
                  >
                    {/* Col 1: Avatar */}
                    <Avatar name={fullName} photoUrl={item.faceIdPhotoUrl} size="md" />

                    {/* Col 2: Nombre + estado + teléfono + mobile extras */}
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-sm font-semibold truncate min-w-0">{fullName}</p>
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
                            <span className="text-xs text-muted-foreground/60 shrink-0">{item.code}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {pinDisplay(item) && (
                            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums bg-emerald-500/20 text-emerald-400">
                              {pinDisplay(item)}
                            </span>
                          )}
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              item.hasHistorialPenal
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-red-500/15 text-red-400"
                            }`}
                            title={item.hasHistorialPenal ? "Antecedentes penales al día" : "Sin antecedentes penales"}
                          >
                            {item.hasHistorialPenal ? <FileCheck className="h-3 w-3" /> : <FileX className="h-3 w-3" />}
                            <span className="hidden lg:inline">Ant. Penales</span>
                          </span>
                        </div>
                      </div>
                      {phone ? (
                        <div className="flex items-center gap-2 mt-0.5" onClick={(e) => e.stopPropagation()}>
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
                            className="inline-flex items-center gap-1 rounded-full bg-green-600/15 px-2 py-0.5 text-xs font-medium text-green-500 hover:bg-green-600/25 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                            </svg>
                            WhatsApp
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">Sin teléfono</p>
                      )}
                      {/* Mobile: show installation and location inline */}
                      <div className="md:hidden mt-1 flex items-center gap-3 flex-wrap min-w-0">
                        {item.currentInstallation && (
                          <span className="inline-flex items-center gap-1 text-xs min-w-0">
                            <Building2 className="h-3 w-3 text-violet-400 shrink-0" />
                            <span className="truncate">{item.currentInstallation.name}</span>
                          </span>
                        )}
                        {(item.persona.city || item.persona.commune) && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground min-w-0">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{[item.persona.commune, item.persona.city].filter(Boolean).join(", ")}</span>
                          </span>
                        )}
                      </div>
                      {(item.lifecycleStatus === "seleccionado" ||
                        item.intendedInstallationId ||
                        item.intendedContractDate) && (
                        <div className="md:hidden mt-2 w-full min-w-0" onClick={(e) => e.stopPropagation()}>
                          <SeleccionadoDestinoFields
                            guardiaId={item.id}
                            lifecycleStatus={item.lifecycleStatus}
                            intendedInstallationId={item.intendedInstallationId}
                            intendedContractDate={item.intendedContractDate}
                            intendedInstallation={item.intendedInstallation}
                            intendedPlanUpdatedAt={item.intendedPlanUpdatedAt}
                            intendedPlanUpdatedBy={item.intendedPlanUpdatedBy}
                            canEdit={canEditPlanSeleccion}
                            compact
                            className="!p-1.5"
                            onUpdated={(patch) => {
                              setGuardias((prev) =>
                                prev.map((g) =>
                                  g.id === item.id
                                    ? {
                                        ...g,
                                        ...patch,
                                        intendedInstallation:
                                          patch.intendedInstallation !== undefined
                                            ? patch.intendedInstallation ?? null
                                            : g.intendedInstallation,
                                      }
                                    : g
                                )
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Chevron for mobile */}
                    <div className="md:hidden shrink-0 text-muted-foreground">
                      <ChevronDown className="h-4 w-4 -rotate-90" />
                    </div>

                    {/* Col 3: Phone (desktop only) */}
                    <div className="min-w-0 max-md:hidden w-[120px] shrink-0">
                      {phone ? (
                        <span className="text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                          <a href={`tel:+56${phone}`} className="hover:text-sky-400 transition-colors">+56 {phone}</a>
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </div>

                    {/* Col 4: Ubicación (hidden on mobile) */}
                    <div className="min-w-0 max-md:hidden">
                      {(item.persona.city || item.persona.commune) ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground truncate min-w-0">
                            {[item.persona.commune, item.persona.city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">Sin ubicación</span>
                      )}
                    </div>

                    {/* Col 4: Instalación (hidden on mobile) */}
                    <div className="min-w-0 max-md:hidden space-y-1">
                      {item.currentInstallation ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                          <span className="text-xs font-medium truncate min-w-0">{item.currentInstallation.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 italic">Sin instalación</span>
                      )}
                      {(item.lifecycleStatus === "seleccionado" ||
                        item.intendedInstallationId ||
                        item.intendedContractDate) && (
                        <SeleccionadoDestinoFields
                          guardiaId={item.id}
                          lifecycleStatus={item.lifecycleStatus}
                          intendedInstallationId={item.intendedInstallationId}
                          intendedContractDate={item.intendedContractDate}
                          intendedInstallation={item.intendedInstallation}
                          intendedPlanUpdatedAt={item.intendedPlanUpdatedAt}
                          intendedPlanUpdatedBy={item.intendedPlanUpdatedBy}
                          canEdit={canEditPlanSeleccion}
                          compact
                          className="!p-1.5"
                          onUpdated={(patch) => {
                            setGuardias((prev) =>
                              prev.map((g) =>
                                g.id === item.id
                                  ? {
                                      ...g,
                                      ...patch,
                                      intendedInstallation:
                                        patch.intendedInstallation !== undefined
                                          ? patch.intendedInstallation ?? null
                                          : g.intendedInstallation,
                                    }
                                  : g
                              )
                            );
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "spreadsheet" ? (
            /* ── Vista grilla: tabla tipo Excel agrupada por instalación ── */
            <div className="space-y-2 min-w-0">
              {gridLoading ? (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Cargando grilla…</span>
                </div>
              ) : !gridData ? (
                <EmptyState
                  icon={<ShieldUser className="h-8 w-8" />}
                  title="Sin datos"
                  description="No se pudieron cargar los datos de la grilla."
                  compact
                />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        const allExpanded = Object.values(gridCollapsed).every((v) => !v);
                        const next: Record<string, boolean> = {};
                        for (const inst of Object.keys(gridData)) {
                          next[inst] = allExpanded;
                        }
                        setGridCollapsed(next);
                      }}
                    >
                      {Object.values(gridCollapsed).every((v) => !v) ? "Colapsar todo" : "Expandir todo"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleLoadGrid()}
                      disabled={gridLoading}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${gridLoading ? "animate-spin" : ""}`} />
                      Recargar
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {Object.values(gridData).reduce((sum, rows) => sum + rows.length, 0)} registros en {Object.keys(gridData).length} instalaciones
                    </span>
                  </div>
                  {Object.entries(gridData).map(([instName, rows]) => {
                    const s = gridSummary[instName];
                    return (
                    <div key={instName} className="border border-border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 hover:bg-muted/80 transition-colors text-left"
                        onClick={() => toggleInstallation(instName)}
                      >
                        {gridCollapsed[instName] ? (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                        <span className="text-sm font-semibold">{instName}</span>
                        {s && s.dotacion > 0 && (
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
                            <span>Dotación <span className="font-semibold text-foreground/80">{s.dotacion}</span></span>
                            <span className="text-border">·</span>
                            <span>Guardias <span className="font-semibold text-foreground/80">{s.asignados}</span></span>
                            {s.ppc > 0 && (
                              <>
                                <span className="text-border">·</span>
                                <span className="text-amber-400">PPC <span className="font-semibold">{s.ppc}</span></span>
                              </>
                            )}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">{rows.length} guardia{rows.length !== 1 ? "s" : ""}</span>
                      </button>
                      {!gridCollapsed[instName] && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-[#0F2847] text-white sticky top-0 z-10">
                                {GRID_COLUMNS.map((col) => (
                                  <th
                                    key={col.key}
                                    className="px-2 py-1.5 text-left font-semibold whitespace-nowrap border-r border-[#1a3a5c] last:border-r-0"
                                    style={{ minWidth: col.width }}
                                  >
                                    {col.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, idx) => (
                                <tr
                                  key={row.id + "-" + idx}
                                  className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
                                  onClick={() => row.id && router.push(`/personas/guardias/${row.id}`)}
                                >
                                  {GRID_COLUMNS.map((col) => (
                                    <td
                                      key={col.key}
                                      className="px-2 py-1 whitespace-nowrap border-r border-border/50 last:border-r-0 font-mono"
                                      title={row[col.key] || ""}
                                    >
                                      {col.key === "os10" ? (
                                        <span className={row[col.key] === "Sí" ? "text-emerald-400" : "text-muted-foreground"}>
                                          {row[col.key] || "—"}
                                        </span>
                                      ) : col.key === "os10Expira" && row[col.key] ? (
                                        <span className="tabular-nums">{row[col.key]}</span>
                                      ) : col.key === "estadoLaboral" ? (
                                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none ${LIFECYCLE_COLORS[row[col.key]] || "bg-muted text-muted-foreground"}`}>
                                          {LIFECYCLE_LABELS[row[col.key]] || row[col.key]}
                                        </span>
                                      ) : (
                                        <span className="truncate max-w-full block">{row[col.key] || "—"}</span>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                  })}
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
