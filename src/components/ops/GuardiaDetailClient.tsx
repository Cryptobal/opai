"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  List,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
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
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import type { RecordAction } from "@/components/crm/RecordActions";
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
import { NotesSection } from "@/components/crm/NotesSection";
import { InventarioGuardiaAssignmentsSection } from "@/components/inventario/InventarioGuardiaAssignmentsSection";
import DatosPersonalesSection from "@/components/ops/guardia-sections/DatosPersonalesSection";
import AsignacionSection from "@/components/ops/guardia-sections/AsignacionSection";
import MarcacionSection from "@/components/ops/guardia-sections/MarcacionSection";
import RondasSection from "@/components/ops/guardia-sections/RondasSection";
import DocumentosSection from "@/components/ops/guardia-sections/DocumentosSection";
import DocsVinculadosSection from "@/components/ops/guardia-sections/DocsVinculadosSection";
import CommunicationSection from "@/components/ops/guardia-sections/CommunicationSection";
import DiasTrabajadesSection from "@/components/ops/guardia-sections/DiasTrabajadesSection";
import TurnosExtraSection from "@/components/ops/guardia-sections/TurnosExtraSection";
import HistorialSection from "@/components/ops/guardia-sections/HistorialSection";

type GuardiaDetail = {
  id: string;
  code?: string | null;
  status: string;
  lifecycleStatus: string;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
  // Contract tracking
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
  };
  hiredAt?: string | null;
  terminatedAt?: string | null;
  availableExtraShifts?: boolean;
  marcacionPin?: string | null;
  marcacionPinVisible?: string | null;
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

function formatLifecycleBadgeLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function lifecycleBadgeVariant(
  value: string
): "default" | "secondary" | "success" | "warning" | "destructive" | "outline" {
  const normalized = value.toLowerCase();
  if (normalized.includes("activo") || normalized === "contratado") return "success";
  if (normalized.includes("inactivo")) return "warning";
  return "secondary";
}

const LIFECYCLE_LABELS: Record<string, string> = {
  postulante: "Postulante",
  seleccionado: "Seleccionado",
  contratado: "Contratado",
  te: "Turno Extra",
  inactivo: "Inactivo",
};

