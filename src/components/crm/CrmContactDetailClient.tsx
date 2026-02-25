/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
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
  Send,
  MessageSquare,
  FileText,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NotesSection } from "./NotesSection";
import { FileAttachments } from "./FileAttachments";
import { CreateDealModal } from "./CreateDealModal";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";

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

type DocTemplateMail = { id: string; name: string; content: any };
type DocTemplateWhatsApp = { id: string; name: string; content: any };

export function CrmContactDetailClient({
  contact: initialContact,
  deals,
  pipelineStages,
  gmailConnected = false,
  docTemplatesMail = [],
  docTemplatesWhatsApp = [],
  initialEmailCount = 0,
  currentUserId = "",
}: {
  contact: ContactDetail;
  deals: DealRow[];
  pipelineStages: PipelineStageOption[];
  gmailConnected?: boolean;
  docTemplatesMail?: DocTemplateMail[];
  docTemplatesWhatsApp?: DocTemplateWhatsApp[];
  initialEmailCount?: number;
  currentUserId?: string;
}) {
  const router = useRouter();
  const [contact, setContact] = useState(initialContact);
  const [contactDeals, setContactDeals] = useState(deals);
  const [changingStageDealId, setChangingStageDealId] = useState<string | null>(null);
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
  });

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // ── Email compose state ──
  const [emailOpen, setEmailOpen] = useState(false);
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
      .catch(() => {});
  }, []);

  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const selectCn = "flex h-9 min-h-[44px] w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  // ── Handlers ──
  const openEdit = () => {
    setEditForm({
      firstName: contact.firstName, lastName: contact.lastName,
      email: contact.email || "", phone: contact.phone || "",
      roleTitle: contact.roleTitle || "", isPrimary: contact.isPrimary || false,
    });
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
      setContact((prev) => ({ ...prev, ...editForm }));
      setEditOpen(false);
      toast.success("Contacto actualizado");
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

  const updateDealStage = async (dealId: string, stageId: string) => {
    if (!stageId) return;
    const current = contactDeals.find((deal) => deal.id === dealId);
    if (!current || current.stage?.id === stageId) return;

    const nextStage = pipelineStages.find((stage) => stage.id === stageId);
    if (!nextStage) return;

    const snapshot = JSON.parse(JSON.stringify(current)) as DealRow;

    setContactDeals((prev) =>
      prev.map((deal) =>
        deal.id === dealId
          ? {
              ...deal,
              stage: { id: nextStage.id, name: nextStage.name },
              status: nextStage.isClosedWon ? "won" : nextStage.isClosedLost ? "lost" : "open",
            }
          : deal
      )
    );

    setChangingStageDealId(dealId);
    try {
      const response = await fetch(`/api/crm/deals/${dealId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error cambiando etapa");

      setContactDeals((prev) =>
        prev.map((deal) =>
          deal.id === dealId
            ? {
                ...deal,
                stage: payload.data?.stage
                  ? { id: payload.data.stage.id, name: payload.data.stage.name }
                  : deal.stage,
                status: payload.data?.status || deal.status,
              }
            : deal
        )
      );
      toast.success("Etapa actualizada");
    } catch (error) {
      console.error(error);
      setContactDeals((prev) => prev.map((deal) => (deal.id === dealId ? snapshot : deal)));
      toast.error("No se pudo actualizar la etapa.");
    } finally {
      setChangingStageDealId(null);
    }
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

  const subtitle = [
    contact.account?.name || "Sin cuenta",
    contact.roleTitle || "Sin cargo",
  ].join(" · ");

  // ── Sections ──
  const sections: DetailSection[] = [
    {
      key: "general",
      label: "Datos del contacto",
      children: (
        <DetailFieldGrid columns={3}>
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
        </DetailFieldGrid>
      ),
    },
    {
      key: "account",
      children: contact.account ? (
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
      key: "deals",
      count: contactDeals.length,
      action: contact.account?.id ? (
        <CreateDealModal
          accountId={contact.account.id}
          accountName={contact.account.name}
        />
      ) : undefined,
      children: contactDeals.length === 0 ? (
        <EmptyState icon={<DealsIcon className="h-8 w-8" />} title="Sin negocios" description="No hay negocios vinculados a la cuenta de este contacto." compact />
      ) : (
        <CrmRelatedRecordGrid>
          {contactDeals.map((deal) => {
            const hasCurrentStage = deal.stage?.id
              ? pipelineStages.some((stage) => stage.id === deal.stage?.id)
              : false;
            return (
              <CrmRelatedRecordCard
                key={deal.id}
                module="deals"
                title={deal.title}
                subtitle={deal.stage?.name || "Sin etapa"}
                meta={`$${Number(deal.amount).toLocaleString("es-CL")}`}
                badge={
                  deal.status === "won"
                    ? { label: "Ganado", variant: "success" }
                    : deal.status === "lost"
                    ? { label: "Perdido", variant: "destructive" }
                    : undefined
                }
                href={`/crm/deals/${deal.id}`}
                actions={
                  <div onClick={(e) => e.preventDefault()} className="max-w-[130px] sm:max-w-[160px]">
                    <select
                      className="h-9 min-h-[44px] w-full appearance-none truncate rounded-md border border-input bg-background pl-2 pr-6 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 6px center" }}
                      value={deal.stage?.id || ""}
                      onChange={(event) => { event.preventDefault(); updateDealStage(deal.id, event.target.value); }}
                      disabled={changingStageDealId === deal.id || pipelineStages.length === 0}
                      aria-label={`Cambiar etapa de ${deal.title}`}
                    >
                      {deal.stage?.id && !hasCurrentStage && (
                        <option value={deal.stage.id}>{deal.stage.name}</option>
                      )}
                      {pipelineStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                      {pipelineStages.length === 0 && <option value="">Sin etapas</option>}
                    </select>
                  </div>
                }
              />
            );
          })}
        </CrmRelatedRecordGrid>
      ),
    },
    {
      key: "communication",
      count: emailCount,
      action: (
        <div className="flex items-center gap-2">
          {whatsappUrl && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10">
                  <MessageSquare className="h-3.5 w-3.5 mr-1" /> WhatsApp
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openWhatsApp()}>Sin plantilla</DropdownMenuItem>
                {docTemplatesWhatsApp.length > 0 && docTemplatesWhatsApp.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => openWhatsApp(t.id)}>
                    <FileText className="h-3 w-3 mr-2" />{t.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {gmailConnected && contact.email && (
            <Button size="sm" variant="ghost" onClick={() => setEmailOpen(true)}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Enviar correo
            </Button>
          )}
        </div>
      ),
      children: (
        <EmailHistoryList
          contactId={contact.id}
          compact
          onReply={gmailConnected ? handleReplyFromHistory : undefined}
          onCountChange={setEmailCount}
        />
      ),
    },
    {
      key: "notes",
      children: <NotesSection entityType="contact" entityId={contact.id} currentUserId={currentUserId} />,
    },
    {
      key: "files",
      children: <FileAttachments entityType="contact" entityId={contact.id} title="Archivos" />,
    },
  ];

  return (
    <>
      <CrmDetailLayout
        pageType="contact"
        module="contacts"
        title={fullName}
        subtitle={subtitle}
        badge={contact.isPrimary ? { label: "Principal", variant: "default" } : undefined}
        backHref="/crm/contacts"
        actions={[
          { label: "Editar contacto", icon: Pencil, onClick: openEdit },
          { label: "Enviar correo", icon: Mail, onClick: () => setEmailOpen(true), hidden: !gmailConnected || !contact.email },
          { label: "WhatsApp", icon: MessageSquare, onClick: () => whatsappUrl && openWhatsApp(), hidden: !whatsappUrl },
          { label: "Eliminar contacto", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
        ]}
        sections={sections}
      />

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
    </>
  );
}
