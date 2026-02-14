"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  Copy,
  FilePlus2,
  History,
  Landmark,
  List,
  Loader2,
  KeyRound,
  Mail,
  MessageCircle,
  MessageSquare,
  Link2,
  MapPin,
  Pencil,
  Route,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressAutocomplete, type AddressResult } from "@/components/ui/AddressAutocomplete";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CrmDetailLayout } from "@/components/crm/CrmDetailLayout";
import type { RecordAction } from "@/components/crm/RecordActions";
import {
  AFP_CHILE,
  BANK_ACCOUNT_TYPES,
  CHILE_BANKS,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  GUARDIA_COMM_TEMPLATES,
  HEALTH_SYSTEMS,
  ISAPRES_CHILE,
} from "@/lib/personas";
import { hasOpsCapability } from "@/lib/ops-rbac";
import { PersonaRendicionesTab } from "@/components/finance/PersonaRendicionesTab";
import { GuardEventsTab } from "@/components/ops/guard-events";

/** Format a date-only value using UTC to avoid timezone shift */
function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

type GuardiaDetail = {
  id: string;
  code?: string | null;
  status: string;
  lifecycleStatus: string;
  isBlacklisted: boolean;
  blacklistReason?: string | null;
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
    afp?: string | null;
    healthSystem?: string | null;
    isapreName?: string | null;
    isapreHasExtraPercent?: boolean | null;
    isapreExtraPercent?: string | null;
    hasMobilization?: boolean | null;
  };
  hiredAt?: string | null;
  availableExtraShifts?: boolean;
  marcacionPin?: string | null; // hash/indicador de PIN configurado
  marcacionPinVisible?: string | null; // PIN visible para operación en ficha
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
  puesto: { id: string; name: string; shiftStart: string; shiftEnd: string };
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
}

const DOC_LABEL: Record<string, string> = {
  certificado_antecedentes: "Certificado de antecedentes",
  certificado_os10: "Certificado OS-10",
  cedula_identidad: "Cédula de identidad",
  curriculum: "Currículum",
  contrato: "Contrato",
  anexo_contrato: "Anexo de contrato",
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cuenta_corriente: "Cuenta corriente",
  cuenta_vista: "Cuenta vista",
  cuenta_rut: "Cuenta RUT",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  lifecycle_changed: "Cambio de estado",
  document_uploaded: "Documento subido",
  document_updated: "Documento actualizado",
  document_deleted: "Documento eliminado",
  bank_account_created: "Cuenta bancaria creada",
  bank_account_updated: "Cuenta bancaria actualizada",
  bank_account_deleted: "Cuenta bancaria eliminada",
  status_changed: "Cambio de estado",
  blacklist_added: "Agregado a lista negra",
  blacklist_removed: "Quitado de lista negra",
  assigned: "Asignado a puesto",
  unassigned: "Desasignado de puesto",
};

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
  if (normalized.includes("activo")) return "success";
  if (normalized.includes("inactivo")) return "warning";
  if (normalized.includes("desvinculado") || normalized.includes("blacklist")) return "destructive";
  return "secondary";
}