function toDateInput(val: string | Date | undefined | null): string {
  if (!val) return "";
  const d = typeof val === "string" ? new Date(val) : val;
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function GuardiaDetailClient({ initialGuardia, asignaciones = [], userRole, personaAdminId, currentUserId, guardiaDocConfig = [], hasInventarioAccess = false }: GuardiaDetailClientProps) {
  const router = useRouter();
  const [guardia, setGuardia] = useState(initialGuardia);

  // ── Edit personal modal state ──
  const [editPersonalOpen, setEditPersonalOpen] = useState(false);
  const [editPersonalSaving, setEditPersonalSaving] = useState(false);
  const [editPersonalForm, setEditPersonalForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phoneMobile: "",
    sex: "",
    nacionalidad: "",
    birthDate: "",
    afp: "",
    healthSystem: "",
    isapreName: "",
    isapreHasExtraPercent: false,
    isapreExtraPercent: "",
    hasMobilization: false,
    availableExtraShifts: false,
    addressFormatted: "",
    commune: "",
    city: "",
    region: "",
    lat: "",
    lng: "",
    regimenPrevisional: "",
    tipoPension: "",
    isJubilado: false,
    cotizaAFP: false,
    cotizaAFC: false,
    cotizaSalud: true,
  });

  // ── Doc links state (shared between DocsVinculados + Contratos) ──
  const [availableDocs, setAvailableDocs] = useState<
    Array<{
      id: string;
      title: string;
      module: string;
      category: string;
      status: string;
      createdAt: string;
      expirationDate?: string | null;
    }>
  >([]);
  const [linkedDocs, setLinkedDocs] = useState<
    Array<{
      id: string;
      role: string;
      createdAt: string;
      document: {
        id: string;
        title: string;
        module: string;
        category: string;
        status: string;
        signatureStatus?: string | null;
        createdAt: string;
        expirationDate?: string | null;
      };
    }>
  >([]);
  const [loadingDocLinks, setLoadingDocLinks] = useState(false);

  // ── Lifecycle state ──
  const [lifecycleChanging, setLifecycleChanging] = useState(false);
  const [contractDateModalOpen, setContractDateModalOpen] = useState(false);
  const [contractDate, setContractDate] = useState("");
  const [pendingLifecycleStatus, setPendingLifecycleStatus] = useState<string | null>(null);
  const [recontratarModalOpen, setRecontratarModalOpen] = useState(false);
  const [recontratarDate, setRecontratarDate] = useState("");

  // ── Permissions ──
  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canChangeLifecycle =
    hasOpsCapability(userRole, "guardias_manage") ||
    hasOpsCapability(userRole, "rrhh_events");
  const canManageDocs = hasOpsCapability(userRole, "guardias_documents");

  // ── Edit personal handlers ──
  const openEditPersonal = () => {
    setEditPersonalForm({
      firstName: guardia.persona.firstName || "",
      lastName: guardia.persona.lastName || "",
      rut: guardia.persona.rut || "",
      email: guardia.persona.email || "",
      phoneMobile: guardia.persona.phoneMobile || "",
      sex: guardia.persona.sex || "",
      nacionalidad: guardia.persona.nacionalidad || "",
      birthDate: toDateInput(guardia.persona.birthDate),
      afp: guardia.persona.afp || "",
      healthSystem: guardia.persona.healthSystem || "",
      isapreName: guardia.persona.isapreName || "",
      isapreHasExtraPercent: guardia.persona.isapreHasExtraPercent || false,
      isapreExtraPercent: guardia.persona.isapreExtraPercent || "",
      hasMobilization: guardia.persona.hasMobilization || false,
      availableExtraShifts: guardia.availableExtraShifts || false,
      addressFormatted: guardia.persona.addressFormatted || "",
      commune: guardia.persona.commune || "",
      city: guardia.persona.city || "",
      region: guardia.persona.region || "",
      lat: guardia.persona.lat || "",
      lng: guardia.persona.lng || "",
      regimenPrevisional: guardia.persona.regimenPrevisional || "",
      tipoPension: guardia.persona.tipoPension || "",
      isJubilado: guardia.persona.isJubilado || false,
      cotizaAFP: guardia.persona.cotizaAFP ?? false,
      cotizaAFC: guardia.persona.cotizaAFC ?? false,
      cotizaSalud: guardia.persona.cotizaSalud ?? true,
    });
    setEditPersonalOpen(true);
  };

  const onEditAddressChange = (result: AddressResult) => {
    setEditPersonalForm((p) => ({
      ...p,
      addressFormatted: result.address,
      commune: result.commune || "",
      city: result.city || "",
      region: result.region || "",
      lat: String(result.lat || ""),
      lng: String(result.lng || ""),
    }));
  };

  const saveEditPersonal = async () => {
    setEditPersonalSaving(true);
    try {
      const res = await fetch(`/api/personas/guardias/${guardia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editPersonalForm.firstName.trim() || undefined,
          lastName: editPersonalForm.lastName.trim() || undefined,
          rut: editPersonalForm.rut.trim() || undefined,
          email: editPersonalForm.email.trim() || undefined,
          phoneMobile: editPersonalForm.phoneMobile.trim() || undefined,
          sex: editPersonalForm.sex || undefined,
          nacionalidad: editPersonalForm.nacionalidad || undefined,
          birthDate: editPersonalForm.birthDate || undefined,
          afp: editPersonalForm.afp || undefined,
          healthSystem: editPersonalForm.healthSystem || undefined,
          isapreName: editPersonalForm.healthSystem === "isapre" ? editPersonalForm.isapreName || undefined : undefined,
          isapreHasExtraPercent: editPersonalForm.healthSystem === "isapre" ? editPersonalForm.isapreHasExtraPercent : undefined,
          isapreExtraPercent: editPersonalForm.healthSystem === "isapre" && editPersonalForm.isapreHasExtraPercent ? editPersonalForm.isapreExtraPercent || undefined : undefined,
          hasMobilization: editPersonalForm.hasMobilization,
          regimenPrevisional: editPersonalForm.regimenPrevisional || undefined,
          tipoPension: editPersonalForm.tipoPension || undefined,
          isJubilado: editPersonalForm.isJubilado,
          cotizaAFP: editPersonalForm.cotizaAFP,
          cotizaAFC: editPersonalForm.cotizaAFC,
          cotizaSalud: editPersonalForm.cotizaSalud,
          availableExtraShifts: editPersonalForm.availableExtraShifts,
          addressFormatted: editPersonalForm.addressFormatted.trim() || undefined,
          commune: editPersonalForm.commune.trim() || undefined,
          city: editPersonalForm.city.trim() || undefined,
          region: editPersonalForm.region.trim() || undefined,
          lat: editPersonalForm.lat ? Number(editPersonalForm.lat) : undefined,
          lng: editPersonalForm.lng ? Number(editPersonalForm.lng) : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al guardar");
        return;
      }
      setGuardia((prev) => ({
        ...prev,
        availableExtraShifts: editPersonalForm.availableExtraShifts,
        persona: {
          ...prev.persona,
          firstName: editPersonalForm.firstName.trim() || prev.persona.firstName,
          lastName: editPersonalForm.lastName.trim() || prev.persona.lastName,
          rut: editPersonalForm.rut.trim() || prev.persona.rut,
          email: editPersonalForm.email.trim() || prev.persona.email,
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
          isJubilado: editPersonalForm.isJubilado,
          cotizaAFP: editPersonalForm.cotizaAFP,
          cotizaAFC: editPersonalForm.cotizaAFC,
          cotizaSalud: editPersonalForm.cotizaSalud,
          addressFormatted: editPersonalForm.addressFormatted.trim() || prev.persona.addressFormatted,
          commune: editPersonalForm.commune.trim() || prev.persona.commune,
          city: editPersonalForm.city.trim() || prev.persona.city,
          region: editPersonalForm.region.trim() || prev.persona.region,
          lat: editPersonalForm.lat || prev.persona.lat,
          lng: editPersonalForm.lng || prev.persona.lng,
        },
      }));
      toast.success("Datos actualizados");
      setEditPersonalOpen(false);
    } catch {
      toast.error("Error al guardar datos personales");
    } finally {
      setEditPersonalSaving(false);
    }
  };

  // ── Doc links (shared between DocsVinculados + Contratos sections) ──
  const loadDocLinks = async () => {
    setLoadingDocLinks(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}/doc-links`);
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudieron cargar vínculos");
      }
      setLinkedDocs(payload.data?.linked ?? []);
      setAvailableDocs(payload.data?.available ?? []);
    } catch (error) {
      console.error(error);
      toast.error("No se pudieron cargar documentos vinculables");
    } finally {
      setLoadingDocLinks(false);
    }
  };

  useEffect(() => {
    void loadDocLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardia.id]);

  // ── Lifecycle handlers ──
  const handleLifecycleChange = async (nextStatus: string) => {
    if (lifecycleChanging) return;
    if (nextStatus === "contratado") {
      setContractDate(new Date().toISOString().slice(0, 10));
      setPendingLifecycleStatus(nextStatus);
      setContractDateModalOpen(true);
      return;
    }
    await doLifecycleChange(nextStatus, undefined);
  };

  const doLifecycleChange = async (nextStatus: string, effectiveAt?: string) => {
    if (lifecycleChanging) return;
    setLifecycleChanging(true);
    try {
      const body: { lifecycleStatus: string; effectiveAt?: string } = { lifecycleStatus: nextStatus };
      if (effectiveAt) body.effectiveAt = effectiveAt;
      const response = await fetch(`/api/personas/guardias/${guardia.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo cambiar el estado");
      }
      setGuardia((prev) => ({
        ...prev,
        lifecycleStatus: payload.data.lifecycleStatus,
        status: payload.data.status,
        hiredAt: payload.data.hiredAt ?? prev.hiredAt,
        terminatedAt: payload.data.terminatedAt ?? prev.terminatedAt,
      }));
      toast.success("Estado actualizado");
      setContractDateModalOpen(false);
      setPendingLifecycleStatus(null);
      setRecontratarModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar el estado");
    } finally {
      setLifecycleChanging(false);
    }
  };

  const handleConfirmContractDate = () => {
    if (!pendingLifecycleStatus || !contractDate) {
      toast.error("Selecciona la fecha de inicio de contrato");
      return;
    }
    void doLifecycleChange(pendingLifecycleStatus, contractDate);
  };

  const handleConfirmRecontratar = () => {
    if (!recontratarDate) {
      toast.error("Selecciona la fecha de recontratación");
      return;
    }
    void doLifecycleChange("contratado", recontratarDate);
  };

  const handleEliminar = async () => {
    if (
      !window.confirm(
        "¿ELIMINAR permanentemente a este guardia y su persona asociada? Esta acción no se puede deshacer. Si tiene registros asociados (marcaciones, asistencia, rondas), no se podrá eliminar."
      )
    )
      return;
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo eliminar");
      }
      toast.success("Guardia eliminado permanentemente");
      router.push("/personas/guardias");
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || "No se pudo eliminar al guardia");
    }
  };

  // ── Computed ──
  const guardiaTitle = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim() || "Guardia";
  const guardiaSubtitle = guardia.persona.rut ? `RUT ${guardia.persona.rut}` : undefined;
  const guardiaBadgeLabel = formatLifecycleBadgeLabel(guardia.lifecycleStatus);
  const guardiaBadgeVariant = lifecycleBadgeVariant(guardia.lifecycleStatus);

  // ── Sections ──
  const sections = [
    /* datos — fixed, first, always open */
    {
      key: "datos" as const,
      label: "Datos personales",
      action: canManageGuardias ? (
        <Button size="sm" variant="outline" onClick={openEditPersonal}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Editar
        </Button>
      ) : undefined,
      children: (
        <DatosPersonalesSection
          guardiaId={guardia.id}
          persona={guardia.persona}
          hiredAt={guardia.hiredAt}
          availableExtraShifts={guardia.availableExtraShifts}
          recibeAnticipo={guardia.recibeAnticipo}
          montoAnticipo={guardia.montoAnticipo}
          bankAccounts={guardia.bankAccounts}
          asignaciones={asignaciones}
          canManageGuardias={canManageGuardias}
          onBankAccountsChange={(bankAccounts) => setGuardia((prev) => ({ ...prev, bankAccounts }))}
        />
      ),
    },
    /* asignacion */
    {
      key: "asignacion" as const,
      children: (
        <AsignacionSection asignaciones={asignaciones} />
      ),
    },
    /* uniformes asignados */
    ...(hasInventarioAccess
      ? [
          {
            key: "uniformes" as const,
            label: "Uniformes asignados",
            children: (
              <InventarioGuardiaAssignmentsSection guardiaId={guardia.id} />
            ),
          },
        ]
      : []),
    /* marcacion */
    {
      key: "marcacion" as const,
      label: "Marcación de asistencia",
      children: (
        <MarcacionSection
          guardiaId={guardia.id}
          marcacionPin={guardia.marcacionPin}
          marcacionPinVisible={guardia.marcacionPinVisible}
          canManageGuardias={canManageGuardias}
          onPinUpdated={(pin) => {
            setGuardia((prev) => ({
              ...prev,
              marcacionPin: "[configurado]",
              marcacionPinVisible: pin,
            }));
          }}
        />
      ),
    },
    /* rondas */
    {
      key: "rondas" as const,
      label: "Marcación de rondas",
      children: (
        <RondasSection currentInstallation={guardia.currentInstallation} />
      ),
    },
    /* contratos de trabajo */
    {
      key: "contratos" as const,
      label: "Contratos",
      children: (
        <GuardContractsTab
          guardiaId={guardia.id}
          guardiaName={`${guardia.persona.firstName} ${guardia.persona.lastName}`}
          guardiaEmail={guardia.persona.email}
          guardiaRut={guardia.persona.rut}
          hiredAt={guardia.hiredAt ?? null}
          contract={guardia.contractType ? {
            contractType: guardia.contractType as "plazo_fijo" | "indefinido",
            contractStartDate: guardia.contractStartDate ?? null,
            contractPeriod1End: guardia.contractPeriod1End ?? null,
            contractPeriod2End: guardia.contractPeriod2End ?? null,
            contractPeriod3End: guardia.contractPeriod3End ?? null,
            contractCurrentPeriod: guardia.contractCurrentPeriod ?? 1,
            contractBecameIndefinidoAt: guardia.contractBecameIndefinidoAt ?? null,
          } : null}
          linkedDocuments={linkedDocs
            .filter((item) => item.document.category === "contrato_laboral" || item.document.category === "anexo_contrato")
            .map((item) => ({
              id: item.document.id,
              title: item.document.title,
              category: item.document.category,
              signatureStatus: item.document.signatureStatus,
              expirationDate: item.document.expirationDate ?? null,
            }))}
          onDocumentsGenerated={loadDocLinks}
          canManageDocs={canManageDocs}
        />
      ),
    },
    /* estructura de sueldo */
    {
      key: "estructura-sueldo" as const,
      label: "Estructura de sueldo",
      children: (
        <GuardiaSalaryTab guardiaId={guardia.id} />
      ),
    },
    /* liquidaciones */
    {
      key: "liquidaciones" as const,
      label: "Liquidaciones",
      children: (
        <GuardiaLiquidacionesTab guardiaId={guardia.id} />
      ),
    },
    /* eventos laborales */
    {
      key: "eventos-laborales" as const,
      label: "Eventos laborales",
      children: (
        <GuardEventsTab
          guardiaId={guardia.id}
          guardiaName={`${guardia.persona.firstName} ${guardia.persona.lastName}`}
          userRole={userRole}
          guardContract={guardia.contractType ? {
            contractType: guardia.contractType as "plazo_fijo" | "indefinido",
            contractStartDate: guardia.contractStartDate ?? null,
            contractPeriod1End: guardia.contractPeriod1End ?? null,
            contractPeriod2End: guardia.contractPeriod2End ?? null,
            contractPeriod3End: guardia.contractPeriod3End ?? null,
            contractCurrentPeriod: guardia.contractCurrentPeriod ?? 1,
            contractBecameIndefinidoAt: guardia.contractBecameIndefinidoAt ?? null,
          } : null}
        />
      ),
    },
    /* documentos */
    {
      key: "documentos" as const,
      label: "Ficha de documentos",
      children: (
        <DocumentosSection
          guardiaId={guardia.id}
          documents={guardia.documents}
          canManageDocs={canManageDocs}
          guardiaDocConfig={guardiaDocConfig}
          onDocumentsChange={(documents) => setGuardia((prev) => ({ ...prev, documents }))}
        />
      ),
    },
    /* docs-vinculados */
    {
      key: "docs-vinculados" as const,
      label: "Documentos vinculados (Docs)",
      children: (
        <DocsVinculadosSection
          guardiaId={guardia.id}
          canManageDocs={canManageDocs}
          linkedDocs={linkedDocs}
          availableDocs={availableDocs}
          loadingDocLinks={loadingDocLinks}
          onReloadDocLinks={loadDocLinks}
        />
      ),
    },
    /* communication (comunicaciones) */
    {
      key: "communication" as const,
      label: "Comunicación con guardia",
      children: (
        <CommunicationSection
          guardiaId={guardia.id}
          email={guardia.persona.email}
          phoneMobile={guardia.persona.phoneMobile}
          historyEvents={guardia.historyEvents}
          onHistoryEventAdded={(event) => {
            setGuardia((prev) => ({
              ...prev,
              historyEvents: [event, ...prev.historyEvents],
            }));
          }}
        />
      ),
    },
    /* comentarios internos con @ mentions */
    {
      key: "comentarios" as const,
      label: "Comentarios internos",
      children: (
        <NotesSection
          entityType="ops_guardia"
          entityId={guardia.id}
          currentUserId={currentUserId ?? ""}
        />
      ),
    },
    /* dias-trabajados */
    {
      key: "dias-trabajados" as const,
      children: (
        <DiasTrabajadesSection guardiaId={guardia.id} />
      ),
    },
    /* turnos-extra */
    {
      key: "turnos-extra" as const,
      children: (
        <TurnosExtraSection guardiaId={guardia.id} />
      ),
    },
    /* rendiciones */
    ...(personaAdminId
      ? [
          {
            key: "rendiciones" as const,
            label: "Rendiciones de gastos",
            children: <PersonaRendicionesTab adminId={personaAdminId} />,
          },
        ]
      : []),
    /* historial */
    {
      key: "historial" as const,
      label: "Historial del guardia",
      children: (
        <HistorialSection historyEvents={guardia.historyEvents} />
      ),
    },
  ];

  // ── Record actions ──
  const recordActions: RecordAction[] = [];
  const puedeRecontratar =
    canManageGuardias &&
    guardia.lifecycleStatus === "inactivo" &&
    guardia.terminatedAt;

  if (puedeRecontratar) {
    recordActions.push({
      label: "Recontratar guardia",
      icon: UserPlus,
      variant: "default",
      onClick: () => {
        setRecontratarDate(new Date().toISOString().slice(0, 10));
        setRecontratarModalOpen(true);
      },
    });
  }

  if (canManageGuardias) {
    recordActions.push({
      label: "Eliminar guardia",
      icon: Trash2,
      variant: "destructive",
      onClick: () => void handleEliminar(),
    });
  }

  const actionsToShow: RecordAction[] =
    recordActions.length > 0
      ? recordActions
      : [
          {
            label: "Ir a lista de guardias",
            icon: List,
            onClick: () => router.push("/personas/guardias"),
          },
        ];

  return (
    <>
      <CrmDetailLayout
        module="guardias"
        pageType="guardia"
        fixedSectionKey="datos"
        title={guardiaTitle}
        subtitle={guardiaSubtitle}
        badge={{
          label: guardiaBadgeLabel + (guardia.lifecycleStatus === "inactivo" && guardia.terminatedAt ? " · Finiquitado" : ""),
          variant: guardiaBadgeVariant,
        }}
        backHref="/personas/guardias"
        backLabel="Personas"
        actions={actionsToShow}
        extra={
          canChangeLifecycle && getLifecycleTransitions(guardia.lifecycleStatus).length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={lifecycleChanging} className="gap-1.5">
                  {lifecycleChanging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Cambiar estado
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {getLifecycleTransitions(guardia.lifecycleStatus).map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => void handleLifecycleChange(status)}
                  >
                    {LIFECYCLE_LABELS[status] || status}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
        sections={sections}
      />

      {/* ── Modal fecha de contrato (al pasar a Contratado) ── */}
      <Dialog open={contractDateModalOpen} onOpenChange={setContractDateModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fecha de inicio de contrato</DialogTitle>
            <DialogDescription>
              Indica la fecha en que inicia el contrato de este guardia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Fecha de inicio</Label>
              <Input
                type="date"
                value={contractDate}
                onChange={(e) => setContractDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractDateModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmContractDate} disabled={lifecycleChanging}>
              {lifecycleChanging ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal recontratar (inactivo con finiquito) ── */}
      <Dialog open={recontratarModalOpen} onOpenChange={setRecontratarModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recontratar guardia</DialogTitle>
            <DialogDescription>
              ¿Desea recontratar a este guardia? Indique la fecha de inicio del nuevo contrato.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Fecha de recontratación</Label>
              <Input
                type="date"
                value={recontratarDate}
                onChange={(e) => setRecontratarDate(e.target.value)}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecontratarModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmRecontratar} disabled={lifecycleChanging}>
              {lifecycleChanging ? "Guardando..." : "Recontratar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Personal Data Modal ── */}
      <Dialog open={editPersonalOpen} onOpenChange={setEditPersonalOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar datos personales</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input
                value={editPersonalForm.firstName}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, firstName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Apellido *</Label>
              <Input
                value={editPersonalForm.lastName}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, lastName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">RUT</Label>
              <Input
                value={editPersonalForm.rut}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, rut: e.target.value }))}
                placeholder="12.345.678-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={editPersonalForm.email}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Celular</Label>
              <Input
                value={editPersonalForm.phoneMobile}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, phoneMobile: e.target.value }))}
                placeholder="912345678"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sexo</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editPersonalForm.sex}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, sex: e.target.value }))}
              >
                <option value="">Sin especificar</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nacionalidad</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editPersonalForm.nacionalidad}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, nacionalidad: e.target.value }))}
              >
                <option value="">Sin especificar</option>
                {PAISES_AMERICA.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha de nacimiento</Label>
              <Input
                type="date"
                value={editPersonalForm.birthDate}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, birthDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Datos previsionales</Label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Régimen previsional</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editPersonalForm.regimenPrevisional}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, regimenPrevisional: e.target.value }))}
              >
                <option value="">Sin especificar</option>
                {REGIMEN_PREVISIONAL.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPersonalForm.isJubilado}
                  onChange={(e) => setEditPersonalForm((p) => ({ ...p, isJubilado: e.target.checked }))}
                  className="rounded border-input"
                />
                ¿Jubilado?
              </label>
            </div>
            {editPersonalForm.isJubilado && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de pensión</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editPersonalForm.tipoPension}
                    onChange={(e) => setEditPersonalForm((p) => ({ ...p, tipoPension: e.target.value }))}
                  >
                    <option value="">Sin especificar</option>
                    {TIPO_PENSION.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPersonalForm.cotizaAFP}
                      onChange={(e) => setEditPersonalForm((p) => ({ ...p, cotizaAFP: e.target.checked }))}
                      className="rounded border-input"
                    />
                    Cotiza AFP (voluntario)
                  </label>
                </div>
                <div className="space-y-1.5 flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPersonalForm.cotizaAFC}
                      onChange={(e) => setEditPersonalForm((p) => ({ ...p, cotizaAFC: e.target.checked }))}
                      className="rounded border-input"
                    />
                    Cotiza AFC
                  </label>
                </div>
              </>
            )}
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPersonalForm.cotizaSalud}
                  onChange={(e) => setEditPersonalForm((p) => ({ ...p, cotizaSalud: e.target.checked }))}
                  className="rounded border-input"
                />
                Cotiza salud
              </label>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">AFP</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editPersonalForm.afp}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, afp: e.target.value }))}
              >
                <option value="">Sin AFP</option>
                {AFP_CHILE.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sistema de salud</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editPersonalForm.healthSystem}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, healthSystem: e.target.value }))}
              >
                <option value="">Sin sistema</option>
                {HEALTH_SYSTEMS.map((h) => (
                  <option key={h} value={h}>{h.toUpperCase()}</option>
                ))}
              </select>
            </div>
            {editPersonalForm.healthSystem === "isapre" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Isapre</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={editPersonalForm.isapreName}
                    onChange={(e) => setEditPersonalForm((p) => ({ ...p, isapreName: e.target.value }))}
                  >
                    <option value="">Seleccionar</option>
                    {ISAPRES_CHILE.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 flex items-end gap-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPersonalForm.isapreHasExtraPercent}
                      onChange={(e) => setEditPersonalForm((p) => ({ ...p, isapreHasExtraPercent: e.target.checked }))}
                      className="rounded border-input"
                    />
                    Cotización extra
                  </label>
                  {editPersonalForm.isapreHasExtraPercent && (
                    <Input
                      type="number"
                      step="0.01"
                      className="w-24"
                      placeholder="%"
                      value={editPersonalForm.isapreExtraPercent}
                      onChange={(e) => setEditPersonalForm((p) => ({ ...p, isapreExtraPercent: e.target.value }))}
                    />
                  )}
                </div>
              </>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Dirección (Google Maps)</Label>
              <AddressAutocomplete
                value={editPersonalForm.addressFormatted}
                onChange={onEditAddressChange}
                placeholder="Buscar dirección..."
                showMap
              />
              {(editPersonalForm.commune || editPersonalForm.city || editPersonalForm.region) && (
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-3 mt-1">
                  <Input value={editPersonalForm.commune} readOnly placeholder="Comuna" className="text-xs h-8" />
                  <Input value={editPersonalForm.city} readOnly placeholder="Ciudad" className="text-xs h-8" />
                  <Input value={editPersonalForm.region} readOnly placeholder="Región" className="text-xs h-8" />
                </div>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2 flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPersonalForm.hasMobilization}
                  onChange={(e) => setEditPersonalForm((p) => ({ ...p, hasMobilization: e.target.checked }))}
                  className="rounded border-input"
                />
                Con movilización
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={editPersonalForm.availableExtraShifts}
                  onChange={(e) => setEditPersonalForm((p) => ({ ...p, availableExtraShifts: e.target.checked }))}
                  className="rounded border-input"
                />
                Disponible para turnos extra
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPersonalOpen(false)} disabled={editPersonalSaving}>
              Cancelar
            </Button>
            <Button onClick={saveEditPersonal} disabled={editPersonalSaving}>
              {editPersonalSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
