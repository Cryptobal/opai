/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { getQuoteStatus } from "@/lib/quoteStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EmptyState } from "@/components/opai/EmptyState";
import { EmailHistoryList, type EmailMessage } from "./EmailHistoryList";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { AssociatedRecordsPanel, type AssociatedSection } from "@/components/ui/AssociatedRecordsPanel";
import { EntityDetailLayout, useEntityTabs, type EntityTab, type EntityHeaderAction } from "./EntityDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
import { CRM_MODULES } from "./CrmModuleIcons";
import {
  Mail,
  Phone,
  Briefcase,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  ChevronRight,
  Info,
  Building2,
  MapPin,
  DollarSign,
  History,
  XCircle,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FileAttachments } from "./FileAttachments";
import { CreateDealModal } from "./CreateDealModal";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";
import { CrmActivityTimeline } from "./CrmActivityTimeline";
import { StartChatButton } from "@/components/chat/StartChatButton";
import { SendPresentationDialog } from "./SendPresentationDialog";

/** Convierte Tiptap JSON a HTML para email */
function tiptapToEmailHtml(doc: any): string {
  if (!doc || !doc.content) return "";
  const renderNode = (node: any): string => {
    if (!node) return "";
    switch (node.type) {
      case "doc": return (node.content || []).map(renderNode).join("");
      case "paragraph": { const inner = (node.content || []).map(renderNode).join(""); return inner ? `<p style="margin:0 0 8px;">${inner}</p>` : `<p style="margin:0 0 8px;">&nbsp;</p>`; }
      case "heading": { const lvl = node.attrs?.level || 2; return `<h${lvl} style="margin:0 0 8px;">${(node.content || []).map(renderNode).join("")}</h${lvl}>`; }
      case "bulletList": return `<ul style="margin:0 0 8px;padding-left:24px;">${(node.content || []).map(renderNode).join("")}</ul>`;
      case "orderedList": return `<ol style="margin:0 0 8px;padding-left:24px;">${(node.content || []).map(renderNode).join("")}</ol>`;
      case "listItem": return `<li style="margin:0 0 4px;">${(node.content || []).map(renderNode).join("")}</li>`;
      case "text": {
        let text = (node.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        for (const mark of node.marks || []) {
          switch (mark.type) {
            case "bold": text = `<strong>${text}</strong>`; break;
            case "italic": text = `<em>${text}</em>`; break;
            case "underline": text = `<u>${text}</u>`; break;
            case "link": text = `<a href="${mark.attrs?.href || "#"}" style="color:#0059A3;">${text}</a>`; break;
          }
        }
        return text;
      }
      case "hardBreak": return "<br/>";
      default: return (node.content || []).map(renderNode).join("");
    }
  };
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#333;line-height:1.6;">${renderNode(doc)}</div>`;
}

function buildReplySubject(subject?: string | null): string {
  const normalized = (subject || "").trim();
  if (!normalized) return "Re: Sin asunto";
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

type DealRow = {
  id: string;
  title: string;
  amount: string;
  status: string;
  stage?: { id: string; name: string } | null;
};

type ContactDetail = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
  portalEnabled?: boolean;
  portalPinVisible?: string | null;
  accountId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  account?: {
    id: string;
    name: string;
    type?: string;
    industry?: string | null;
  } | null;
};

type PipelineStageOption = {
  id: string;
  name: string;
  isClosedWon?: boolean;
  isClosedLost?: boolean;
};

type InstallationRow = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  commune?: string | null;
  status?: "prospect" | "active" | "inactive";
};

type QuoteRow = {
  id: string;
  code: string;
  name?: string | null;
  status: string;
  totalPositions: number;
  totalGuards: number;
  updatedAt: string;
};

type DocTemplateMail = { id: string; name: string; content: any };
type DocTemplateWhatsApp = { id: string; name: string; content: any };
type ActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
};