export function GuardiaDetailClient({ initialGuardia, asignaciones = [], userRole, personaAdminId }: GuardiaDetailClientProps) {
  const router = useRouter();
  const [guardia, setGuardia] = useState(initialGuardia);
  const [uploading, setUploading] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [docForm, setDocForm] = useState({
    type: "certificado_antecedentes",
    status: "pendiente",
    issuedAt: "",
    expiresAt: "",
    fileUrl: "",
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const issuedAtRef = useRef<HTMLInputElement | null>(null);
  const expiresAtRef = useRef<HTMLInputElement | null>(null);
  const existingAccount = guardia.bankAccounts[0] ?? null;
  const [accountForm, setAccountForm] = useState({
    bankCode: "",
    accountType: "",
    accountNumber: "",
    isDefault: true,
  });
  useEffect(() => {
    if (existingAccount) {
      setAccountForm({
        bankCode: existingAccount.bankCode ?? "",
        accountType: existingAccount.accountType ?? "",
        accountNumber: existingAccount.accountNumber ?? "",
        isDefault: existingAccount.isDefault ?? true,
      });
    } else {
      setAccountForm({ bankCode: "", accountType: "", accountNumber: "", isDefault: true });
    }
  }, [existingAccount?.id, existingAccount?.bankCode, existingAccount?.accountType, existingAccount?.accountNumber, existingAccount?.isDefault]);
  const [sendingComm, setSendingComm] = useState(false);
  const [commForm, setCommForm] = useState({
    channel: "email",
    templateId: GUARDIA_COMM_TEMPLATES.find((t) => t.channel === "email")?.id ?? "",
  });
  const [savingDocId, setSavingDocId] = useState<string | null>(null);
  const [deletingDocId, setDeletingDocId] = useState<string | null>(null);
  const [docEdits, setDocEdits] = useState<
    Record<string, { status: string; issuedAt: string; expiresAt: string }>
  >({});
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [editPersonalOpen, setEditPersonalOpen] = useState(false);
  const [editPersonalSaving, setEditPersonalSaving] = useState(false);
  const [editPersonalForm, setEditPersonalForm] = useState({
    firstName: "",
    lastName: "",
    rut: "",
    email: "",
    phoneMobile: "",
    sex: "",
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
  });
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
        createdAt: string;
        expirationDate?: string | null;
      };
    }>
  >([]);
  const [loadingDocLinks, setLoadingDocLinks] = useState(false);
  const [linkingDoc, setLinkingDoc] = useState(false);
  const [unlinkingDocId, setUnlinkingDocId] = useState<string | null>(null);
  const [desvinculando, setDesvinculando] = useState(false);
  const [linkForm, setLinkForm] = useState({
    documentId: "",
    role: "related",
  });

  type TeRow = {
    id: string;
    date: string;
    installationName: string;
    puestoName: string;
    amountClp: number;
    status: string;
    paidAt: string | null;
  };
  const [turnosExtra, setTurnosExtra] = useState<TeRow[]>([]);
  const [turnosExtraLoading, setTurnosExtraLoading] = useState(false);

  type DiaTrabajadoRow = {
    id: string;
    date: string;
    puestoId: string;
    slotNumber: number;
    attendanceStatus: string;
    installationName: string;
    puestoName: string;
    shiftStart: string;
    shiftEnd: string;
  };
  const [diasTrabajados, setDiasTrabajados] = useState<DiaTrabajadoRow[]>([]);
  const [diasTrabajadosSummary, setDiasTrabajadosSummary] = useState<Record<string, number>>({});
  const [diasTrabajadosLoading, setDiasTrabajadosLoading] = useState(false);

  const docsByType = useMemo(() => {
    const map = new Map<string, GuardiaDetail["documents"][number]>();
    for (const doc of guardia.documents) {
      if (!map.has(doc.type)) map.set(doc.type, doc);
    }
    return map;
  }, [guardia.documents]);

  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canManageDocs = hasOpsCapability(userRole, "guardias_documents");
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const rondaCode = guardia.currentInstallation?.marcacionCode ?? "";
  const rondaUrl = rondaCode ? `${baseUrl}/ronda/${rondaCode}` : "";

  function toDateInput(val: string | Date | undefined | null): string {
    if (!val) return "";
    const d = typeof val === "string" ? new Date(val) : val;
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }

  const openEditPersonal = () => {
    setEditPersonalForm({
      firstName: guardia.persona.firstName || "",
      lastName: guardia.persona.lastName || "",
      rut: guardia.persona.rut || "",
      email: guardia.persona.email || "",
      phoneMobile: guardia.persona.phoneMobile || "",
      sex: guardia.persona.sex || "",
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
          birthDate: editPersonalForm.birthDate || undefined,
          afp: editPersonalForm.afp || undefined,
          healthSystem: editPersonalForm.healthSystem || undefined,
          isapreName: editPersonalForm.healthSystem === "isapre" ? editPersonalForm.isapreName || undefined : undefined,
          isapreHasExtraPercent: editPersonalForm.healthSystem === "isapre" ? editPersonalForm.isapreHasExtraPercent : undefined,
          isapreExtraPercent: editPersonalForm.healthSystem === "isapre" && editPersonalForm.isapreHasExtraPercent ? editPersonalForm.isapreExtraPercent || undefined : undefined,
          hasMobilization: editPersonalForm.hasMobilization,
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
      // Update local state with returned data
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
          birthDate: editPersonalForm.birthDate || prev.persona.birthDate,
          afp: editPersonalForm.afp || prev.persona.afp,
          healthSystem: editPersonalForm.healthSystem || prev.persona.healthSystem,
          isapreName: editPersonalForm.isapreName || prev.persona.isapreName,
          isapreHasExtraPercent: editPersonalForm.isapreHasExtraPercent,
          isapreExtraPercent: editPersonalForm.isapreExtraPercent || prev.persona.isapreExtraPercent,
          hasMobilization: editPersonalForm.hasMobilization,
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
      setLinkForm((prev) => ({
        ...prev,
        documentId: payload.data?.available?.[0]?.id ?? "",
      }));
    } catch (error) {
      console.error(error);
      toast.error("No se pudieron cargar documentos vinculables");
    } finally {
      setLoadingDocLinks(false);
    }
  };

  useEffect(() => {
    void loadDocLinks();
    // guardia.id es estable para esta pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardia.id]);

  useEffect(() => {
    let cancelled = false;
    setTurnosExtraLoading(true);
    fetch(`/api/te?guardiaId=${encodeURIComponent(guardia.id)}`)
      .then((res) => res.json())
      .then((payload: { success?: boolean; data?: Array<{
        id: string;
        date: string;
        status: string;
        amountClp: number | string;
        paidAt?: string | null;
        installation?: { name: string };
        puesto?: { name: string };
      }> }) => {
        if (cancelled || !payload.success || !Array.isArray(payload.data)) return;
        setTurnosExtra(
          payload.data.map((t) => ({
            id: t.id,
            date: t.date,
            installationName: t.installation?.name ?? "",
            puestoName: t.puesto?.name ?? "",
            amountClp: Number(t.amountClp),
            status: t.status,
            paidAt: t.paidAt ?? null,
          }))
        );
      })
      .catch(() => {
        if (!cancelled) setTurnosExtra([]);
      })
      .finally(() => {
        if (!cancelled) setTurnosExtraLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guardia.id]);

  useEffect(() => {
    let cancelled = false;
    setDiasTrabajadosLoading(true);
    const to = new Date();
    const from = new Date(to);
    from.setFullYear(from.getFullYear() - 1);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);
    fetch(`/api/personas/guardias/${guardia.id}/dias-trabajados?from=${fromStr}&to=${toStr}`)
      .then((res) => res.json())
      .then((payload: { success?: boolean; data?: { items: DiaTrabajadoRow[]; summaryByMonth: Record<string, number> } }) => {
        if (cancelled || !payload.success || !payload.data) return;
        setDiasTrabajados(payload.data.items ?? []);
        setDiasTrabajadosSummary(payload.data.summaryByMonth ?? {});
      })
      .catch(() => {
        if (!cancelled) {
          setDiasTrabajados([]);
          setDiasTrabajadosSummary({});
        }
      })
      .finally(() => {
        if (!cancelled) setDiasTrabajadosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [guardia.id]);

  const handleUpload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/personas/guardias/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo subir el archivo");
      }
      setDocForm((prev) => ({ ...prev, fileUrl: payload.data.url }));
      toast.success("Archivo subido");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo subir archivo");
    } finally {
      setUploading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!docForm.fileUrl) {
      toast.error("Primero sube un archivo");
      return;
    }
    setCreatingDoc(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: docForm.type,
          status: docForm.status,
          fileUrl: docForm.fileUrl,
          issuedAt: docForm.issuedAt || null,
          expiresAt: docForm.expiresAt || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear documento");
      }
      setGuardia((prev) => ({ ...prev, documents: [payload.data, ...prev.documents] }));
      setDocForm({
        type: "certificado_antecedentes",
        status: "pendiente",
        issuedAt: "",
        expiresAt: "",
        fileUrl: "",
      });
      toast.success("Documento agregado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear documento");
    } finally {
      setCreatingDoc(false);
    }
  };

  const getDocEdit = (doc: GuardiaDetail["documents"][number]) => {
    return (
      docEdits[doc.id] || {
        status: doc.status,
        issuedAt: toDateInput(doc.issuedAt),
        expiresAt: toDateInput(doc.expiresAt),
      }
    );
  };

  const handleSaveDocument = async (doc: GuardiaDetail["documents"][number]) => {
    const edit = getDocEdit(doc);
    setSavingDocId(doc.id);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardia.id}/documents?documentId=${encodeURIComponent(doc.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: edit.status,
            issuedAt: edit.issuedAt || null,
            expiresAt: edit.expiresAt || null,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo actualizar documento");
      }
      setGuardia((prev) => ({
        ...prev,
        documents: prev.documents.map((it) => (it.id === doc.id ? payload.data : it)),
      }));
      toast.success("Documento actualizado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar documento");
    } finally {
      setSavingDocId(null);
    }
  };

  const handleDeleteDocument = async (doc: GuardiaDetail["documents"][number]) => {
    if (!window.confirm("¿Eliminar este documento?")) return;
    setDeletingDocId(doc.id);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardia.id}/documents?documentId=${encodeURIComponent(doc.id)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo eliminar documento");
      }
      setGuardia((prev) => ({
        ...prev,
        documents: prev.documents.filter((it) => it.id !== doc.id),
      }));
      toast.success("Documento eliminado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo eliminar documento");
    } finally {
      setDeletingDocId(null);
    }
  };

  const handleDesvincular = async () => {
    if (desvinculando) return;
    if (
      !window.confirm(
        "¿Desvincular a este guardia? Se registrará como desvinculado y ya no podrá ser asignado a puestos."
      )
    )
      return;
    setDesvinculando(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycleStatus: "desvinculado" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo desvincular");
      }
      setGuardia((prev) => ({
        ...prev,
        lifecycleStatus: "desvinculado",
        status: "desvinculado",
      }));
      toast.success("Guardia desvinculado");
      router.push("/personas/guardias");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo desvincular al guardia");
    } finally {
      setDesvinculando(false);
    }
  };

  const handleLinkDocument = async () => {
    if (!linkForm.documentId) {
      toast.error("Selecciona un documento");
      return;
    }
    setLinkingDoc(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}/doc-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: linkForm.documentId,
          role: linkForm.role,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo vincular documento");
      }
      await loadDocLinks();
      toast.success("Documento vinculado al guardia");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo vincular documento");
    } finally {
      setLinkingDoc(false);
    }
  };

  const handleUnlinkDocument = async (documentId: string) => {
    if (!window.confirm("¿Desvincular este documento del guardia?")) return;
    setUnlinkingDocId(documentId);
    try {
      const response = await fetch(
        `/api/personas/guardias/${guardia.id}/doc-links?documentId=${encodeURIComponent(documentId)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo desvincular documento");
      }
      await loadDocLinks();
      toast.success("Documento desvinculado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo desvincular documento");
    } finally {
      setUnlinkingDocId(null);
    }
  };

  const handleCreateBankAccount = async () => {
    if (!accountForm.bankCode || !accountForm.accountType || !accountForm.accountNumber) {
      toast.error("Banco, tipo y número de cuenta son obligatorios");
      return;
    }
    const holderName = guardia.persona.rut?.trim();
    if (!holderName) {
      toast.error("El guardia debe tener RUT para agregar cuenta bancaria");
      return;
    }
    setCreatingAccount(true);
    try {
      const bank = CHILE_BANKS.find((b) => b.code === accountForm.bankCode);
      const response = await fetch(`/api/personas/guardias/${guardia.id}/bank-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankCode: accountForm.bankCode,
          bankName: bank?.name ?? accountForm.bankCode,
          accountType: accountForm.accountType,
          accountNumber: accountForm.accountNumber,
          holderName,
          isDefault: accountForm.isDefault,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo crear cuenta bancaria");
      }
      setGuardia((prev) => ({
        ...prev,
        bankAccounts: accountForm.isDefault
          ? [payload.data, ...prev.bankAccounts.map((it) => ({ ...it, isDefault: false }))]
          : [payload.data, ...prev.bankAccounts],
      }));
      setAccountForm({
        bankCode: "",
        accountType: "",
        accountNumber: "",
        isDefault: false,
      });
      toast.success("Cuenta bancaria agregada");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo crear cuenta bancaria");
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleUpdateBankAccount = async () => {
    if (!existingAccount) return;
    if (!accountForm.bankCode || !accountForm.accountType || !accountForm.accountNumber) {
      toast.error("Banco, tipo y número de cuenta son obligatorios");
      return;
    }
    setCreatingAccount(true);
    try {
      const bank = CHILE_BANKS.find((b) => b.code === accountForm.bankCode);
      const response = await fetch(
        `/api/personas/guardias/${guardia.id}/bank-accounts?accountId=${existingAccount.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankCode: accountForm.bankCode,
            bankName: bank?.name ?? accountForm.bankCode,
            accountType: accountForm.accountType,
            accountNumber: accountForm.accountNumber,
          }),
        }
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo actualizar cuenta bancaria");
      }
      setGuardia((prev) => ({
        ...prev,
        bankAccounts: prev.bankAccounts.map((acc) =>
          acc.id === existingAccount.id ? { ...acc, ...payload.data } : acc
        ),
      }));
      toast.success("Cuenta bancaria actualizada");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo actualizar cuenta bancaria");
    } finally {
      setCreatingAccount(false);
    }
  };

  const availableTemplates = useMemo(
    () => GUARDIA_COMM_TEMPLATES.filter((tpl) => tpl.channel === commForm.channel),
    [commForm.channel]
  );

  const communicationHistory = useMemo(
    () => guardia.historyEvents.filter((event) => event.eventType === "communication_sent"),
    [guardia.historyEvents]
  );

  const expiringDocs = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    return guardia.documents.filter((doc) => {
      if (!doc.expiresAt) return false;
      const exp = new Date(doc.expiresAt);
      return exp <= in30;
    });
  }, [guardia.documents]);

  const handleSendCommunication = async () => {
    if (!commForm.templateId) {
      toast.error("Selecciona una plantilla");
      return;
    }
    setSendingComm(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: commForm.channel,
          templateId: commForm.templateId,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo enviar comunicación");
      }

      if (payload.data?.event) {
        setGuardia((prev) => ({
          ...prev,
          historyEvents: [payload.data.event, ...prev.historyEvents],
        }));
      }

      const waLink = payload.data?.waLink as string | undefined;
      if (commForm.channel === "whatsapp" && waLink) {
        window.open(waLink, "_blank", "noopener,noreferrer");
        toast.success("Se abrió WhatsApp con el mensaje");
      } else {
        toast.success("Comunicación registrada");
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo enviar comunicación");
    } finally {
      setSendingComm(false);
    }
  };

  const handleCreateComment = async () => {
    if (!commentText.trim()) {
      toast.error("Escribe un comentario");
      return;
    }
    setCommentSaving(true);
    try {
      const response = await fetch(`/api/personas/guardias/${guardia.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: commentText.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "No se pudo guardar comentario");
      }
      setGuardia((prev) => ({
        ...prev,
        comments: [payload.data, ...(prev.comments || [])],
      }));
      setCommentText("");
      toast.success("Comentario guardado");
    } catch (error) {
      console.error(error);
      toast.error("No se pudo guardar comentario");
    } finally {
      setCommentSaving(false);
    }
  };

  const mapUrl =
    guardia.persona.lat && guardia.persona.lng && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${guardia.persona.lat},${guardia.persona.lng}&zoom=15&size=160x120&scale=2&markers=color:red%7C${guardia.persona.lat},${guardia.persona.lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`
      : null;

  const guardiaTitle = `${guardia.persona.firstName} ${guardia.persona.lastName}`.trim() || "Guardia";
  const guardiaSubtitle = guardia.persona.rut ? `RUT ${guardia.persona.rut}` : undefined;
  const guardiaBadgeLabel = formatLifecycleBadgeLabel(guardia.lifecycleStatus);
  const guardiaBadgeVariant = lifecycleBadgeVariant(guardia.lifecycleStatus);

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
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nombre completo</Label>
              <Input value={`${guardia.persona.firstName} ${guardia.persona.lastName}`} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">RUT</Label>
              <Input value={guardia.persona.rut || "Sin RUT"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input value={guardia.persona.email || "Sin email"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Celular</Label>
              <Input value={guardia.persona.phoneMobile || "Sin celular"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fecha de nacimiento</Label>
              <Input value={guardia.persona.birthDate ? formatDateUTC(guardia.persona.birthDate) : "Sin fecha nacimiento"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sexo</Label>
              <Input
                value={
                  guardia.persona.sex
                    ? guardia.persona.sex.charAt(0).toUpperCase() + guardia.persona.sex.slice(1)
                    : "Sin sexo"
                }
                readOnly
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">AFP</Label>
              <Input value={guardia.persona.afp || "Sin AFP"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Sistema de salud</Label>
              <Input
                value={
                  guardia.persona.healthSystem === "isapre"
                    ? `ISAPRE${guardia.persona.isapreName ? ` · ${guardia.persona.isapreName}` : ""}`
                    : guardia.persona.healthSystem
                      ? guardia.persona.healthSystem.toUpperCase()
                      : "Sin sistema de salud"
                }
                readOnly
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cotización</Label>
              <Input
                value={
                  guardia.persona.healthSystem === "isapre" && guardia.persona.isapreHasExtraPercent
                    ? `Cotización ${guardia.persona.isapreExtraPercent || "N/D"}%`
                    : "Cotización legal"
                }
                readOnly
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Movilización</Label>
              <Input value={guardia.persona.hasMobilization ? "Con movilización" : "Sin movilización"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Turnos extra</Label>
              <Input value={guardia.availableExtraShifts ? "Disponible para TE" : "No disponible para TE"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Fecha de ingreso</Label>
              <Input value={guardia.hiredAt ? formatDateUTC(guardia.hiredAt) : "Sin fecha de ingreso"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Recibe anticipo</Label>
              <Input value={guardia.recibeAnticipo ? "Sí" : "No"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Monto anticipo</Label>
              <Input value={guardia.montoAnticipo ? `$ ${guardia.montoAnticipo.toLocaleString("es-CL")}` : "$ 0"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Instalación actual</Label>
              {guardia.currentInstallation ? (
                <Link href={`/crm/installations/${guardia.currentInstallation.id}`} className="block">
                  <Input
                    value={`${guardia.currentInstallation.name}${guardia.currentInstallation.account ? ` · ${guardia.currentInstallation.account.name}` : ""}`}
                    readOnly
                    className="h-9 cursor-pointer text-primary hover:underline"
                  />
                </Link>
              ) : (
                <Input value="Sin instalación asignada" readOnly className="h-9" />
              )}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_200px] md:items-start">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Dirección</Label>
              <Input value={guardia.persona.addressFormatted || "Sin dirección"} readOnly className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Ubicación</Label>
              {mapUrl ? (
                <a
                  href={`https://www.google.com/maps/@${guardia.persona.lat},${guardia.persona.lng},17z`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg overflow-hidden border border-border block h-[120px] w-full min-w-[160px]"
                  title="Abrir en Google Maps"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mapUrl} alt="Mapa guardia" className="h-full w-full object-cover" />
                </a>
              ) : (
                <div className="rounded-lg border border-dashed border-border h-[120px] w-full min-w-[160px] flex items-center justify-center text-xs text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-1" />
                  Sin mapa
                </div>
              )}
            </div>
          </div>
        </div>
      ),
    },
    /* asignacion */
    {
      key: "asignacion" as const,
      children: (
        <div className="space-y-4">
          {(() => {
            const current = asignaciones.find((a) => a.isActive);
            const history = asignaciones.filter((a) => !a.isActive);
            return (
              <>
                {current ? (
                  <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-emerald-300">
                          {current.puesto.name}
                          <span className="ml-2 text-xs text-emerald-300/60">Slot {current.slotNumber}</span>
                        </p>
                        <p className="text-xs text-emerald-200/80 mt-1">
                          {current.installation.name}
                          {current.installation.account && ` · ${current.installation.account.name}`}
                        </p>
                        <p className="text-xs text-emerald-200/60 mt-0.5">
                          {current.puesto.shiftStart} - {current.puesto.shiftEnd} · Desde {formatDateUTC(current.startDate)}
                        </p>
                      </div>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/30">
                        Activo
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 p-4 text-center">
                    <p className="text-sm text-amber-400">Sin asignación activa</p>
                    <p className="text-xs text-muted-foreground mt-1">Este guardia no está asignado a ningún puesto.</p>
                  </div>
                )}

                {history.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Historial de asignaciones</p>
                    <div className="space-y-1.5">
                      {history.map((h) => (
                        <div key={h.id} className="rounded-md border border-border/60 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{h.puesto.name}</span>
                              <span className="text-muted-foreground"> · {h.installation.name}</span>
                              {h.installation.account && (
                                <span className="text-muted-foreground"> · {h.installation.account.name}</span>
                              )}
                            </div>
                          </div>
                          <p className="text-muted-foreground mt-0.5">
                            {formatDateUTC(h.startDate)}
                            {h.endDate && ` → ${formatDateUTC(h.endDate)}`}
                            {h.reason && ` · ${h.reason}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ),
    },
    /* marcacion */
    {
      key: "marcacion" as const,
      label: "Marcación de asistencia",
      children: (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm font-medium">PIN de marcación</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {guardia.marcacionPin
                  ? "PIN configurado — el guardia puede marcar asistencia"
                  : "Sin PIN — el guardia no puede marcar asistencia"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {guardia.marcacionPin && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                  Activo
                </span>
              )}
              {!guardia.marcacionPin && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                  Sin PIN
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <p className="text-xs text-muted-foreground">PIN activo</p>
            {guardia.marcacionPinVisible ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-2xl font-mono font-semibold tracking-[0.2em]">{guardia.marcacionPinVisible}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    void navigator.clipboard.writeText(guardia.marcacionPinVisible || "");
                    toast.success("PIN copiado");
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copiar PIN
                </Button>
              </div>
            ) : guardia.marcacionPin ? (
              <p className="mt-2 text-xs text-amber-600">
                Este guardia tiene PIN activo, pero no está visible en ficha. Usa "Resetear PIN" para dejarlo visible.
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                Aún no tiene PIN activo.
              </p>
            )}
          </div>

          {canManageGuardias && (
            <MarcacionPinSection
              guardiaId={guardia.id}
              hasPin={!!guardia.marcacionPin}
              onPinUpdated={(pin) => {
                setGuardia((prev) => ({
                  ...prev,
                  marcacionPin: "[configurado]",
                  marcacionPinVisible: pin,
                }));
              }}
            />
          )}
        </div>
      ),
    },
    /* rondas */
    {
      key: "rondas" as const,
      label: "Marcación de rondas",
      children: (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-sm font-medium">Acceso móvil de rondas</p>
            {!guardia.currentInstallation ? (
              <p className="text-xs text-muted-foreground">
                El guardia no tiene instalación actual asignada.
              </p>
            ) : !rondaCode ? (
              <p className="text-xs text-muted-foreground">
                La instalación {guardia.currentInstallation.name} no tiene código generado. Actívalo en{" "}
                <Link href={`/crm/installations/${guardia.currentInstallation.id}`} className="text-primary underline">
                  Instalación &gt; Marcación de rondas
                </Link>
                .
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Instalación: <span className="font-medium text-foreground">{guardia.currentInstallation.name}</span>
                </p>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs font-mono truncate">{rondaUrl}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        void navigator.clipboard.writeText(rondaUrl);
                        toast.success("Link de ronda copiado");
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copiar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => window.open(rondaUrl, "_blank", "noopener,noreferrer")}
                    >
                      Abrir
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
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
        />
      ),
    },
    /* documentos */
    {
      key: "documentos" as const,
      label: "Ficha de documentos",
      children: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground -mt-1">
            Sube certificado de antecedentes, OS-10, cédula de identidad, currículum, contratos y anexos.
          </p>
          {expiringDocs.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              Hay {expiringDocs.length} documento(s) vencido(s) o por vencer en los próximos 30 días.
            </div>
          ) : null}
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
            <p className="text-sm font-medium">Subir nuevo documento</p>
            <div className="grid gap-3 md:grid-cols-12">
              <div className="md:col-span-3">
                <label className="text-xs text-muted-foreground block mb-1">Tipo de documento</label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={docForm.type}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, type: e.target.value }))}
                >
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {DOC_LABEL[type] || type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Estado</label>
                <select
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={docForm.status}
                  onChange={(e) => setDocForm((prev) => ({ ...prev, status: e.target.value }))}
                >
                  {DOCUMENT_STATUS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Emisión (opc.)</label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={issuedAtRef}
                    type="date"
                    value={docForm.issuedAt}
                    onChange={(e) => setDocForm((prev) => ({ ...prev, issuedAt: e.target.value }))}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => issuedAtRef.current?.showPicker?.()}
                    aria-label="Abrir calendario de emisión"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground block mb-1">Vencimiento (opc.)</label>
                <div className="flex items-center gap-2">
                  <Input
                    ref={expiresAtRef}
                    type="date"
                    value={docForm.expiresAt}
                    onChange={(e) => setDocForm((prev) => ({ ...prev, expiresAt: e.target.value }))}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => expiresAtRef.current?.showPicker?.()}
                    aria-label="Abrir calendario de vencimiento"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="md:col-span-3 flex flex-col justify-end gap-2">
                <label className="text-xs text-muted-foreground">Archivo (PDF, imagen)</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,image/*"
                    className="hidden"
                    onChange={(e) => void handleUpload(e.target.files?.[0])}
                    disabled={uploading || !canManageDocs}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={uploading || !canManageDocs}
                    onClick={() => fileInputRef.current?.click()}
                    title="Seleccionar archivo"
                  >
                    <FilePlus2 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateDocument}
                    disabled={creatingDoc || !docForm.fileUrl || uploading || !canManageDocs}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {creatingDoc ? "Guardando..." : "Cargar"}
                  </Button>
                </div>
                {docForm.fileUrl && (
                  <span className="text-xs text-green-600 dark:text-green-400">Archivo listo · haz clic en Cargar</span>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Documentos cargados</p>
            {guardia.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay documentos. Usa el bloque de arriba para subir el primero.</p>
            ) : (
              guardia.documents.map((doc) => {
                const edit = getDocEdit(doc);
                return (
                  <div key={doc.id} className="rounded-md border border-border p-3 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{DOC_LABEL[doc.type] || doc.type}</p>
                        <p className="text-xs text-muted-foreground">
                          Estado: {doc.status}
                          {doc.expiresAt ? ` · Vence: ${new Date(doc.expiresAt).toLocaleDateString("es-CL")}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href={doc.fileUrl || "#"} target="_blank" rel="noreferrer">
                            Ver archivo
                          </a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleDeleteDocument(doc)}
                          disabled={deletingDocId === doc.id || !canManageDocs}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <select
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                        value={edit.status}
                        disabled={!canManageDocs}
                        onChange={(e) =>
                          setDocEdits((prev) => ({
                            ...prev,
                            [doc.id]: { ...edit, status: e.target.value },
                          }))
                        }
                      >
                        {DOCUMENT_STATUS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="date"
                        value={edit.issuedAt}
                        disabled={!canManageDocs}
                        onChange={(e) =>
                          setDocEdits((prev) => ({
                            ...prev,
                            [doc.id]: { ...edit, issuedAt: e.target.value },
                          }))
                        }
                      />
                      <Input
                        type="date"
                        value={edit.expiresAt}
                        disabled={!canManageDocs}
                        onChange={(e) =>
                          setDocEdits((prev) => ({
                            ...prev,
                            [doc.id]: { ...edit, expiresAt: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void handleSaveDocument(doc)}
                        disabled={savingDocId === doc.id || !canManageDocs}
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {savingDocId === doc.id ? "Guardando..." : "Guardar cambios"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {guardia.documents.length} documento(s) · tipos: antecedentes, OS-10, cédula, currículum, contrato, anexo.
          </p>
        </div>
      ),
    },
    /* docs-vinculados */
    {
      key: "docs-vinculados" as const,
      label: "Documentos vinculados (Docs)",
      children: (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground -mt-1 space-y-1">
            <p>
              Aquí puedes vincular documentos que ya existen en el módulo <strong>Documentos</strong> (OPAI) a esta ficha de guardia. Sirve para mantener trazabilidad: por ejemplo, asociar el contrato o un anexo generado en Docs con este guardia, y ver desde su ficha qué documentos formales tiene vinculados.
            </p>
            <p className="text-xs">
              El <strong>tipo de vínculo</strong> indica la relación: <em>Principal</em> (documento central, ej. contrato vigente), <em>Relacionado</em> (anexos, certificados complementarios) o <em>Copia</em> (duplicado o respaldo).
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={linkForm.documentId}
              disabled={loadingDocLinks || !canManageDocs}
              onChange={(e) => setLinkForm((prev) => ({ ...prev, documentId: e.target.value }))}
            >
              <option value="">Selecciona documento disponible</option>
              {availableDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title} · {doc.status}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={linkForm.role}
              disabled={!canManageDocs}
              onChange={(e) => setLinkForm((prev) => ({ ...prev, role: e.target.value }))}
              title="Tipo de vínculo del documento con esta ficha"
            >
              <option value="primary">Principal</option>
              <option value="related">Relacionado</option>
              <option value="copy">Copia</option>
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleLinkDocument()}
              disabled={!canManageDocs || linkingDoc || !linkForm.documentId}
            >
              {linkingDoc ? "Vinculando..." : "Vincular"}
            </Button>
          </div>

          {linkedDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin documentos vinculados.</p>
          ) : (
            <div className="space-y-2">
              {linkedDocs.map((item) => (
                <div key={item.id} className="rounded-md border border-border p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.document.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.document.category} · {item.document.status}
                      {item.role === "primary" ? " · Principal" : item.role === "related" ? " · Relacionado" : " · Copia"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/opai/documentos/${item.document.id}`}>Abrir</Link>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleUnlinkDocument(item.document.id)}
                      disabled={!canManageDocs || unlinkingDocId === item.document.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Quitar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    /* cuentas */
    {
      key: "cuentas" as const,
      label: "Cuenta bancaria",
      children: (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Un solo banco por trabajador. {existingAccount ? "Edite los datos y guarde los cambios." : "Complete para registrar la cuenta."}
          </p>
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={accountForm.bankCode}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, bankCode: e.target.value }))}
              disabled={!canManageGuardias}
            >
              <option value="">Banco chileno</option>
              {CHILE_BANKS.map((bank) => (
                <option key={bank.code} value={bank.code}>
                  {bank.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={accountForm.accountType}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, accountType: e.target.value }))}
              disabled={!canManageGuardias}
            >
              <option value="">Tipo de cuenta</option>
              {BANK_ACCOUNT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ACCOUNT_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            <Input
              placeholder="Número de cuenta"
              value={accountForm.accountNumber}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
              disabled={!canManageGuardias}
            />
            <Button
              onClick={existingAccount ? handleUpdateBankAccount : handleCreateBankAccount}
              disabled={creatingAccount || !canManageGuardias}
            >
              {creatingAccount ? "..." : existingAccount ? "Guardar" : "Agregar"}
            </Button>
          </div>
        </div>
      ),
    },
    /* communication (comunicaciones) */
    {
      key: "communication" as const,
      label: "Comunicación con guardia",
      children: (
        <div className="space-y-4">
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Envío con plantillas predefinidas por canal. Los envíos quedan registrados en la ficha.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={commForm.channel}
                onChange={(e) => {
                  const nextChannel = e.target.value;
                  const firstTemplate = GUARDIA_COMM_TEMPLATES.find((tpl) => tpl.channel === nextChannel)?.id ?? "";
                  setCommForm({ channel: nextChannel, templateId: firstTemplate });
                }}
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>

              <select
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                value={commForm.templateId}
                onChange={(e) => setCommForm((prev) => ({ ...prev, templateId: e.target.value }))}
              >
                {availableTemplates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>

              <Button onClick={handleSendCommunication} disabled={sendingComm || !commForm.templateId}>
                <Send className="h-4 w-4 mr-1" />
                {sendingComm ? "Enviando..." : "Enviar comunicación"}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Email: {guardia.persona.email || "No registrado"}</span>
              <span>·</span>
              <span>Celular: {guardia.persona.phoneMobile ? `+56 ${guardia.persona.phoneMobile}` : "No registrado"}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(`${window.location.origin}/personas/guardias/${guardia.id}`);
                  toast.success("Link copiado");
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar link autogestión
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Envíos registrados</p>
            {communicationHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no hay envíos.</p>
            ) : (
              communicationHistory.map((event) => {
                const payload = (event.newValue || {}) as Record<string, unknown>;
                const channel = String(payload.channel || "");
                const status = String(payload.status || "");
                const templateName = String(payload.templateName || payload.templateId || "");
                return (
                  <div key={event.id} className="rounded-md border border-border p-3 flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm">
                      {channel === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      <span className="font-medium">{templateName || "Comunicación"}</span>
                      <span className="text-xs text-muted-foreground">· {status || "registrado"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString("es-CL")}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ),
    },
    /* comentarios */
    {
      key: "comentarios" as const,
      label: "Comentarios internos",
      children: (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Escribe una nota o comentario sobre este guardia"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <Button
              type="button"
              onClick={() => void handleCreateComment()}
              disabled={commentSaving || !canManageGuardias}
            >
              {commentSaving ? "Guardando..." : "Comentar"}
            </Button>
          </div>
          {guardia.comments && guardia.comments.length > 0 ? (
            <div className="space-y-2">
              {guardia.comments.map((comment) => (
                <div key={comment.id} className="rounded-md border border-border p-3">
                  <p className="text-sm">{comment.comment}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(comment.createdAt).toLocaleString("es-CL")}
                    {comment.createdByName ? ` · ${comment.createdByName}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin comentarios.</p>
          )}
        </div>
      ),
    },
    /* dias-trabajados */
    {
      key: "dias-trabajados" as const,
      children: (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground -mt-1">
            Días en que este guardia asistió o cubrió como reemplazo (últimos 12 meses). Base para liquidación y portal del guardia.
          </p>
          {diasTrabajadosLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando días trabajados…
            </div>
          ) : (
            <>
              {Object.keys(diasTrabajadosSummary).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Resumen por mes</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(diasTrabajadosSummary)
                      .sort(([a], [b]) => b.localeCompare(a))
                      .slice(0, 12)
                      .map(([monthKey, count]) => {
                        const [y, m] = monthKey.split("-");
                        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
                        const label = `${monthNames[parseInt(m, 10) - 1]} ${y}`;
                        return (
                          <div
                            key={monthKey}
                            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-sm"
                          >
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-semibold text-foreground">{count}</span>
                            <span className="text-muted-foreground text-xs">días</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              {diasTrabajados.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin días trabajados registrados en el período.</p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="text-left p-2 font-medium">Fecha</th>
                        <th className="text-left p-2 font-medium">Instalación</th>
                        <th className="text-left p-2 font-medium">Puesto</th>
                        <th className="text-center p-2 font-medium">Slot</th>
                        <th className="text-left p-2 font-medium">Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diasTrabajados.map((d) => (
                        <tr key={d.id} className="border-b border-border/60 last:border-0">
                          <td className="p-2">{formatDateUTC(d.date)}</td>
                          <td className="p-2">{d.installationName || "—"}</td>
                          <td className="p-2">{d.puestoName || "—"}</td>
                          <td className="p-2 text-center">S{d.slotNumber}</td>
                          <td className="p-2">
                            {d.attendanceStatus === "asistio" ? "Asistió" : d.attendanceStatus === "reemplazo" ? "Reemplazo" : d.attendanceStatus}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    /* turnos-extra */
    {
      key: "turnos-extra" as const,
      children: (
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Historial de turnos extra (reemplazos y cubrimientos) de este guardia.
          </p>
          {turnosExtraLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando turnos extra…
            </div>
          ) : turnosExtra.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin turnos extra registrados.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left p-2 font-medium">Fecha</th>
                    <th className="text-left p-2 font-medium">Instalación</th>
                    <th className="text-left p-2 font-medium">Puesto</th>
                    <th className="text-right p-2 font-medium">Monto</th>
                    <th className="text-left p-2 font-medium">Estado</th>
                    <th className="text-left p-2 font-medium">Fecha de pago</th>
                  </tr>
                </thead>
                <tbody>
                  {turnosExtra.map((te) => (
                    <tr key={te.id} className="border-b border-border/60 last:border-0">
                      <td className="p-2">{formatDateUTC(te.date)}</td>
                      <td className="p-2">{te.installationName || "—"}</td>
                      <td className="p-2">{te.puestoName || "—"}</td>
                      <td className="p-2 text-right">${te.amountClp.toLocaleString("es-CL")}</td>
                      <td className="p-2">
                        {te.status === "pending"
                          ? "Pendiente"
                          : te.status === "approved"
                            ? "Aprobado"
                            : te.status === "paid"
                              ? "Pagado"
                              : te.status === "rejected"
                                ? "Rechazado"
                                : te.status}
                      </td>
                      <td className="p-2">{te.paidAt ? formatDateUTC(te.paidAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
        <div className="space-y-2">
          {guardia.historyEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos registrados.</p>
          ) : (
            guardia.historyEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-border p-3">
                <p className="text-sm font-medium">{EVENT_TYPE_LABEL[event.eventType] || event.eventType}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString("es-CL")}
                  {event.createdByName ? ` · por ${event.createdByName}` : ""}
                  {event.reason ? ` · ${event.reason}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      ),
    },
  ];

  const recordActions: RecordAction[] = [];
  const puedeDesvincular =
    canManageGuardias &&
    guardia.lifecycleStatus !== "desvinculado" &&
    !guardia.isBlacklisted;

  if (puedeDesvincular) {
    recordActions.push({
      label: "Desvincular guardia",
      icon: Trash2,
      variant: "destructive",
      onClick: () => void handleDesvincular(),
    });
  }

  // Siempre mostrar el menú de tres puntos (al menos con "Ir a lista")
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
        badge={{ label: guardiaBadgeLabel, variant: guardiaBadgeVariant }}
        backHref="/personas/guardias"
        backLabel="Guardias"
        actions={actionsToShow}
        extra={
          guardia.isBlacklisted ? (
            <span className="text-[11px] rounded-full bg-red-500/15 px-2 py-1 text-red-400">
              Lista negra
            </span>
          ) : null
        }
        sections={sections}
      />

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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editPersonalForm.sex}
                onChange={(e) => setEditPersonalForm((p) => ({ ...p, sex: e.target.value }))}
              >
                <option value="">Sin especificar</option>
                <option value="masculino">Masculino</option>
                <option value="femenino">Femenino</option>
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
            <div className="space-y-1.5">
              <Label className="text-xs">AFP</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                <div className="grid gap-2 grid-cols-3 mt-1">
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

// ─────────────────────────────────────────────
// Sub-componente: Gestión de PIN de marcación
// ─────────────────────────────────────────────

function MarcacionPinSection({
  guardiaId,
  hasPin,
  onPinUpdated,
}: {
  guardiaId: string;
  hasPin: boolean;
  onPinUpdated: (pin: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [pinConfigured, setPinConfigured] = useState(hasPin);

  const handleGeneratePin = async () => {
    setLoading(true);
    setGeneratedPin(null);
    try {
      const res = await fetch("/api/ops/marcacion/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardiaId }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Error al generar PIN");
        return;
      }
      setGeneratedPin(data.data.pin);
      setPinConfigured(true);
      onPinUpdated(data.data.pin);
      toast.success(pinConfigured ? "PIN reseteado exitosamente" : "PIN generado exitosamente");
    } catch {
      toast.error("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPin = () => {
    if (generatedPin) {
      navigator.clipboard.writeText(generatedPin);
      toast.success("PIN copiado al portapapeles");
    }
  };

  return (
    <div className="space-y-3">
      {generatedPin && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-700/50 rounded-lg dark:bg-emerald-900/20 dark:border-emerald-600/50">
          <p className="text-sm font-medium text-emerald-200 mb-2">
            PIN generado (queda registrado en el sistema para marcación):
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-3xl font-mono font-bold tracking-[0.3em] text-emerald-100">
              {generatedPin}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="bg-emerald-700 hover:bg-emerald-600 text-white border-0"
              onClick={handleCopyPin}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copiar
            </Button>
          </div>
          <p className="text-xs text-emerald-300/90 mt-2">
            PIN actualizado. También queda visible en la ficha para consulta operativa.
          </p>
        </div>
      )}

      <Button
        size="sm"
        variant={pinConfigured ? "outline" : "default"}
        onClick={handleGeneratePin}
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        <KeyRound className="mr-1.5 h-4 w-4" />
        {pinConfigured ? "Resetear PIN" : "Generar PIN"}
      </Button>
    </div>
  );
}
