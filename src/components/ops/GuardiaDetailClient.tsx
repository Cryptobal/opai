"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  FilePlus2,
  History,
  Landmark,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  Link2,
  MapPin,
  Pencil,
  Save,
  Send,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/opai";
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

/** Format a date-only value using UTC to avoid timezone shift */
function formatDateUTC(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

const SECTIONS = [
  { id: "asignacion", label: "Asignación", icon: MapPin },
  { id: "datos", label: "Datos personales", icon: User },
  { id: "documentos", label: "Ficha de documentos", icon: FilePlus2 },
  { id: "docs-vinculados", label: "Docs vinculados", icon: Link2 },
  { id: "cuentas", label: "Cuentas bancarias", icon: Landmark },
  { id: "comunicaciones", label: "Comunicaciones", icon: Mail },
  { id: "comentarios", label: "Comentarios", icon: MessageSquare },
  { id: "historial", label: "Historial", icon: History },
] as const;

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
  availableExtraShifts?: boolean;
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

export function GuardiaDetailClient({ initialGuardia, asignaciones = [], userRole }: GuardiaDetailClientProps) {
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
  const [accountForm, setAccountForm] = useState({
    bankCode: "",
    accountType: "",
    accountNumber: "",
    holderName: "",
    isDefault: true,
  });
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
  const [linkForm, setLinkForm] = useState({
    documentId: "",
    role: "related",
  });

  const docsByType = useMemo(() => {
    const map = new Map<string, GuardiaDetail["documents"][number]>();
    for (const doc of guardia.documents) {
      if (!map.has(doc.type)) map.set(doc.type, doc);
    }
    return map;
  }, [guardia.documents]);

  const canManageGuardias = hasOpsCapability(userRole, "guardias_manage");
  const canManageDocs = hasOpsCapability(userRole, "guardias_documents");

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
    });
    setEditPersonalOpen(true);
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
    if (!accountForm.bankCode || !accountForm.accountType || !accountForm.accountNumber || !accountForm.holderName) {
      toast.error("Banco, tipo, número y titular son obligatorios");
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
          holderName: accountForm.holderName,
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
        holderName: "",
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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href="/personas/guardias">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver a guardias
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <StatusBadge status={guardia.lifecycleStatus} />
          {guardia.isBlacklisted ? (
            <span className="text-[11px] rounded-full bg-red-500/15 px-2 py-1 text-red-400">
              Lista negra
            </span>
          ) : null}
        </div>
      </div>

      {/* Navegación rápida: donde está la ficha de documentos */}
      <nav className="flex flex-wrap gap-2 rounded-lg border border-border bg-muted/30 p-3">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => scrollTo(id)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Button>
        ))}
      </nav>

      {/* ── Asignación actual + historial ── */}
      <Card id="asignacion">
        <CardHeader>
          <CardTitle>Asignación actual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card id="datos">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Datos personales</CardTitle>
          {canManageGuardias && (
            <Button size="sm" variant="outline" onClick={openEditPersonal}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input value={`${guardia.persona.firstName} ${guardia.persona.lastName}`} readOnly />
          <Input value={guardia.persona.rut || "Sin RUT"} readOnly />
          <Input value={guardia.persona.email || "Sin email"} readOnly />
          <Input value={guardia.persona.phoneMobile || "Sin celular"} readOnly />
          <Input value={guardia.persona.birthDate ? toDateInput(guardia.persona.birthDate) : "Sin fecha nacimiento"} readOnly />
          <Input
            value={
              guardia.persona.sex
                ? guardia.persona.sex.charAt(0).toUpperCase() + guardia.persona.sex.slice(1)
                : "Sin sexo"
            }
            readOnly
          />
          <Input value={guardia.persona.afp || "Sin AFP"} readOnly />
          <Input
            value={
              guardia.persona.healthSystem === "isapre"
                ? `ISAPRE${guardia.persona.isapreName ? ` · ${guardia.persona.isapreName}` : ""}`
                : guardia.persona.healthSystem
                  ? guardia.persona.healthSystem.toUpperCase()
                  : "Sin sistema de salud"
            }
            readOnly
          />
          <Input
            value={
              guardia.persona.healthSystem === "isapre" && guardia.persona.isapreHasExtraPercent
                ? `Cotización ${guardia.persona.isapreExtraPercent || "N/D"}%`
                : "Cotización legal"
            }
            readOnly
          />
          <Input value={guardia.persona.hasMobilization ? "Con movilización" : "Sin movilización"} readOnly />
          <Input value={guardia.availableExtraShifts ? "Disponible para TE" : "No disponible para TE"} readOnly />
          <Input className="md:col-span-2" value={guardia.persona.addressFormatted || "Sin dirección"} readOnly />
          {mapUrl ? (
            <a
              href={`https://www.google.com/maps/@${guardia.persona.lat},${guardia.persona.lng},17z`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg overflow-hidden border border-border h-[120px] w-[160px]"
              title="Abrir en Google Maps"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mapUrl} alt="Mapa guardia" className="h-full w-full object-cover" />
            </a>
          ) : (
            <div className="rounded-lg border border-dashed border-border h-[120px] w-[160px] flex items-center justify-center text-xs text-muted-foreground">
              <MapPin className="h-4 w-4 mr-1" />
              Sin mapa
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="documentos">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FilePlus2 className="h-4 w-4" />
            Ficha de documentos
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Sube certificado de antecedentes, OS-10, cédula de identidad, currículum, contratos y anexos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card id="docs-vinculados">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Documentos vinculados (Docs)
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Vincula contratos/anexos del módulo Docs a esta ficha de guardia para mantener trazabilidad.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
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
            >
              <option value="primary">primary</option>
              <option value="related">related</option>
              <option value="copy">copy</option>
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
                      {item.document.category} · {item.document.status} · rol {item.role}
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
        </CardContent>
      </Card>

      <Card id="cuentas">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" />
            Cuentas bancarias
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={accountForm.bankCode}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, bankCode: e.target.value }))}
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
            />
            <Input
              placeholder="Titular"
              value={accountForm.holderName}
              onChange={(e) => setAccountForm((prev) => ({ ...prev, holderName: e.target.value }))}
            />
            <Button onClick={handleCreateBankAccount} disabled={creatingAccount || !canManageGuardias}>
              {creatingAccount ? "..." : "Agregar"}
            </Button>
          </div>

          <div className="space-y-2">
            {guardia.bankAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin cuentas bancarias.</p>
            ) : (
              guardia.bankAccounts.map((acc) => (
                <div key={acc.id} className="rounded-md border border-border p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{acc.bankName}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_TYPE_LABEL[acc.accountType] || acc.accountType} · {acc.accountNumber}
                    </p>
                  </div>
                  {acc.isDefault ? (
                    <span className="text-[11px] rounded-full bg-primary/15 px-2 py-1 text-primary">Por defecto</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card id="comunicaciones">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Comunicación con guardia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card id="comentarios">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comentarios internos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      <Card id="historial">
        <CardHeader>
          <CardTitle>Historial del guardia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
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
        </CardContent>
      </Card>

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
    </div>
  );
}

