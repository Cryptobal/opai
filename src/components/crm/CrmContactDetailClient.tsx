/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { CollapsibleSection } from "./CollapsibleSection";
import { RecordActions } from "./RecordActions";
import { EmailHistoryList, type EmailMessage } from "./EmailHistoryList";
import { ContractEditor } from "@/components/docs/ContractEditor";
import {
  ArrowLeft,
  Users,
  Building2,
  TrendingUp,
  Mail,
  Phone,
  Briefcase,
  Pencil,
  Trash2,
  Loader2,
  ChevronRight,
  Send,
  MessageSquare,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
}: {
  contact: ContactDetail;
  deals: DealRow[];
  pipelineStages: PipelineStageOption[];
  gmailConnected?: boolean;
  docTemplatesMail?: DocTemplateMail[];
  docTemplatesWhatsApp?: DocTemplateWhatsApp[];
  initialEmailCount?: number;
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
  const selectCn = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

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
      const cc = emailCc.split(",").map((s) => s.trim()).filter(Boolean);
      const bcc = emailBcc.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/crm/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: contact.email, cc, bcc, subject: emailSubject, html: emailBody, contactId: contact.id, accountId: contact.account?.id || undefined }),
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

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <Link href="/crm/contacts" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Volver a contactos
        </Link>
        <RecordActions
          actions={[
            { label: "Editar contacto", icon: Pencil, onClick: openEdit },
            { label: "Enviar correo", icon: Mail, onClick: () => setEmailOpen(true), hidden: !gmailConnected || !contact.email },
            { label: "WhatsApp", icon: MessageSquare, onClick: () => whatsappUrl && openWhatsApp(), hidden: !whatsappUrl },
            { label: "Eliminar contacto", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
          ]}
        />
      </div>

      {/* ── Section 1: Datos del contacto ── */}
      <CollapsibleSection
        icon={<Users className="h-4 w-4" />}
        title="Datos del contacto"
        action={
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={openEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Editar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 text-sm">
            <InfoRow label="Nombre completo"><span className="font-medium">{fullName}</span></InfoRow>
            <InfoRow label="Email">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-primary hover:underline"><Mail className="h-3 w-3" />{contact.email}</a>
              ) : <span className="text-muted-foreground">Sin email</span>}
            </InfoRow>
            <InfoRow label="Teléfono">
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-primary hover:underline"><Phone className="h-3 w-3" />{contact.phone}</a>
              ) : <span className="text-muted-foreground">Sin teléfono</span>}
            </InfoRow>
          </div>
          <div className="space-y-3 text-sm">
            <InfoRow label="Cargo">
              {contact.roleTitle ? (
                <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{contact.roleTitle}</span>
              ) : <span className="text-muted-foreground">Sin cargo</span>}
            </InfoRow>
            <InfoRow label="Tipo">
              {contact.isPrimary ? (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Principal</Badge>
              ) : <span className="text-muted-foreground">Secundario</span>}
            </InfoRow>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── Section 2: Cuenta ── */}
      <CollapsibleSection icon={<Building2 className="h-4 w-4" />} title="Cuenta">
        {contact.account ? (
          <Link
            href={`/crm/accounts/${contact.account.id}`}
            className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <p className="font-medium text-sm">{contact.account.name}</p>
                {contact.account.type && (
                  <Badge variant="outline" className={contact.account.type === "client" ? "border-emerald-500/30 text-emerald-400" : "border-amber-500/30 text-amber-400"}>
                    {contact.account.type === "client" ? "Cliente" : "Prospecto"}
                  </Badge>
                )}
              </div>
              {contact.account.industry && <p className="mt-0.5 text-xs text-muted-foreground">{contact.account.industry}</p>}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </Link>
        ) : (
          <EmptyState icon={<Building2 className="h-8 w-8" />} title="Sin cuenta" description="Este contacto no está asociado a una cuenta." compact />
        )}
      </CollapsibleSection>

      {/* ── Section 3: Negocios ── */}
      <CollapsibleSection
        icon={<TrendingUp className="h-4 w-4" />}
        title="Negocios"
        count={contactDeals.length}
        defaultOpen={contactDeals.length > 0}
      >
        {contactDeals.length === 0 ? (
          <EmptyState icon={<TrendingUp className="h-8 w-8" />} title="Sin negocios" description="No hay negocios vinculados a la cuenta de este contacto." compact />
        ) : (
          <div className="space-y-2">
            {contactDeals.map((deal) => {
              const hasCurrentStage = deal.stage?.id
                ? pipelineStages.some((stage) => stage.id === deal.stage?.id)
                : false;
              return (
                <div
                  key={deal.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link href={`/crm/deals/${deal.id}`} className="flex-1 min-w-0">
                    <p className="text-sm font-medium group-hover:text-primary transition-colors break-words">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {deal.status === "won" && <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">Ganado</Badge>}
                      {deal.status === "lost" && <Badge variant="outline" className="border-red-500/30 text-red-400">Perdido</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">${Number(deal.amount).toLocaleString("es-CL")}</p>
                  </Link>
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">
                    <select
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60 sm:min-w-[130px] sm:w-auto"
                      value={deal.stage?.id || ""}
                      onChange={(event) => updateDealStage(deal.id, event.target.value)}
                      disabled={changingStageDealId === deal.id || pipelineStages.length === 0}
                      aria-label={`Cambiar etapa de ${deal.title}`}
                    >
                      {deal.stage?.id && !hasCurrentStage && (
                        <option value={deal.stage.id}>{deal.stage.name}</option>
                      )}
                      {pipelineStages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                      {pipelineStages.length === 0 && <option value="">Sin etapas disponibles</option>}
                    </select>
                    <Link href={`/crm/deals/${deal.id}`} className="shrink-0">
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section 4: Comunicación ── */}
      <CollapsibleSection
        icon={<Mail className="h-4 w-4" />}
        title="Comunicación"
        count={emailCount}
        defaultOpen={false}
        action={
          <div className="flex items-center gap-2">
            {whatsappUrl && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-medium text-emerald-600 hover:bg-emerald-500/20 transition-colors">
                    <MessageSquare className="h-3 w-3" />
                    WhatsApp
                    <ChevronRight className="h-3 w-3 rotate-[-90deg]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openWhatsApp()}>
                    Sin plantilla
                  </DropdownMenuItem>
                  {docTemplatesWhatsApp.length > 0 && docTemplatesWhatsApp.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => openWhatsApp(t.id)}>
                      <FileText className="h-3 w-3 mr-2" />
                      {t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {gmailConnected && contact.email && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEmailOpen(true)}>
                <Send className="h-3 w-3 mr-1" />
                Enviar correo
              </Button>
            )}
          </div>
        }
      >
        <EmailHistoryList
          contactId={contact.id}
          compact
          onReply={gmailConnected ? handleReplyFromHistory : undefined}
          onCountChange={setEmailCount}
        />
      </CollapsibleSection>

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
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
