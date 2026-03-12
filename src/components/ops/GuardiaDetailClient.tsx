"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  ChevronDown,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Phone,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CollapsibleSection } from "@/components/crm/CollapsibleSection";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Avatar } from "@/components/opai";
import { cn } from "@/lib/utils";
import { ChipTabs } from "@/components/ui/chip-tabs";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { formatPersonName } from "@/lib/personas";
import {
  AFP_CHILE,
  getLifecycleTransitions,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  PAISES_AMERICA,
  REGIMEN_PREVISIONAL,
  TIPO_PENSION,
} from "@/lib/personas";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { PersonaRendicionesTab } from "@/components/finance/PersonaRendicionesTab";
import { GuardEventsTab } from "@/components/ops/guard-events";
import { GuardContractsTab } from "@/components/ops/guard-contracts";
import { GuardiaSalaryTab } from "@/components/ops/GuardiaSalaryTab";
import { GuardiaLiquidacionesTab } from "@/components/payroll/GuardiaLiquidacionesTab";
import { InventarioGuardiaAssignmentsSection } from "@/components/inventario/InventarioGuardiaAssignmentsSection";
import DatosPersonalesSection from "@/components/ops/guardia-sections/DatosPersonalesSection";
import AsignacionSection from "@/components/ops/guardia-sections/AsignacionSection";
import MarcacionSection from "@/components/ops/guardia-sections/MarcacionSection";
import RondasSection from "@/components/ops/guardia-sections/RondasSection";
import DocumentosSection from "@/components/ops/guardia-sections/DocumentosSection";
import { FileAttachments } from "@/components/crm/FileAttachments";
import { GuardiaDesempenoTab } from "@/components/gamification";
import CommunicationSection from "@/components/ops/guardia-sections/CommunicationSection";
import DiasTrabajadesSection from "@/components/ops/guardia-sections/DiasTrabajadesSection";
import TurnosExtraSection from "@/components/ops/guardia-sections/TurnosExtraSection";
import HistorialSection from "@/components/ops/guardia-sections/HistorialSection";
import { AssociatedRecordsPanel, type AssociatedSection } from "@/components/ui/AssociatedRecordsPanel";
import Link from "next/link";

type GuardiaDetail = {
  id: string;
  code?: string | null;
  status: string;
  lifecycleStatus: string;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
  contractType?: string | null;
  contractStartDate?: string | null;
  contractPeriod1End?: string | null;
  contractPeriod2End?: string | null;
  contractPeriod3End?: string | null;
  contractCurrentPeriod?: number | null;
  contractBecameIndefinidoAt?: string | null;
  contractAlertDaysBefore?: number | null;
  persona: {
    firstName: string;
    lastName: string;
    rut?: string | null;
    email?: string | null;
    phoneMobile?: string | null;
    addressFormatted?: string | null;
    commune?: string | null;
    city?: string | null;
    region?: string | null;
    sex?: string | null;
    lat?: string | null;
    lng?: string | null;
    birthDate?: string | null;
    nacionalidad?: string | null;
    afp?: string | null;
    healthSystem?: string | null;
    isapreName?: string | null;
    isapreHasExtraPercent?: boolean | null;
    isapreExtraPercent?: string | null;
    hasMobilization?: boolean | null;
    regimenPrevisional?: string | null;
    tipoPension?: string | null;
    isJubilado?: boolean | null;
    cotizaAFP?: boolean | null;
    cotizaAFC?: boolean | null;
    cotizaSalud?: boolean | null;
    personalEmail?: string | null;
  };
  hiredAt?: string | null;
  terminatedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  availableExtraShifts?: boolean;
  personalEmail?: string | null;
  marcacionPin?: string | null;
  marcacionPinVisible?: string | null;
  faceIdRegistered?: boolean;
  faceIdPhotoUrl?: string | null;
  faceIdAwsId?: string | null;
  faceIdRegisteredAt?: string | null;
  faceIdConsentAt?: string | null;
  montoAnticipo?: number;
  recibeAnticipo?: boolean;
  currentInstallation?: {
    id: string;
    name: string;
    marcacionCode?: string | null;
    account?: { id: string; name: string } | null;
  } | null;
  bankAccounts: Array<{
    id: string;
    bankCode?: string | null;
    bankName: string;
    accountType: string;
    accountNumber: string;
    holderName: string;
    isDefault: boolean;
  }>;
  documents: Array<{
    id: string;
    type: string;
    status: string;
    fileUrl?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    createdAt: string;
  }>;
  historyEvents: Array<{
    id: string;
    eventType: string;
    newValue?: Record<string, unknown> | null;
    reason?: string | null;
    createdBy?: string | null;
    createdByName?: string | null;
    createdAt: string;
  }>;
  comments?: Array<{
    id: string;
    comment: string;
    createdBy?: string | null;
    createdByName?: string | null;
    createdAt: string;
  }>;
};