export function CrmContactDetailClient({
  contact: initialContact,
  deals,
  installations = [],
  quotes = [],
  pipelineStages,
  gmailConnected = false,
  docTemplatesMail = [],
  docTemplatesWhatsApp = [],
  initialEmailCount = 0,
  activityEvents = [],
  currentUserId = "",
  companyPresentations: initialPresentations = [],
}: {
  contact: ContactDetail;
  deals: DealRow[];
  installations?: InstallationRow[];
  quotes?: QuoteRow[];
  pipelineStages: PipelineStageOption[];
  gmailConnected?: boolean;
  docTemplatesMail?: DocTemplateMail[];
  docTemplatesWhatsApp?: DocTemplateWhatsApp[];
  initialEmailCount?: number;
  activityEvents?: ActivityEvent[];
  currentUserId?: string;
  companyPresentations?: Array<{ id: string; status: string }>;
}) {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);
  const [contactDeals, setContactDeals] = useState(deals);
  const [presentations, setPresentations] = useState(initialPresentations);
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");

  // ── Edit state ──
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email || "",
    phone: contact.phone || "",
    roleTitle: contact.roleTitle || "",
    isPrimary: contact.isPrimary || false,
    accountId: contact.accountId ?? contact.account?.id ?? "",
  });
  const [accountOptions, setAccountOptions] = useState<Array<{ id: string; name: string }>>([]);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);

  // ── Email compose state ──
  const [emailOpen, setEmailOpen] = useState(false);
  const [dealCreateOpen, setDealCreateOpen] = useState(false);
  const [quoteCreateOpen, setQuoteCreateOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailTiptapContent, setEmailTiptapContent] = useState<any>(null);
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null);
  const [emailCount, setEmailCount] = useState(initialEmailCount);

  useEffect(() => {
    fetch("/api/crm/signatures?mine=true")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data?.length > 0) {
          const sig = data.data.find((s: any) => s.isDefault) || data.data[0];
          if (sig?.htmlContent) setSignatureHtml(sig.htmlContent);
        }
      })
      .catch(() => { });
  }, []);

  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectCn = "flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  // ── Handlers ──
  const openEdit = () => {
    setEditForm({
      firstName: contact.firstName, lastName: contact.lastName,
      email: contact.email || "", phone: contact.phone || "",
      roleTitle: contact.roleTitle || "", isPrimary: contact.isPrimary || false,
      accountId: contact.accountId ?? contact.account?.id ?? "",
    });
    if (accountOptions.length === 0) {
      fetch("/api/crm/accounts?limit=500")
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) {
            setAccountOptions(d.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
          }
        })
        .catch(() => {});
    }
    setEditOpen(true);
  };

  const deleteContact = async () => {
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Contacto eliminado");
      router.push("/crm/contacts");
    } catch { toast.error("No se pudo eliminar"); }
  };

  const hasActivePresentation = presentations.some(p => ['sent', 'viewed'].includes(p.status));

  const handleDeactivatePresentation = async () => {
    if (!confirm('¿Desactivar la presentación de empresa para este contacto?')) return;
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}/deactivate-presentation`, { method: 'POST' });
      if (!res.ok) throw new Error();
      setPresentations([]);
      toast.success('Presentación desactivada');
    } catch {
      toast.error('No se pudo desactivar la presentación');
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      if (editForm.accountId !== (contact.accountId ?? contact.account?.id)) {
        toast.success("Contacto actualizado");
        setEditOpen(false);
        router.refresh();
      } else {
        setContact((prev) => ({ ...prev, ...editForm }));
        setEditOpen(false);
        toast.success("Contacto actualizado");
      }
    } catch { toast.error("No se pudo actualizar"); }
    finally { setSaving(false); }
  };

  const applyPlaceholders = (value: string) => {
    const replacements: Record<string, string> = {
      "{cliente}": contact.account?.name || "",
      "{contacto}": fullName,
      "{correo}": contact.email || "",
    };
    return Object.entries(replacements).reduce((acc, [key, val]) => acc.split(key).join(val), value);
  };

  const selectTemplate = (value: string) => {
    setSelectedTemplateId(value);
    if (!value) return;

    if (value.startsWith("doc:")) {
      const id = value.slice(4);
      const tpl = docTemplatesMail.find((t) => t.id === id);
      if (!tpl?.content) return;
      const entities = {
        contact: contact as Record<string, unknown>,
        account: (contact.account || undefined) as Record<string, unknown> | undefined,
      };
      const { resolvedContent } = resolveDocument(tpl.content, entities);
      setEmailSubject(tpl.name);
      setEmailTiptapContent(resolvedContent);
      setEmailBody(tiptapToEmailHtml(resolvedContent));
    }
  };

  const handleTiptapChange = useCallback((content: any) => {
    setEmailTiptapContent(content);
    setEmailBody(tiptapToEmailHtml(content));
  }, []);

  const sendEmail = async () => {
    if (!contact.email) { toast.error("El contacto no tiene email."); return; }
    if (!emailSubject) { toast.error("Escribe un asunto."); return; }
    setSending(true);
    try {
      const entities = {
        contact: contact as Record<string, unknown>,
        account: (contact.account || undefined) as Record<string, unknown> | undefined,
      };
      const htmlForSend = emailTiptapContent
        ? tiptapToEmailHtml(resolveDocument(emailTiptapContent, entities).resolvedContent)
        : emailBody;
      const cc = emailCc.split(",").map((s) => s.trim()).filter(Boolean);
      const bcc = emailBcc.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/crm/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: contact.email, cc, bcc, subject: emailSubject, html: htmlForSend, contactId: contact.id, accountId: contact.account?.id || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error enviando email");
      setEmailOpen(false);
      setEmailBody(""); setEmailTiptapContent(null); setEmailSubject(""); setEmailCc(""); setEmailBcc(""); setShowCcBcc(false); setSelectedTemplateId("");
      setEmailCount((prev) => prev + 1);
      toast.success("Correo enviado exitosamente");
    } catch (error) { console.error(error); toast.error("No se pudo enviar el correo."); }
    finally { setSending(false); }
  };

  const handleReplyFromHistory = useCallback(
    (message: EmailMessage) => {
      if (!gmailConnected) {
        toast.error("Conecta Gmail para responder correos.");
        return;
      }
      if (!contact.email) {
        toast.error("El contacto no tiene email.");
        return;
      }

      setEmailSubject(buildReplySubject(message.subject));
      setEmailBody("");
      setEmailTiptapContent(null);
      setEmailCc("");
      setEmailBcc("");
      setShowCcBcc(false);
      setSelectedTemplateId("");
      setEmailOpen(true);
    },
    [gmailConnected, contact.email]
  );

  // ── Navigate to deal and ensure contact is linked ──
  const [linkingDealId, setLinkingDealId] = useState<string | null>(null);

  const navigateToDeal = async (dealId: string) => {
    setLinkingDealId(dealId);
    try {
      // Ensure the contact is linked to the deal before navigating
      await fetch(`/api/crm/deals/${dealId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, role: "participant" }),
      });
      // 201 = linked, 409 = already linked — both are fine
    } catch {
      // Network error — navigate anyway
    }
    router.push(`/crm/deals/${dealId}`);
  };

  // ── WhatsApp (con o sin plantilla) ──
  const openWhatsApp = (templateId?: string) => {
    const phone = contact.phone?.replace(/\D/g, "").replace(/^0/, "");
    if (!phone) return;
    const base = phone.startsWith("56") ? phone : `56${phone}`;
    if (!templateId) {
      window.open(`https://wa.me/${base}`, "_blank");
      return;
    }
    const tpl = docTemplatesWhatsApp.find((t) => t.id === templateId);
    if (!tpl?.content) return;
    const entities = {
      contact: contact as Record<string, unknown>,
      account: (contact.account || undefined) as Record<string, unknown> | undefined,
    };
    const { resolvedContent } = resolveDocument(tpl.content, entities);
    const text = tiptapToPlainText(resolvedContent);
    window.open(`https://wa.me/${base}?text=${encodeURIComponent(text)}`, "_blank");
  };
  const whatsappUrl = contact.phone
    ? `https://wa.me/${contact.phone.replace(/\s/g, "").replace(/^\+/, "")}?text=${encodeURIComponent(`Hola ${contact.firstName}, `)}`
    : null;

  // ── Helpers ──
  const AccountIcon = CRM_MODULES.accounts.icon;
  const DealsIcon = CRM_MODULES.deals.icon;

  const phoneBase = contact.phone
    ? (() => {
      const digits = contact.phone.replace(/\D/g, "").replace(/^0/, "");
      return digits.startsWith("56") ? digits : `56${digits}`;
    })()
    : null;

  // ── Tab state & definitions ──
  const { activeTab, setActiveTab } = useEntityTabs("general");

  const [fileCount, setFileCount] = useState(0);
  useEffect(() => {
    fetch(`/api/crm/files?entityType=contact&entityId=${encodeURIComponent(contact.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFileCount(d.data.length); })
      .catch(() => {});
  }, [contact.id]);

  const tabs: EntityTab[] = [
    { id: "general", label: "General", icon: Info },
    { id: "communication", label: "Comunicación", icon: Mail, count: emailCount },
    { id: "files", label: "Documentos", icon: FileText, count: fileCount },
    { id: "activity", label: "Actividad", icon: History, count: activityEvents.length },
  ];

  const headerActions: EntityHeaderAction[] = [
    { label: "Editar contacto", icon: Pencil, onClick: openEdit, primary: true },
    { label: "Enviar Presentación", icon: Building2, onClick: () => setPresentationOpen(true), hidden: !contact.email },
    { label: "Desactivar presentación", icon: XCircle, onClick: handleDeactivatePresentation, hidden: !hasActivePresentation },
    { label: "Eliminar contacto", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
  ];

  const associatedSections: AssociatedSection[] = [
    {
      id: "account",
      label: "Cuenta",
      icon: Building2,
      count: contact.account ? 1 : 0,
      defaultOpen: true,
      content: contact.account ? (
        <CrmRelatedRecordCard
          module="accounts"
          title={contact.account.name}
          subtitle={contact.account.industry || undefined}
          badge={
            contact.account.type === "client"
              ? { label: "Cliente", variant: "success" }
              : { label: "Prospecto", variant: "warning" }
          }
          href={`/crm/accounts/${contact.account.id}`}
        />
      ) : (
        <EmptyState icon={<AccountIcon className="h-8 w-8" />} title="Sin cuenta" description="Este contacto no está asociado a una cuenta." compact />
      ),
    },
    {
      id: "installations",
      label: "Instalaciones",
      icon: MapPin,
      count: installations.length,
      content: (
        <div className="space-y-3">
          {installations.length === 0 ? (
            <EmptyState icon={<MapPin className="h-8 w-8" />} title="Sin instalaciones" description="No hay instalaciones vinculadas a la cuenta de este contacto." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {installations.map((inst) => (
                <CrmRelatedRecordCard
                  key={inst.id}
                  module="installations"
                  title={inst.name}
                  subtitle={[inst.commune, inst.city].filter(Boolean).join(", ") || undefined}
                  meta={inst.address || undefined}
                  badge={
                    inst.status === "active"
                      ? { label: "Activa", variant: "success" }
                      : inst.status === "inactive"
                        ? { label: "Inactiva", variant: "warning" }
                        : { label: "Prospecto", variant: "secondary" }
                  }
                  href={`/crm/installations/${inst.id}`}
                />
              ))}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
    {
      id: "deals",
      label: "Negocios",
      icon: Briefcase,
      count: contactDeals.length,
      onAdd: contact.account?.id ? () => setDealCreateOpen(true) : undefined,
      content: (
        <div className="space-y-3">
          {contact.account?.id && (
            <CreateDealModal accountId={contact.account.id} accountName={contact.account.name} open={dealCreateOpen} onOpenChange={setDealCreateOpen} />
          )}
          {contactDeals.length === 0 ? (
            <EmptyState icon={<DealsIcon className="h-8 w-8" />} title="Sin negocios" description="No hay negocios vinculados a la cuenta de este contacto." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {contactDeals.map((deal) => {
                const stageColor = (deal.stage as { color?: string | null } | undefined)?.color;
                const badge =
                  deal.status === "won"
                    ? { label: "Ganado", variant: "success" as const }
                    : deal.status === "lost"
                      ? { label: "Perdido", variant: "destructive" as const }
                      : deal.stage?.name
                        ? { label: deal.stage.name, color: stageColor || undefined }
                        : undefined;
                return (
                  <CrmRelatedRecordCard
                    key={deal.id}
                    module="deals"
                    title={deal.title}
                    meta={`$${Number(deal.amount).toLocaleString("es-CL")}`}
                    badge={badge}
                    href={`/crm/deals/${deal.id}`}
                  />
                );
              })}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
    {
      id: "quotes",
      label: "Cotizaciones",
      icon: DollarSign,
      count: quotes.length,
      onAdd: contact.account?.id ? () => setQuoteCreateOpen(true) : undefined,
      content: (
        <div className="space-y-3">
          {contact.account?.id && (
            <CreateQuoteModal defaultClientName={contact.account.name} accountId={contact.account.id} open={quoteCreateOpen} onOpenChange={setQuoteCreateOpen} />
          )}
          {quotes.length === 0 ? (
            <EmptyState icon={<DollarSign className="h-8 w-8" />} title="Sin cotizaciones" description="No hay cotizaciones vinculadas a la cuenta de este contacto." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {quotes.map((q) => {
                const statusMeta = getQuoteStatus(q.status);
                const quoteName = q.name?.trim();
                const title = quoteName || q.code;
                const subtitle = [
                  quoteName ? q.code : null,
                  `${q.totalPositions} puestos · ${q.totalGuards} guardias`,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <CrmRelatedRecordCard
                    key={q.id}
                    module="quotes"
                    title={title}
                    subtitle={subtitle}
                    meta={q.updatedAt ? new Intl.DateTimeFormat("es-CL", { dateStyle: "short" }).format(new Date(q.updatedAt)) : undefined}
                    badge={{ label: statusMeta.label, color: statusMeta.color }}
                    href={`/crm/cotizaciones/${q.id}`}
                  />
                );
              })}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
  ];

  // ── Tab content: General ──
  const generalContent = (
    <DetailFieldGrid columns={3} className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <DetailField label="Nombre completo" value={fullName} />
      <DetailField
        label="Email"
        value={contact.email ? (
          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
        ) : undefined}
        icon={contact.email ? <Mail className="h-3 w-3" /> : undefined}
      />
      <DetailField
        label="Teléfono"
        value={contact.phone ? (
          <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a>
        ) : undefined}
        icon={contact.phone ? <Phone className="h-3 w-3" /> : undefined}
        mono
      />
      <DetailField
        label="Cargo"
        value={contact.roleTitle}
        icon={contact.roleTitle ? <Briefcase className="h-3 w-3" /> : undefined}
      />
      <DetailField
        label="Tipo"
        value={contact.isPrimary ? (
          <Badge variant="outline" className="border-primary/30 text-primary">Principal</Badge>
        ) : "Secundario"}
      />
      <DetailField
        label="PIN portal"
        value={contact.portalPinVisible?.trim() || undefined}
        icon={<KeyRound className="h-3 w-3" />}
        mono
        copyable={!!contact.portalPinVisible?.trim()}
        placeholder={
          contact.portalEnabled
            ? "Sin PIN — genera uno en la ficha de la cuenta (pestaña Portal)"
            : "Portal no habilitado para este contacto"
        }
      />
      <DetailField label="Fecha creación" value={contact.createdAt ? new Date(contact.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
      <DetailField label="Última modificación" value={contact.updatedAt ? new Date(contact.updatedAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"} />
    </DetailFieldGrid>
  );

  return (
    <>
      <EntityDetailLayout
        breadcrumb={["CRM", "Contactos", fullName]}
        breadcrumbHrefs={["/crm", "/crm/contacts"]}
        header={{
          avatar: { initials: fullName.charAt(0).toUpperCase() },
          title: fullName,
          status: contact.isPrimary ? { label: "Principal", variant: "default" } : undefined,
          actions: headerActions,
          extra: (
            <div className="flex items-center gap-1.5">
              {phoneBase && (
                <>
                  <a href={`tel:+${phoneBase}`} title="Llamar"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
                    <Phone className="h-4 w-4" />
                  </a>
                  <a href={`https://wa.me/${phoneBase}?text=${encodeURIComponent(`Hola ${contact.firstName}, `)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-green-600/30 bg-green-600/15 text-green-400 hover:bg-green-600/25 transition-colors">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                  </a>
                </>
              )}
              {gmailConnected && contact.email && (
                <button type="button" onClick={() => setEmailOpen(true)} title="Enviar correo"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
                  <Mail className="h-4 w-4" />
                </button>
              )}
              {contact.accountId && (
                <StartChatButton
                  contactId={contact.id}
                  portalEnabled={contact.portalEnabled ?? false}
                />
              )}
            </div>
          ),
        }}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rightPanel={<AssociatedRecordsPanel sections={associatedSections} />}
      >
        {activeTab === "general" && generalContent}

        {activeTab === "communication" && (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
            <EmailHistoryList
              contactId={contact.id}
              compact
              onReply={gmailConnected ? handleReplyFromHistory : undefined}
              onCountChange={setEmailCount}
            />
          </div>
        )}
        {activeTab === "activity" && (
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <CrmActivityTimeline events={activityEvents} />
          </div>
        )}

        {activeTab === "files" && <div className="rounded-lg border border-border bg-card p-4 sm:p-5"><FileAttachments entityType="contact" entityId={contact.id} title="Documentos" /></div>}
      </EntityDetailLayout>

      {/* ── Email Compose Modal ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar correo a {contact.firstName}</DialogTitle>
            <DialogDescription>Se enviará desde tu cuenta Gmail conectada. Tu firma se adjuntará automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Plantilla (solo mail)</Label>
              <select className={selectCn} value={selectedTemplateId} onChange={(e) => selectTemplate(e.target.value)} disabled={sending}>
                <option value="">Sin plantilla</option>
                {docTemplatesMail.length > 0 && (
                  docTemplatesMail.map((t) => (
                    <option key={t.id} value={`doc:${t.id}`}>{t.name}</option>
                  ))
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Para</Label>
                {!showCcBcc && <button type="button" onClick={() => setShowCcBcc(true)} className="text-[11px] text-primary hover:underline">CC / BCC</button>}
              </div>
              <input value={contact.email || ""} disabled className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn} opacity-70`} />
            </div>
            {showCcBcc && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">CC</Label>
                  <input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn}`} placeholder="copia@empresa.com" disabled={sending} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">BCC</Label>
                  <input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn}`} placeholder="oculto@empresa.com" disabled={sending} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Asunto</Label>
              <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn}`} placeholder="Asunto" disabled={sending} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mensaje</Label>
              <ContractEditor content={emailTiptapContent} onChange={handleTiptapChange} editable={!sending} placeholder="Escribe tu mensaje aquí..." filterModules={["system"]} />
            </div>
            {signatureHtml && (
              <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Firma (se agrega automáticamente)</p>
                <div className="text-xs opacity-70" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancelar</Button>
            <Button onClick={sendEmail} disabled={sending}>{sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar correo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Modal ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar contacto</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">Cuenta</Label>
              <select
                className={selectCn}
                value={editForm.accountId}
                onChange={(e) => setEditForm((p) => ({ ...p, accountId: e.target.value }))}
                disabled={saving}
              >
                {contact.account && !accountOptions.find((a) => a.id === contact.account?.id) && (
                  <option value={contact.account.id}>{contact.account.name}</option>
                )}
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre *</Label>
              <Input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Apellido *</Label>
              <Input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teléfono</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} className={inputCn} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo</Label>
              <Input value={editForm.roleTitle} onChange={(e) => setEditForm((p) => ({ ...p, roleTitle: e.target.value }))} className={inputCn} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editForm.isPrimary} onChange={(e) => setEditForm((p) => ({ ...p, isPrimary: e.target.checked }))} />
                Principal
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={deleteConfirm} onOpenChange={setDeleteConfirm} title="Eliminar contacto" description="El contacto será eliminado permanentemente." onConfirm={deleteContact} />

      <SendPresentationDialog
        open={presentationOpen}
        onOpenChange={setPresentationOpen}
        contact={contact}
        installations={installations}
        onSent={() => router.refresh()}
      />
    </>
  );
}
