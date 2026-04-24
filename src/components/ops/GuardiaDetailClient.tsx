"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";
import {
  ArrowUpRight,
  Briefcase,
  CalendarDays,
  Clock,
  DollarSign,
  FileText,
  Fingerprint,
  History,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  Shirt,
  Trash2,
  TrendingUp,
  User,
  UserPlus,
  Brain,
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
import { CollapsibleSection } from "@/components/crm/CollapsibleSection";
import { EntityDetailLayout, type EntityHeaderAction, type EntityTab } from "@/components/crm/EntityDetailLayout";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { formatPersonName } from "@/lib/personas";
import { SHOW_PIN_IN_PROFILE } from "@/lib/guard-portal";
import {
  AFP_CHILE,
  getLifecycleTransitions,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
  PANTS_SIZES,
  PAISES_AMERICA,
  REGIMEN_PREVISIONAL,
  SHOE_SIZES,
  TOP_GARMENT_SIZES,
  TIPO_PENSION,
} from "@/lib/personas";
import {
  canEditGuardiasPlanSeleccion,
  canReloadGuardiaMarcacionPin,
  hasOpsCapability,
} from "@/lib/ops-rbac";
import { PersonaRendicionesTab } from "@/components/finance/PersonaRendicionesTab";
import { GuardEventsTab } from "@/components/ops/guard-events";
import { GuardContractsTab } from "@/components/ops/guard-contracts";
import { GuardiaSalaryTab } from "@/components/ops/GuardiaSalaryTab";
import { GuardiaLiquidacionesTab } from "@/components/payroll/GuardiaLiquidacionesTab";
import { InventarioGuardiaAssignmentsSection } from "@/components/inventario/InventarioGuardiaAssignmentsSection";
import DatosPersonalesSection from "@/components/ops/guardia-sections/DatosPersonalesSection";
import AsignacionSection from "@/components/ops/guardia-sections/AsignacionSection";
import MarcacionSection from "@/components/ops/guardia-sections/MarcacionSection";
import DocumentosSection from "@/components/ops/guardia-sections/DocumentosSection";
import { FileAttachments } from "@/components/crm/FileAttachments";
import { GuardiaDesempenoTab } from "@/components/gamification";
import { GuardiaMarcacionesTab } from "./GuardiaMarcacionesTab";
import OnboardingSection from "@/components/ops/guardia-sections/OnboardingSection";
import GuardiaPsicolaboralSection from "@/components/ops/guardia-sections/GuardiaPsicolaboralSection";
import { SeleccionadoDestinoFields } from "@/components/ops/SeleccionadoDestinoFields";
import CommunicationSection from "@/components/ops/guardia-sections/CommunicationSection";
import DiasTrabajadesSection from "@/components/ops/guardia-sections/DiasTrabajadesSection";
import TurnosExtraSection from "@/components/ops/guardia-sections/TurnosExtraSection";
import HistorialSection from "@/components/ops/guardia-sections/HistorialSection";
import { AssociatedRecordsPanel } from "@/components/ui/AssociatedRecordsPanel";
import Link from "next/link";
import type { GuardiaDocumentoConfigItem } from "@/lib/guardia-documentos-config";
import type { OperationalGuardDocSlot } from "@/lib/operational-guard-doc-slots-shared";

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
    id?: string;
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
    shoeSize?: string | null;
    pantsSize?: string | null;
    tshirtSize?: string | null;
    shirtSize?: string | null;
    geologoSize?: string | null;
    polarSize?: string | null;
    jacketSize?: string | null;
    heightCm?: string | null;
    weightKg?: string | null;
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
  intendedInstallationId?: string | null;
  intendedContractDate?: string | null;
  intendedInstallation?: {
    id: string;
    name: string;
    account?: { id?: string; name?: string | null } | null;
  } | null;
  intendedPlanUpdatedAt?: string | null;
  intendedPlanUpdatedBy?: { id: string; name: string } | null;
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

interface GuardiaDetailClientProps {
  initialGuardia: GuardiaDetail;
  asignaciones?: AsignacionHistorial[];
  userRole: string;
  personaAdminId?: string | null;
  currentUserId?: string;
  guardiaDocConfig?: GuardiaDocumentoConfigItem[];
  operationalGuardDocSlots?: OperationalGuardDocSlot[];
  docLabels?: Record<string, string>;
  hasInventarioAccess?: boolean;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

const LIFECYCLE_STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  postulante: "default",
  seleccionado: "warning",
  contratado: "success",
  te: "default",
  inactivo: "secondary",
};

type TabKey = "perfil" | "operaciones" | "contractual" | "financiero";

const TABS: EntityTab[] = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "operaciones", label: "Operaciones", icon: Wrench },
  { id: "contractual", label: "Contractual", icon: Briefcase },
  { id: "financiero", label: "Financiero", icon: DollarSign },
];