type AsignacionHistorial = {
  id: string;
  puestoId: string;
  slotNumber: number;
  startDate: string;
  endDate?: string | null;
  isActive: boolean;
  reason?: string | null;
  puesto: { id: string; name: string; shiftStart: string; shiftEnd: string; cargo?: { name: string } | null };
  installation: {
    id: string;
    name: string;
    account?: { id: string; name: string } | null;
  };
};

type GuardiaDocConfigItem = { code: string; hasExpiration: boolean; alertDaysBefore: number };

interface GuardiaDetailClientProps {
  initialGuardia: GuardiaDetail;
  asignaciones?: AsignacionHistorial[];
  userRole: string;
  personaAdminId?: string | null;
  currentUserId?: string;
  guardiaDocConfig?: GuardiaDocConfigItem[];
  hasInventarioAccess?: boolean;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

const LIFECYCLE_COLORS: Record<string, string> = {
  postulante: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  seleccionado: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  contratado: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  te: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  inactivo: "bg-red-500/20 text-red-400 border-red-500/30",
};

type TabKey = "perfil" | "operaciones" | "contractual" | "eventos_laborales" | "documentos" | "actividad" | "desempeno";

const TABS: { key: TabKey; label: string; icon: typeof User }[] = [
  { key: "perfil", label: "Perfil", icon: User },
  { key: "operaciones", label: "Operaciones", icon: Wrench },
  { key: "contractual", label: "Contractual", icon: Briefcase },
  { key: "eventos_laborales", label: "Eventos laborales", icon: CalendarDays },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "actividad", label: "Actividad", icon: History },
  { key: "desempeno", label: "Desempe\u00f1o", icon: TrendingUp },
];

function toDateInput(val: string | Date | undefined | null): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function GuardiaDetailClient({ initialGuardia, asignaciones = [], userRole, personaAdminId, currentUserId, guardiaDocConfig = [], hasInventarioAccess = false }: GuardiaDetailClientProps) {
  const router = useRouter();
  const [guardia, setGuardia] = useState(initialGuardia);
  const [activeTab, setActiveTab] = useState<TabKey>("perfil");

  // ── Document count for badge ──
  const [fileAttachCount, setFileAttachCount] = useState(0);
  useEffect(() => {
    fetch(`/api/crm/files?entityType=guardia&entityId=${encodeURIComponent(guardia.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFileAttachCount(d.data.length); })
      .catch(() => {});
  }, [guardia.id]);
  const docCount = guardia.documents.length + fileAttachCount;

  // ── Edit personal modal state ──
  const [editPersonalOpen, setEditPersonalOpen] = useState(false);
  const [editPersonalSaving, setEditPersonalSaving] = useState(false);
  const [editPersonalForm, setEditPersonalForm] = useState({
    firstName: "", lastName: "", rut: "", email: "", personalEmail: "", phoneMobile: "", sex: "", nacionalidad: "",
    birthDate: "", afp: "", healthSystem: "", isapreName: "", isapreHasExtraPercent: false,
    isapreExtraPercent: "", hasMobilization: false, availableExtraShifts: false, addressFormatted: "",
    commune: "", city: "", region: "", lat: "", lng: "", regimenPrevisional: "", tipoPension: "",
    isJubilado: false, cotizaAFP: false, cotizaAFC: false, cotizaSalud: true,
  });

  // ── Doc links state ──
  const [availableDocs, setAvailableDocs] = useState<Array<{ id: string; title: string; module: string; category: string; status: string; createdAt: string; expirationDate?: string | null }>>([]);
  const [linkedDocs, setLinkedDocs] = useState<Array<{ id: string; role: string; createdAt: string; document: { id: string; title: string; module: string; category: string; status: string; signatureStatus?: string | null; createdAt: string; expirationDate?: string | null } }>>([]);
  const [loadingDocLinks, setLoadingDocLinks] = useState(false);

  // ── Lifecycle state ──
  const [lifecycleChanging, setLifecycleChanging] = useState(false);
  const [contractDateModalOpen, setContractDateModalOpen] = useState(false);
  const [contractDate, setContractDate] = useState("");
  const [pendingLifecycleStatus, setPendingLifecycleStatus] = useState<string | null>(null);
  const [inactivoWarningOpen, setInactivoWarningOpen] = useState(false);
  const [pendingInactivoTarget, setPendingInactivoTarget] = useState<string | null>(null);
  const [recontratarModalOpen, setRecontratarModalOpen] = useState(false);
  const [recontratarDate, setRecontratarDate] = useState("");

  // ── Permissions ──
  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canChangeLifecycle = hasOpsCapability(userRole, "guardias_manage") || hasOpsCapability(userRole, "rrhh_events");
  const canManageDocs = hasOpsCapability(userRole, "guardias_documents");

  // ── Edit personal handlers ──
  const openEditPersonal = () => {
    setEditPersonalForm({
      firstName: guardia.persona.firstName || "", lastName: guardia.persona.lastName || "",
      rut: guardia.persona.rut || "", email: guardia.persona.email || "",
      personalEmail: guardia.persona.personalEmail || guardia.personalEmail || "",
      phoneMobile: guardia.persona.phoneMobile || "", sex: guardia.persona.sex || "",
      nacionalidad: guardia.persona.nacionalidad || "", birthDate: toDateInput(guardia.persona.birthDate),
      afp: guardia.persona.afp || "", healthSystem: guardia.persona.healthSystem || "",
      isapreName: guardia.persona.isapreName || "", isapreHasExtraPercent: guardia.persona.isapreHasExtraPercent || false,
      isapreExtraPercent: guardia.persona.isapreExtraPercent || "", hasMobilization: guardia.persona.hasMobilization || false,
      availableExtraShifts: guardia.availableExtraShifts || false, addressFormatted: guardia.persona.addressFormatted || "",
      commune: guardia.persona.commune || "", city: guardia.persona.city || "",
      region: guardia.persona.region || "", lat: guardia.persona.lat || "", lng: guardia.persona.lng || "",
      regimenPrevisional: guardia.persona.regimenPrevisional || "", tipoPension: guardia.persona.tipoPension || "",
      isJubilado: guardia.persona.isJubilado || false, cotizaAFP: guardia.persona.cotizaAFP ?? false,
      cotizaAFC: guardia.persona.cotizaAFC ?? false, cotizaSalud: guardia.persona.cotizaSalud ?? true,
    });
    setEditPersonalOpen(true);
  };

  const onEditAddressChange = (result: AddressResult) => {
    setEditPersonalForm((p) => ({ ...p, addressFormatted: result.address, commune: result.commune || "", city: result.city || "", region: result.region || "", lat: String(result.lat || ""), lng: String(result.lng || "") }));
  };

  const saveEditPersonal = async () => {
    setEditPersonalSaving(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardia.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editPersonalForm.firstName.trim() || undefined, lastName: editPersonalForm.lastName.trim() || undefined,
          rut: editPersonalForm.rut.trim() || undefined, email: editPersonalForm.email.trim() || undefined, personalEmail: editPersonalForm.personalEmail?.trim() || undefined,
          phoneMobile: editPersonalForm.phoneMobile.trim() || undefined, sex: editPersonalForm.sex || undefined,
          nacionalidad: editPersonalForm.nacionalidad || undefined, birthDate: editPersonalForm.birthDate || undefined,
          afp: editPersonalForm.afp || undefined, healthSystem: editPersonalForm.healthSystem || undefined,
          isapreName: editPersonalForm.healthSystem === "isapre" ? editPersonalForm.isapreName || undefined : undefined,
          isapreHasExtraPercent: editPersonalForm.healthSystem === "isapre" ? editPersonalForm.isapreHasExtraPercent : undefined,
          isapreExtraPercent: editPersonalForm.healthSystem === "isapre" && editPersonalForm.isapreHasExtraPercent ? editPersonalForm.isapreExtraPercent || undefined : undefined,
          hasMobilization: editPersonalForm.hasMobilization, regimenPrevisional: editPersonalForm.regimenPrevisional || undefined,
          tipoPension: editPersonalForm.tipoPension || undefined, isJubilado: editPersonalForm.isJubilado,
          cotizaAFP: editPersonalForm.cotizaAFP, cotizaAFC: editPersonalForm.cotizaAFC, cotizaSalud: editPersonalForm.cotizaSalud,
          availableExtraShifts: editPersonalForm.availableExtraShifts, addressFormatted: editPersonalForm.addressFormatted.trim() || undefined,
          commune: editPersonalForm.commune.trim() || undefined, city: editPersonalForm.city.trim() || undefined,
          region: editPersonalForm.region.trim() || undefined, lat: editPersonalForm.lat ? Number(editPersonalForm.lat) : undefined,
          lng: editPersonalForm.lng ? Number(editPersonalForm.lng) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) { toast.error(data.error || "Error al guardar"); return; }
      setGuardia((prev) => ({
        ...prev, availableExtraShifts: editPersonalForm.availableExtraShifts,
        persona: {
          ...prev.persona,
          firstName: editPersonalForm.firstName.trim() || prev.persona.firstName,
          lastName: editPersonalForm.lastName.trim() || prev.persona.lastName,
          rut: editPersonalForm.rut.trim() || prev.persona.rut,
          email: editPersonalForm.email.trim() || prev.persona.email,
          personalEmail: editPersonalForm.personalEmail?.trim() || prev.persona.personalEmail,
          phoneMobile: editPersonalForm.phoneMobile.trim() || prev.persona.phoneMobile,
          sex: editPersonalForm.sex || prev.persona.sex,
          nacionalidad: editPersonalForm.nacionalidad || prev.persona.nacionalidad,
          birthDate: editPersonalForm.birthDate || prev.persona.birthDate,
          afp: editPersonalForm.afp || prev.persona.afp,
          healthSystem: editPersonalForm.healthSystem || prev.persona.healthSystem,
          isapreName: editPersonalForm.isapreName || prev.persona.isapreName,
          isapreHasExtraPercent: editPersonalForm.isapreHasExtraPercent,
          isapreExtraPercent: editPersonalForm.isapreExtraPercent || prev.persona.isapreExtraPercent,
          hasMobilization: editPersonalForm.hasMobilization,
          regimenPrevisional: editPersonalForm.regimenPrevisional || prev.persona.regimenPrevisional,
          tipoPension: editPersonalForm.tipoPension || prev.persona.tipoPension,
          isJubilado: editPersonalForm.isJubilado, cotizaAFP: editPersonalForm.cotizaAFP,
          cotizaAFC: editPersonalForm.cotizaAFC, cotizaSalud: editPersonalForm.cotizaSalud,
          addressFormatted: editPersonalForm.addressFormatted.trim() || prev.persona.addressFormatted,
          commune: editPersonalForm.commune.trim() || prev.persona.commune,
          city: editPersonalForm.city.trim() || prev.persona.city,
          region: editPersonalForm.region.trim() || prev.persona.region,
          lat: editPersonalForm.lat || prev.persona.lat, lng: editPersonalForm.lng || prev.persona.lng,
        },
      }));
      toast.success("Datos actualizados");
      setEditPersonalOpen(false);
    } catch { toast.error("Error al guardar datos personales"); } finally { setEditPersonalSaving(false); }
  };

  // ── Doc links ──
  const loadDocLinks = async () => {
    setLoadingDocLinks(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}/doc-links`);
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudieron cargar vínculos");
      setLinkedDocs(payload.data?.linked ?? []);
      setAvailableDocs(payload.data?.available ?? []);
    } catch (error) { console.error(error); toast.error("No se pudieron cargar documentos vinculables"); }
    finally { setLoadingDocLinks(false); }
  };

  useEffect(() => { void loadDocLinks(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [guardia.id]);

  // ── Lifecycle handlers ──
  const handleLifecycleChange = async (nextStatus: string) => {
    if (lifecycleChanging) return;
    if (guardia.lifecycleStatus === "inactivo") {
      setPendingInactivoTarget(nextStatus);
      setInactivoWarningOpen(true);
      return;
    }
    if (nextStatus === "contratado") {
      setContractDate(new Date().toISOString().slice(0, 10));
      setPendingLifecycleStatus(nextStatus);
      setContractDateModalOpen(true);
      return;
    }
    await doLifecycleChange(nextStatus, undefined);
  };

  const handleConfirmInactivoChange = () => {
    if (!pendingInactivoTarget) return;
    setInactivoWarningOpen(false);
    if (pendingInactivoTarget === "contratado") {
      setContractDate(new Date().toISOString().slice(0, 10));
      setPendingLifecycleStatus(pendingInactivoTarget);
      setContractDateModalOpen(true);
    } else {
      void doLifecycleChange(pendingInactivoTarget, undefined);
    }
    setPendingInactivoTarget(null);
  };

  const doLifecycleChange = async (nextStatus: string, effectiveAt?: string) => {
    if (lifecycleChanging) return;
    setLifecycleChanging(true);
    try {
      const body: { lifecycleStatus: string; effectiveAt?: string } = { lifecycleStatus: nextStatus };
      if (effectiveAt) body.effectiveAt = effectiveAt;
      const response = await fetch(`/api/personas/guardias/${guardia.id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo cambiar el estado");
      setGuardia((prev) => ({
        ...prev, lifecycleStatus: payload.data.lifecycleStatus, status: payload.data.status,
        hiredAt: payload.data.hiredAt ?? prev.hiredAt, terminatedAt: payload.data.terminatedAt ?? prev.terminatedAt,
      }));
      toast.success("Estado actualizado");
      setContractDateModalOpen(false); setPendingLifecycleStatus(null); setRecontratarModalOpen(false);
    } catch (error) { console.error(error); toast.error("No se pudo actualizar el estado"); }
    finally { setLifecycleChanging(false); }
  };

  const handleConfirmContractDate = () => {
    if (!pendingLifecycleStatus || !contractDate) { toast.error("Selecciona la fecha de inicio de contrato"); return; }
    void doLifecycleChange(pendingLifecycleStatus, contractDate);
  };

  const handleConfirmRecontratar = () => {
    if (!recontratarDate) { toast.error("Selecciona la fecha de recontratación"); return; }
    void doLifecycleChange("contratado", recontratarDate);
  };

  const handleEliminar = async () => {
    if (!window.confirm("¿ELIMINAR permanentemente a este guardia y su persona asociada? Esta acción no se puede deshacer.")) return;
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}`, { method: "DELETE" });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || "No se pudo eliminar");
      toast.success("Guardia eliminado permanentemente");
      router.push("/personas/guardias");
    } catch (error: any) { console.error(error); toast.error(error?.message || "No se pudo eliminar al guardia"); }
  };

  // ── Computed ──
  const fullName = formatPersonName(guardia.persona.firstName, guardia.persona.lastName) || "Guardia";
  const puedeRecontratar = canManageGuardias && guardia.lifecycleStatus === "inactivo" && guardia.terminatedAt;

  // ── Tab content ──
  const renderTabContent = () => {
    switch (activeTab) {
      case "perfil":
        return (
          <div className="space-y-3">
            <CollapsibleSection title="Identificación y contacto" defaultOpen>
              <DatosPersonalesSection
                guardiaId={guardia.id} persona={guardia.persona} hiredAt={guardia.hiredAt}
                availableExtraShifts={guardia.availableExtraShifts} recibeAnticipo={guardia.recibeAnticipo}
                montoAnticipo={guardia.montoAnticipo} bankAccounts={guardia.bankAccounts}
                asignaciones={asignaciones} canManageGuardias={canManageGuardias}
                onBankAccountsChange={(bankAccounts) => setGuardia((prev) => ({ ...prev, bankAccounts }))}
              />
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/40">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fecha creación</p>
                  <p className="text-sm">{guardia.createdAt ? new Date(guardia.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Última modificación</p>
                  <p className="text-sm">{guardia.updatedAt ? new Date(guardia.updatedAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</p>
                </div>
              </div>
            </CollapsibleSection>
          </div>
        );
      case "operaciones":
        return (
          <div className="space-y-3">
            {!(guardia.persona.personalEmail || guardia.personalEmail) && guardia.lifecycleStatus === "contratado" && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-400">
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>
                  <strong>Email personal faltante</strong> — requerido por Res. N°38 para envío de comprobantes de asistencia.{" "}
                  <button className="underline underline-offset-2" onClick={() => setEditPersonalOpen(true)}>
                    Agregar en Perfil
                  </button>
                </span>
              </div>
            )}
            <CollapsibleSection title="Marcación de asistencia" defaultOpen>
              <MarcacionSection
                guardiaId={guardia.id}
                marcacionPin={guardia.marcacionPin}
                marcacionPinVisible={guardia.marcacionPinVisible}
                faceIdRegistered={guardia.faceIdRegistered}
                faceIdPhotoUrl={guardia.faceIdPhotoUrl}
                faceIdRegisteredAt={guardia.faceIdRegisteredAt}
                canManageGuardias={canManageGuardias}
                onPinUpdated={(pin) => setGuardia((prev) => ({ ...prev, marcacionPin: "[configurado]", marcacionPinVisible: pin }))}
                onFaceIdReset={() => setGuardia((prev) => ({ ...prev, faceIdRegistered: false, faceIdPhotoUrl: null, faceIdAwsId: null }))}
              />
            </CollapsibleSection>
          </div>
        );
      case "contractual":
        return (
          <div className="space-y-3">
            <CollapsibleSection title="Contratos" defaultOpen>
              <GuardContractsTab guardiaId={guardia.id} guardiaName={fullName}
                guardiaEmail={guardia.persona.email} guardiaRut={guardia.persona.rut}
                hiredAt={guardia.hiredAt ?? null}
                contract={guardia.contractType ? {
                  contractType: guardia.contractType as "plazo_fijo" | "indefinido",
                  contractStartDate: guardia.contractStartDate ?? null, contractPeriod1End: guardia.contractPeriod1End ?? null,
                  contractPeriod2End: guardia.contractPeriod2End ?? null, contractPeriod3End: guardia.contractPeriod3End ?? null,
                  contractCurrentPeriod: guardia.contractCurrentPeriod ?? 1, contractBecameIndefinidoAt: guardia.contractBecameIndefinidoAt ?? null,
                } : null}
                linkedDocuments={linkedDocs
                  .filter((item) => item.document.category === "contrato_laboral" || item.document.category === "anexo_contrato")
                  .map((item) => ({ id: item.document.id, title: item.document.title, category: item.document.category, signatureStatus: item.document.signatureStatus, expirationDate: item.document.expirationDate ?? null }))}
                onDocumentsGenerated={loadDocLinks} canManageDocs={canManageDocs}
              />
            </CollapsibleSection>
          </div>
        );
      case "eventos_laborales":
        return (
          <div className="space-y-3">
            <CollapsibleSection title="Eventos laborales" defaultOpen>
              <GuardEventsTab guardiaId={guardia.id} guardiaName={fullName} userRole={userRole}
                guardContract={guardia.contractType ? {
                  contractType: guardia.contractType as "plazo_fijo" | "indefinido",
                  contractStartDate: guardia.contractStartDate ?? null, contractPeriod1End: guardia.contractPeriod1End ?? null,
                  contractPeriod2End: guardia.contractPeriod2End ?? null, contractPeriod3End: guardia.contractPeriod3End ?? null,
                  contractCurrentPeriod: guardia.contractCurrentPeriod ?? 1, contractBecameIndefinidoAt: guardia.contractBecameIndefinidoAt ?? null,
                } : null}
              />
            </CollapsibleSection>
          </div>
        );
      case "documentos":
        return (
          <div className="space-y-3">
            <CollapsibleSection title="Ficha de documentos" defaultOpen>
              <DocumentosSection guardiaId={guardia.id} documents={guardia.documents}
                canManageDocs={canManageDocs} guardiaDocConfig={guardiaDocConfig}
                onDocumentsChange={(documents) => setGuardia((prev) => ({ ...prev, documents }))}
              />
            </CollapsibleSection>
            <CollapsibleSection title="Documentos adicionales" defaultOpen>
              <FileAttachments entityType="guardia" entityId={guardia.id} title="Documentos adicionales" />
            </CollapsibleSection>
          </div>
        );
      case "actividad":
        return (
          <div className="space-y-3">
            <CollapsibleSection
              title="Días trabajados"
              defaultOpen={false}
              action={
                <Link
                  href={`/ops/pauta-diaria?guardiaId=${guardia.id}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                  title="Ver en pauta diaria"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <DiasTrabajadesSection guardiaId={guardia.id} />
            </CollapsibleSection>
            <CollapsibleSection
              title="Turnos extra"
              defaultOpen={false}
              action={
                <Link
                  href={`/ops/pauta-diaria?guardiaId=${guardia.id}`}
                  className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors"
                  title="Ver en pauta diaria"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              }
            >
              <TurnosExtraSection guardiaId={guardia.id} />
            </CollapsibleSection>
            <CollapsibleSection title="Historial del guardia" defaultOpen>
              <HistorialSection historyEvents={guardia.historyEvents} />
            </CollapsibleSection>
          </div>
        );
      case "desempeno":
        return <GuardiaDesempenoTab guardiaId={guardia.id} />;
    }
  };

  const associatedSections: AssociatedSection[] = [
    {
      id: "asignacion",
      label: "Asignación",
      content: <AsignacionSection asignaciones={asignaciones} />,
      defaultOpen: true,
    },
    {
      id: "rondas",
      label: "Marcación rondas",
      content: <RondasSection currentInstallation={guardia.currentInstallation} />,
    },
    ...(hasInventarioAccess
      ? [{
        id: "uniformes",
        label: "Uniformes",
        content: <InventarioGuardiaAssignmentsSection guardiaId={guardia.id} />,
      }]
      : []),
    {
      id: "sueldo",
      label: "Estructura de sueldo",
      content: <GuardiaSalaryTab guardiaId={guardia.id} />,
    },
    {
      id: "liquidaciones",
      label: "Liquidaciones",
      content: <GuardiaLiquidacionesTab guardiaId={guardia.id} />,
    },
    ...(personaAdminId
      ? [{
        id: "rendiciones",
        label: "Rendiciones",
        content: <PersonaRendicionesTab adminId={personaAdminId} />,
      }]
      : []),
    {
      id: "comunicacion",
      label: "Comunicación",
      content: (
        <CommunicationSection guardiaId={guardia.id} email={guardia.persona.email}
          phoneMobile={guardia.persona.phoneMobile} historyEvents={guardia.historyEvents}
          onHistoryEventAdded={(event) => setGuardia((prev) => ({ ...prev, historyEvents: [event, ...prev.historyEvents] }))}
        />
      ),
    },
  ];

  return (
    <>
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-[#0a0e14]/95 backdrop-blur -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-6 lg:px-6 max-lg:pt-2">
        <button type="button" onClick={() => router.push("/personas/guardias")}
          className="lg:hidden flex items-center gap-1 text-xs text-[#7a8a9e] hover:text-[#e8edf4] transition-colors mb-1.5">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a personas
        </button>

        <div className="flex items-center justify-between gap-3 min-w-0 py-1.5 lg:py-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar name={fullName} size="lg" />
            <h1 className="text-base sm:text-lg font-semibold text-[#e8edf4] truncate">{fullName}</h1>
            <span className={cn("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium border",
              LIFECYCLE_COLORS[guardia.lifecycleStatus] || "bg-muted text-muted-foreground border-border")}>
              {LIFECYCLE_LABELS[guardia.lifecycleStatus] || guardia.lifecycleStatus}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {guardia.persona.phoneMobile && (
              <>
                <a href={`tel:+56${guardia.persona.phoneMobile}`} title="Llamar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#1a2332] bg-[#111822] text-[#e8edf4] hover:bg-[#1a2332] transition-colors">
                  <Phone className="h-4 w-4" />
                </a>
                <a href={`https://wa.me/56${guardia.persona.phoneMobile}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-green-600/30 bg-green-600/15 text-green-400 hover:bg-green-600/25 transition-colors">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                </a>
              </>
            )}
            {puedeRecontratar && (
              <button
                type="button"
                onClick={() => { setRecontratarDate(new Date().toISOString().slice(0, 10)); setRecontratarModalOpen(true); }}
                className="relative group/rc inline-flex h-8 w-8 items-center justify-center rounded-md border border-emerald-600/30 bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                <span className="absolute hidden group-hover/rc:block top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap rounded-md border border-border bg-zinc-900 px-2 py-1 text-[10px] text-zinc-300 shadow-lg z-50 pointer-events-none">
                  Recontratar guardia
                </span>
              </button>
            )}
            {canManageGuardias && (
              <Button variant="outline" size="sm" className="h-8 w-8 px-0 border-[#1a2332] bg-[#111822]" onClick={openEditPersonal} title="Editar datos">
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 px-0 border-[#1a2332] bg-[#111822]">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canChangeLifecycle && guardia.lifecycleStatus !== "inactivo" && getLifecycleTransitions(guardia.lifecycleStatus).map((status) => (
                  <DropdownMenuItem key={status} onClick={() => void handleLifecycleChange(status)} disabled={lifecycleChanging}>
                    {lifecycleChanging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : null}
                    Cambiar a {LIFECYCLE_LABELS[status] || status}
                  </DropdownMenuItem>
                ))}
                {canManageGuardias && (
                  <DropdownMenuItem className="text-red-400 focus:text-red-400" onClick={() => void handleEliminar()}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Eliminar guardia
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── ChipTabs ── */}
        <ChipTabs
          tabs={TABS.map((tab) => ({ id: tab.key, label: tab.label, icon: tab.icon, badge: tab.key === "documentos" ? docCount : undefined }))}
          activeTab={activeTab}
          onTabChange={(id) => setActiveTab(id as TabKey)}
          centered={false}
          compact
        />
      </div>

      {/* ── Content + Panel layout ── */}
      <div className="lg:flex gap-5">
        <div className="flex-1 min-w-0">
          <div className="mt-5 min-w-0">{renderTabContent()}</div>
        </div>
        <AssociatedRecordsPanel sections={associatedSections} />
      </div>

      {/* ── Modal fecha de contrato ── */}
      <Dialog open={contractDateModalOpen} onOpenChange={setContractDateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Fecha de inicio de contrato</DialogTitle>
            <DialogDescription>Indica la fecha en que inicia el contrato de este guardia.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label className="text-sm font-medium">Fecha de inicio</Label>
              <Input type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} className="w-full" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractDateModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmContractDate} disabled={lifecycleChanging}>{lifecycleChanging ? "Guardando..." : "Confirmar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal recontratar ── */}
      <Dialog open={recontratarModalOpen} onOpenChange={setRecontratarModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Recontratar guardia</DialogTitle>
            <DialogDescription>¿Desea recontratar a este guardia? Indique la fecha de inicio del nuevo contrato.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label className="text-sm font-medium">Fecha de recontratación</Label>
              <Input type="date" value={recontratarDate} onChange={(e) => setRecontratarDate(e.target.value)} className="w-full" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecontratarModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmRecontratar} disabled={lifecycleChanging}>{lifecycleChanging ? "Guardando..." : "Recontratar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal advertencia guardia inactivo/finiquitado ── */}
      <ConfirmDialog
        open={inactivoWarningOpen}
        onOpenChange={setInactivoWarningOpen}
        title="Guardia finiquitado"
        description={`Este guardia fue finiquitado${guardia.terminatedAt ? ` el ${new Date(guardia.terminatedAt).toLocaleDateString("es-CL")}` : ""}. Al cambiar su estado, quedará habilitado para ser asignado a puestos nuevamente.\n\n¿Deseas continuar?`}
        confirmLabel="Continuar"
        variant="default"
        onConfirm={handleConfirmInactivoChange}
      />

      {/* ── Edit Personal Data Modal ── */}
      <Dialog open={editPersonalOpen} onOpenChange={setEditPersonalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Editar datos personales</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Nombre *</Label>
              <Input value={editPersonalForm.firstName} onChange={(e) => setEditPersonalForm((p) => ({ ...p, firstName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Apellido *</Label>
              <Input value={editPersonalForm.lastName} onChange={(e) => setEditPersonalForm((p) => ({ ...p, lastName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">RUT</Label>
              <Input value={editPersonalForm.rut} onChange={(e) => setEditPersonalForm((p) => ({ ...p, rut: e.target.value }))} placeholder="12.345.678-9" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Email corporativo</Label>
              <Input type="email" value={editPersonalForm.email} onChange={(e) => setEditPersonalForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Email personal *<span className="text-[10px] text-muted-foreground ml-1">(Res. N°38)</span></Label>
              <Input type="email" value={editPersonalForm.personalEmail ?? ""} onChange={(e) => setEditPersonalForm((p) => ({ ...p, personalEmail: e.target.value }))} placeholder="guardia@gmail.com" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Celular</Label>
              <Input value={editPersonalForm.phoneMobile} onChange={(e) => setEditPersonalForm((p) => ({ ...p, phoneMobile: e.target.value }))} placeholder="912345678" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Sexo</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.sex} onChange={(e) => setEditPersonalForm((p) => ({ ...p, sex: e.target.value }))}>
                <option value="">Sin especificar</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option>
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs">Nacionalidad</Label>
              <SearchableSelect
                value={editPersonalForm.nacionalidad}
                options={PAISES_AMERICA.map((p) => ({ id: p, label: p }))}
                placeholder="Sin especificar"
                onChange={(val) => setEditPersonalForm((p) => ({ ...p, nacionalidad: val }))}
              /></div>
            <div className="space-y-1.5"><Label className="text-xs">Fecha de nacimiento</Label>
              <Input type="date" value={editPersonalForm.birthDate} onChange={(e) => setEditPersonalForm((p) => ({ ...p, birthDate: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos previsionales</Label></div>
            <div className="space-y-1.5"><Label className="text-xs">Régimen previsional</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.regimenPrevisional} onChange={(e) => setEditPersonalForm((p) => ({ ...p, regimenPrevisional: e.target.value }))}>
                <option value="">Sin especificar</option>{REGIMEN_PREVISIONAL.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
              </select></div>
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPersonalForm.isJubilado} onChange={(e) => setEditPersonalForm((p) => ({ ...p, isJubilado: e.target.checked }))} className="rounded border-input" />¿Jubilado?
              </label></div>
            {editPersonalForm.isJubilado && (<>
              <div className="space-y-1.5"><Label className="text-xs">Tipo de pensión</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.tipoPension} onChange={(e) => setEditPersonalForm((p) => ({ ...p, tipoPension: e.target.value }))}>
                  <option value="">Sin especificar</option>{TIPO_PENSION.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                </select></div>
              <div className="space-y-1.5 flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPersonalForm.cotizaAFP} onChange={(e) => setEditPersonalForm((p) => ({ ...p, cotizaAFP: e.target.checked }))} className="rounded border-input" />Cotiza AFP (voluntario)</label></div>
              <div className="space-y-1.5 flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPersonalForm.cotizaAFC} onChange={(e) => setEditPersonalForm((p) => ({ ...p, cotizaAFC: e.target.checked }))} className="rounded border-input" />Cotiza AFC</label></div>
            </>)}
            <div className="space-y-1.5 flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={editPersonalForm.cotizaSalud} onChange={(e) => setEditPersonalForm((p) => ({ ...p, cotizaSalud: e.target.checked }))} className="rounded border-input" />Cotiza salud</label></div>
            <div className="space-y-1.5"><Label className="text-xs">AFP</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.afp} onChange={(e) => setEditPersonalForm((p) => ({ ...p, afp: e.target.value }))}>
                <option value="">Sin AFP</option>{AFP_CHILE.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-xs">Sistema de salud</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.healthSystem} onChange={(e) => setEditPersonalForm((p) => ({ ...p, healthSystem: e.target.value }))}>
                <option value="">Sin sistema</option>{HEALTH_SYSTEMS.map((h) => (<option key={h} value={h}>{h.toUpperCase()}</option>))}
              </select></div>
            {editPersonalForm.healthSystem === "isapre" && (<>
              <div className="space-y-1.5"><Label className="text-xs">Isapre</Label>
                <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.isapreName} onChange={(e) => setEditPersonalForm((p) => ({ ...p, isapreName: e.target.value }))}>
                  <option value="">Seleccionar</option>{ISAPRES_CHILE.map((i) => (<option key={i} value={i}>{i}</option>))}
                </select></div>
              <div className="space-y-1.5 flex items-end gap-3">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={editPersonalForm.isapreHasExtraPercent} onChange={(e) => setEditPersonalForm((p) => ({ ...p, isapreHasExtraPercent: e.target.checked }))} className="rounded border-input" />Cotización extra</label>
                {editPersonalForm.isapreHasExtraPercent && (
                  <Input type="number" step="0.01" className="w-24" placeholder="%" value={editPersonalForm.isapreExtraPercent} onChange={(e) => setEditPersonalForm((p) => ({ ...p, isapreExtraPercent: e.target.value }))} />
                )}</div>
            </>)}
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs">Dirección (Google Maps)</Label>
              <AddressAutocomplete value={editPersonalForm.addressFormatted} onChange={onEditAddressChange} placeholder="Buscar dirección..." showMap />
              {(editPersonalForm.commune || editPersonalForm.city || editPersonalForm.region) && (
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-3 mt-1">
                  <Input value={editPersonalForm.commune} readOnly placeholder="Comuna" className="text-xs h-8" />
                  <Input value={editPersonalForm.city} readOnly placeholder="Ciudad" className="text-xs h-8" />
                  <Input value={editPersonalForm.region} readOnly placeholder="Región" className="text-xs h-8" />
                </div>
              )}</div>
            <div className="space-y-1.5 sm:col-span-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPersonalForm.hasMobilization} onChange={(e) => setEditPersonalForm((p) => ({ ...p, hasMobilization: e.target.checked }))} className="rounded border-input" />Con movilización</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPersonalForm.availableExtraShifts} onChange={(e) => setEditPersonalForm((p) => ({ ...p, availableExtraShifts: e.target.checked }))} className="rounded border-input" />Disponible para turnos extra</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPersonalOpen(false)} disabled={editPersonalSaving}>Cancelar</Button>
            <Button onClick={saveEditPersonal} disabled={editPersonalSaving}>
              {editPersonalSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