function toDateInput(val: string | Date | undefined | null): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function GuardiaDetailClient({
  initialGuardia,
  asignaciones = [],
  userRole,
  personaAdminId,
  currentUserId,
  guardiaDocConfig = [],
  operationalGuardDocSlots = [],
  docLabels = {},
  hasInventarioAccess = false,
}: GuardiaDetailClientProps) {
  const router = useRouter();
  const [guardia, setGuardia] = useState(initialGuardia);
  const [activeTab, setActiveTab] = useState<TabKey>("perfil");

  // Contexto de página para OPAI Intelligence (chat contextual tipo Notion)
  useRegisterChatPageContext({
    entityType: "ops_guardia",
    entityId: guardia.id,
    entityName: `${guardia.persona?.firstName ?? ""} ${guardia.persona?.lastName ?? ""}`.trim() || "Guardia",
    entityUrl: `/personas/guardias/${guardia.id}`,
  });

  // ── Edit personal modal state ──
  const [editPersonalOpen, setEditPersonalOpen] = useState(false);
  const [editPersonalSaving, setEditPersonalSaving] = useState(false);
  const [editPersonalForm, setEditPersonalForm] = useState({
    firstName: "", lastName: "", rut: "", email: "", personalEmail: "", phoneMobile: "", sex: "", nacionalidad: "",
    birthDate: "", afp: "", healthSystem: "", isapreName: "", isapreHasExtraPercent: false,
    isapreExtraPercent: "", hasMobilization: false, availableExtraShifts: false, addressFormatted: "",
    shoeSize: "", pantsSize: "", tshirtSize: "", shirtSize: "", geologoSize: "", polarSize: "", jacketSize: "",
    heightCm: "", weightKg: "",
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
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [pinReloading, setPinReloading] = useState(false);

  // ── Permissions ──
  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canReloadMarcacionPin = canReloadGuardiaMarcacionPin(userRole);
  const canEditPlanSeleccion = canEditGuardiasPlanSeleccion(userRole);
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
      shoeSize: guardia.persona.shoeSize || "", pantsSize: guardia.persona.pantsSize || "",
      tshirtSize: guardia.persona.tshirtSize || "", shirtSize: guardia.persona.shirtSize || "",
      geologoSize: guardia.persona.geologoSize || "", polarSize: guardia.persona.polarSize || "",
      jacketSize: guardia.persona.jacketSize || "", heightCm: guardia.persona.heightCm || "",
      weightKg: guardia.persona.weightKg || "",
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
          shoeSize: editPersonalForm.shoeSize || undefined,
          pantsSize: editPersonalForm.pantsSize || undefined,
          tshirtSize: editPersonalForm.tshirtSize || undefined,
          shirtSize: editPersonalForm.shirtSize || undefined,
          geologoSize: editPersonalForm.geologoSize || undefined,
          polarSize: editPersonalForm.polarSize || undefined,
          jacketSize: editPersonalForm.jacketSize || undefined,
          heightCm: editPersonalForm.heightCm ? Number(editPersonalForm.heightCm) : undefined,
          weightKg: editPersonalForm.weightKg ? Number(editPersonalForm.weightKg) : undefined,
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
          shoeSize: editPersonalForm.shoeSize || prev.persona.shoeSize,
          pantsSize: editPersonalForm.pantsSize || prev.persona.pantsSize,
          tshirtSize: editPersonalForm.tshirtSize || prev.persona.tshirtSize,
          shirtSize: editPersonalForm.shirtSize || prev.persona.shirtSize,
          geologoSize: editPersonalForm.geologoSize || prev.persona.geologoSize,
          polarSize: editPersonalForm.polarSize || prev.persona.polarSize,
          jacketSize: editPersonalForm.jacketSize || prev.persona.jacketSize,
          heightCm: editPersonalForm.heightCm || prev.persona.heightCm,
          weightKg: editPersonalForm.weightKg || prev.persona.weightKg,
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
  const showPlanSeleccion =
    guardia.lifecycleStatus === "seleccionado" ||
    !!guardia.intendedInstallationId ||
    !!guardia.intendedContractDate;

  const renderTabContent = () => {
    switch (activeTab) {
      case "perfil":
        return (
          <div className="space-y-3">
            {showPlanSeleccion && (
              <CollapsibleSection
                icon={<MapPin className="h-4 w-4 text-amber-500" />}
                title="Plan de selección"
                defaultOpen
              >
                <SeleccionadoDestinoFields
                  guardiaId={guardia.id}
                  lifecycleStatus={guardia.lifecycleStatus}
                  intendedInstallationId={guardia.intendedInstallationId}
                  intendedContractDate={guardia.intendedContractDate}
                  intendedInstallation={guardia.intendedInstallation}
                  intendedPlanUpdatedAt={guardia.intendedPlanUpdatedAt}
                  intendedPlanUpdatedBy={guardia.intendedPlanUpdatedBy}
                  canEdit={canEditPlanSeleccion}
                  onUpdated={(patch) => {
                    setGuardia((prev) => ({
                      ...prev,
                      ...patch,
                      intendedInstallation:
                        patch.intendedInstallation !== undefined
                          ? patch.intendedInstallation ?? null
                          : prev.intendedInstallation,
                    }));
                  }}
                />
              </CollapsibleSection>
            )}
            <CollapsibleSection
              icon={<User className="h-4 w-4 text-indigo-500" />}
              title="Identificación y contacto"
              defaultOpen
            >
              <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border/40">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">PIN de marcación</span>
                <span className={cn(
                  "shrink-0 rounded px-2.5 py-1 text-sm font-semibold tabular-nums",
                  guardia.marcacionPin
                    ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                    : "bg-muted text-muted-foreground border border-border"
                )}>
                  {SHOW_PIN_IN_PROFILE && guardia.marcacionPinVisible
                    ? guardia.marcacionPinVisible
                    : guardia.marcacionPin
                      ? "Configurado"
                      : "—"}
                </span>
                {canReloadMarcacionPin && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5"
                    disabled={pinReloading}
                    onClick={async () => {
                      setPinReloading(true);
                      try {
                        const res = await fetch("/api/ops/marcacion/pin", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ guardiaId: guardia.id }),
                        });
                        const data = await res.json();
                        if (!res.ok || !data.success) {
                          toast.error(data.error || "Error al recargar PIN");
                          return;
                        }
                        setGuardia((prev) => ({ ...prev, marcacionPin: "[configurado]", marcacionPinVisible: data.data.pin }));
                        toast.success("PIN recargado correctamente");
                      } catch {
                        toast.error("Error de conexión");
                      } finally {
                        setPinReloading(false);
                      }
                    }}
                  >
                    {pinReloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Recargar
                  </Button>
                )}
              </div>
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
            {guardia.persona.id && (
              <CollapsibleSection
                icon={<Brain className="h-4 w-4 text-purple-500" />}
                title="Evaluación psicolaboral"
                defaultOpen={false}
              >
                <GuardiaPsicolaboralSection
                  guardiaId={guardia.id}
                  personaId={guardia.persona.id}
                  guardName={fullName}
                  email={guardia.persona.email ?? null}
                  phone={guardia.persona.phoneMobile ?? null}
                />
              </CollapsibleSection>
            )}
            <CollapsibleSection
              icon={<UserPlus className="h-4 w-4 text-emerald-500" />}
              title="Onboarding"
              defaultOpen={false}
            >
              <OnboardingSection guardiaId={guardia.id} />
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
            <CollapsibleSection
              icon={<MapPin className="h-4 w-4 text-teal-500" />}
              title="Asignación"
              defaultOpen
            >
              <AsignacionSection asignaciones={asignaciones} />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<Fingerprint className="h-4 w-4 text-blue-500" />}
              title="Marcación asistencia"
              defaultOpen
            >
              <MarcacionSection
                guardiaId={guardia.id}
                marcacionPin={guardia.marcacionPin}
                marcacionPinVisible={guardia.marcacionPinVisible}
                faceIdRegistered={guardia.faceIdRegistered}
                faceIdPhotoUrl={guardia.faceIdPhotoUrl}
                faceIdRegisteredAt={guardia.faceIdRegisteredAt}
                canManageGuardias={canManageGuardias}
                canReloadMarcacionPin={canReloadMarcacionPin}
                onPinUpdated={(pin) => setGuardia((prev) => ({ ...prev, marcacionPin: "[configurado]", marcacionPinVisible: pin }))}
                onFaceIdReset={() => setGuardia((prev) => ({ ...prev, faceIdRegistered: false, faceIdPhotoUrl: null, faceIdAwsId: null }))}
              />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<Clock className="h-4 w-4 text-sky-500" />}
              title="Marcaciones históricas"
              defaultOpen={false}
            >
              <GuardiaMarcacionesTab guardiaId={guardia.id} />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<CalendarDays className="h-4 w-4 text-cyan-500" />}
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
              icon={<CalendarDays className="h-4 w-4 text-amber-500" />}
              title="Turnos extra"
              defaultOpen={false}
            >
              <TurnosExtraSection guardiaId={guardia.id} />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
              title="Desempeño"
              defaultOpen={false}
            >
              <GuardiaDesempenoTab guardiaId={guardia.id} />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<History className="h-4 w-4 text-muted-foreground" />}
              title="Historial del guardia"
              defaultOpen={false}
            >
              <HistorialSection historyEvents={guardia.historyEvents} />
            </CollapsibleSection>
          </div>
        );
      case "contractual":
        return (
          <div className="space-y-3">
            <CollapsibleSection
              icon={<Briefcase className="h-4 w-4 text-blue-500" />}
              title="Contratos"
              defaultOpen
            >
              <GuardContractsTab
                guardiaId={guardia.id} guardiaName={fullName}
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
            <CollapsibleSection
              icon={<FileText className="h-4 w-4 text-violet-500" />}
              title="Eventos laborales"
              defaultOpen={false}
            >
              <GuardEventsTab
                guardiaId={guardia.id} guardiaName={fullName} userRole={userRole}
                guardContract={guardia.contractType ? {
                  contractType: guardia.contractType as "plazo_fijo" | "indefinido",
                  contractStartDate: guardia.contractStartDate ?? null, contractPeriod1End: guardia.contractPeriod1End ?? null,
                  contractPeriod2End: guardia.contractPeriod2End ?? null, contractPeriod3End: guardia.contractPeriod3End ?? null,
                  contractCurrentPeriod: guardia.contractCurrentPeriod ?? 1, contractBecameIndefinidoAt: guardia.contractBecameIndefinidoAt ?? null,
                } : null}
              />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<FileText className="h-4 w-4 text-emerald-500" />}
              title="Ficha de documentos"
              defaultOpen
            >
              <DocumentosSection
                guardiaId={guardia.id}
                documents={guardia.documents}
                canManageDocs={canManageDocs}
                guardiaDocConfig={guardiaDocConfig}
                operationalSlots={operationalGuardDocSlots}
                docLabels={docLabels}
                onDocumentsChange={(documents) => setGuardia((prev) => ({ ...prev, documents }))}
              />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<FileText className="h-4 w-4 text-sky-500" />}
              title="Documentos adicionales"
              defaultOpen={false}
            >
              <FileAttachments entityType="guardia" entityId={guardia.id} title="Documentos adicionales" />
            </CollapsibleSection>
            {hasInventarioAccess && (
              <CollapsibleSection
                icon={<Shirt className="h-4 w-4 text-orange-500" />}
                title="Uniformes"
                defaultOpen={false}
              >
                <InventarioGuardiaAssignmentsSection guardiaId={guardia.id} />
              </CollapsibleSection>
            )}
          </div>
        );
      case "financiero":
        return (
          <div className="space-y-3">
            <CollapsibleSection
              icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
              title="Estructura de sueldo"
              defaultOpen
            >
              <GuardiaSalaryTab guardiaId={guardia.id} />
            </CollapsibleSection>
            <CollapsibleSection
              icon={<Receipt className="h-4 w-4 text-amber-500" />}
              title="Liquidaciones"
              defaultOpen={false}
            >
              <GuardiaLiquidacionesTab guardiaId={guardia.id} />
            </CollapsibleSection>
            {personaAdminId && (
              <CollapsibleSection
                icon={<Receipt className="h-4 w-4 text-blue-500" />}
                title="Rendiciones de gastos"
                defaultOpen={false}
              >
                <PersonaRendicionesTab adminId={personaAdminId} />
              </CollapsibleSection>
            )}
          </div>
        );
    }
  };

  const headerActions: EntityHeaderAction[] = [
    ...(guardia.persona.phoneMobile
      ? [
          {
            label: "Llamar",
            icon: Phone,
            onClick: () => {
              window.location.href = `tel:+56${guardia.persona.phoneMobile}`;
            },
            primary: true,
          } as EntityHeaderAction,
          {
            label: "WhatsApp",
            icon: MessageCircle,
            onClick: () => {
              window.open(
                `https://wa.me/56${guardia.persona.phoneMobile}`,
                "_blank",
                "noopener,noreferrer",
              );
            },
            primary: true,
          } as EntityHeaderAction,
        ]
      : []),
    ...(canManageGuardias
      ? [
          {
            label: "Editar datos personales",
            icon: Pencil,
            onClick: openEditPersonal,
            primary: true,
          } as EntityHeaderAction,
        ]
      : []),
    ...(puedeRecontratar
      ? [
          {
            label: "Recontratar guardia",
            icon: UserPlus,
            onClick: () => {
              setRecontratarDate(new Date().toISOString().slice(0, 10));
              setRecontratarModalOpen(true);
            },
          } as EntityHeaderAction,
        ]
      : []),
    ...(canChangeLifecycle && guardia.lifecycleStatus !== "inactivo"
      ? getLifecycleTransitions(guardia.lifecycleStatus).map((status) => ({
          label: `Cambiar a ${LIFECYCLE_LABELS[status] || status}`,
          icon: RefreshCw,
          onClick: () => void handleLifecycleChange(status),
        }) as EntityHeaderAction)
      : []),
    ...(canManageGuardias
      ? [
          {
            label: "Eliminar guardia",
            icon: Trash2,
            onClick: () => void handleEliminar(),
            variant: "destructive" as const,
          } as EntityHeaderAction,
        ]
      : []),
  ];

  const initials =
    `${guardia.persona.firstName?.[0] || ""}${guardia.persona.lastName?.[0] || ""}`
      .toUpperCase() || "?";

  return (
    <>
      <EntityDetailLayout
        breadcrumb={["Personas", "Guardias", fullName]}
        breadcrumbHrefs={["/personas/guardias", "/personas/guardias"]}
        header={{
          avatar: {
            photoUrl: guardia.faceIdPhotoUrl,
            initials,
            color: "bg-indigo-500/10 text-indigo-500",
          },
          title: fullName,
          subtitle: guardia.persona.rut ? `RUT ${guardia.persona.rut}` : undefined,
          status: {
            label: LIFECYCLE_LABELS[guardia.lifecycleStatus] || guardia.lifecycleStatus,
            variant: LIFECYCLE_STATUS_VARIANT[guardia.lifecycleStatus] || "secondary",
          },
          actions: headerActions,
        }}
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as TabKey)}
        onAvatarClick={guardia.faceIdPhotoUrl ? () => setPhotoModalOpen(true) : undefined}
        rightPanel={
          <AssociatedRecordsPanel
            sections={[
              {
                id: "comunicacion",
                label: "Comunicación",
                content: (
                  <CommunicationSection
                    guardiaId={guardia.id}
                    email={guardia.persona.email}
                    phoneMobile={guardia.persona.phoneMobile}
                    historyEvents={guardia.historyEvents}
                    onHistoryEventAdded={(event) =>
                      setGuardia((prev) => ({
                        ...prev,
                        historyEvents: [event, ...prev.historyEvents],
                      }))
                    }
                  />
                ),
                defaultOpen: true,
              },
            ]}
          />
        }
      >
        {renderTabContent()}
      </EntityDetailLayout>

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
            <div className="space-y-1.5"><Label className="text-sm">Nombre *</Label>
              <Input value={editPersonalForm.firstName} onChange={(e) => setEditPersonalForm((p) => ({ ...p, firstName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-sm">Apellido *</Label>
              <Input value={editPersonalForm.lastName} onChange={(e) => setEditPersonalForm((p) => ({ ...p, lastName: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-sm">RUT</Label>
              <Input value={editPersonalForm.rut} onChange={(e) => setEditPersonalForm((p) => ({ ...p, rut: e.target.value }))} placeholder="12.345.678-9" /></div>
            <div className="space-y-1.5"><Label className="text-sm">Email corporativo</Label>
              <Input type="email" value={editPersonalForm.email} onChange={(e) => setEditPersonalForm((p) => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-sm">Email personal *<span className="text-xs text-muted-foreground ml-1">(Res. N°38)</span></Label>
              <Input type="email" value={editPersonalForm.personalEmail ?? ""} onChange={(e) => setEditPersonalForm((p) => ({ ...p, personalEmail: e.target.value }))} placeholder="guardia@gmail.com" /></div>
            <div className="space-y-1.5"><Label className="text-sm">Celular</Label>
              <Input value={editPersonalForm.phoneMobile} onChange={(e) => setEditPersonalForm((p) => ({ ...p, phoneMobile: e.target.value }))} placeholder="912345678" /></div>
            <div className="space-y-1.5"><Label className="text-sm">Sexo</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.sex} onChange={(e) => setEditPersonalForm((p) => ({ ...p, sex: e.target.value }))}>
                <option value="">Sin especificar</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option>
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Nacionalidad</Label>
              <SearchableSelect
                value={editPersonalForm.nacionalidad}
                options={PAISES_AMERICA.map((p) => ({ id: p, label: p }))}
                placeholder="Sin especificar"
                onChange={(val) => setEditPersonalForm((p) => ({ ...p, nacionalidad: val }))}
              /></div>
            <div className="space-y-1.5"><Label className="text-sm">Fecha de nacimiento</Label>
              <Input type="date" value={editPersonalForm.birthDate} onChange={(e) => setEditPersonalForm((p) => ({ ...p, birthDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-sm">Calzado</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.shoeSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, shoeSize: e.target.value }))}>
                <option value="">Sin especificar</option>{SHOE_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Pantalón</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.pantsSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, pantsSize: e.target.value }))}>
                <option value="">Sin especificar</option>{PANTS_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Polera</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.tshirtSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, tshirtSize: e.target.value }))}>
                <option value="">Sin especificar</option>{TOP_GARMENT_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Camisa</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.shirtSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, shirtSize: e.target.value }))}>
                <option value="">Sin especificar</option>{TOP_GARMENT_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Geólogo</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.geologoSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, geologoSize: e.target.value }))}>
                <option value="">Sin especificar</option>{TOP_GARMENT_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Polar</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.polarSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, polarSize: e.target.value }))}>
                <option value="">Sin especificar</option>{TOP_GARMENT_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Chaqueta</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.jacketSize} onChange={(e) => setEditPersonalForm((p) => ({ ...p, jacketSize: e.target.value }))}>
                <option value="">Sin especificar</option>{TOP_GARMENT_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Estatura (cm)</Label>
              <Input type="number" min="120" max="230" step="0.1" value={editPersonalForm.heightCm} onChange={(e) => setEditPersonalForm((p) => ({ ...p, heightCm: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-sm">Peso (kg)</Label>
              <Input type="number" min="35" max="250" step="0.1" value={editPersonalForm.weightKg} onChange={(e) => setEditPersonalForm((p) => ({ ...p, weightKg: e.target.value }))} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos previsionales</Label></div>
            <div className="space-y-1.5"><Label className="text-sm">Régimen previsional</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.regimenPrevisional} onChange={(e) => setEditPersonalForm((p) => ({ ...p, regimenPrevisional: e.target.value }))}>
                <option value="">Sin especificar</option>{REGIMEN_PREVISIONAL.map((r) => (<option key={r.value} value={r.value}>{r.label}</option>))}
              </select></div>
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editPersonalForm.isJubilado} onChange={(e) => setEditPersonalForm((p) => ({ ...p, isJubilado: e.target.checked }))} className="rounded border-input" />¿Jubilado?
              </label></div>
            {editPersonalForm.isJubilado && (<>
              <div className="space-y-1.5"><Label className="text-sm">Tipo de pensión</Label>
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
            <div className="space-y-1.5"><Label className="text-sm">AFP</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.afp} onChange={(e) => setEditPersonalForm((p) => ({ ...p, afp: e.target.value }))}>
                <option value="">Sin AFP</option>{AFP_CHILE.map((a) => (<option key={a} value={a}>{a}</option>))}
              </select></div>
            <div className="space-y-1.5"><Label className="text-sm">Sistema de salud</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editPersonalForm.healthSystem} onChange={(e) => setEditPersonalForm((p) => ({ ...p, healthSystem: e.target.value }))}>
                <option value="">Sin sistema</option>{HEALTH_SYSTEMS.map((h) => (<option key={h} value={h}>{h.toUpperCase()}</option>))}
              </select></div>
            {editPersonalForm.healthSystem === "isapre" && (<>
              <div className="space-y-1.5"><Label className="text-sm">Isapre</Label>
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
            <div className="space-y-1.5 sm:col-span-2"><Label className="text-sm">Dirección (Google Maps)</Label>
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

      <Dialog open={photoModalOpen} onOpenChange={setPhotoModalOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Foto de perfil</DialogTitle>
            <DialogDescription className="sr-only">Foto del guardia {fullName}</DialogDescription>
          </DialogHeader>
          <div className="p-4 pt-2 flex justify-center">
            {guardia.faceIdPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={guardia.faceIdPhotoUrl}
                alt={fullName}
                className="max-h-[70vh] w-auto rounded-lg object-contain"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
