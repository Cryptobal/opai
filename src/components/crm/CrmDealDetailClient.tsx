/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ExternalLink, Trash2, TrendingUp, FileText, Mail, Users, ChevronRight, Pencil, Send, MessageSquare, Plus, Star, X } from "lucide-react";
import { EmailHistoryList, type EmailMessage } from "@/components/crm/EmailHistoryList";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { CollapsibleSection } from "./CollapsibleSection";
import { RecordActions } from "./RecordActions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/opai/EmptyState";
import { toast } from "sonner";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";

/** Convierte Tiptap JSON a HTML para email */
function tiptapToEmailHtml(doc: any): string {
  if (!doc || !doc.content) return "";
  const renderNode = (node: any): string => {
    if (!node) return "";
    switch (node.type) {
      case "doc": return (node.content || []).map(renderNode).join("");
      case "paragraph": { const style = node.attrs?.textAlign ? `text-align:${node.attrs.textAlign};` : ""; const inner = (node.content || []).map(renderNode).join(""); return inner ? `<p style="margin:0 0 8px;${style}">${inner}</p>` : `<p style="margin:0 0 8px;">&nbsp;</p>`; }
      case "heading": { const lvl = node.attrs?.level || 2; const inner = (node.content || []).map(renderNode).join(""); return `<h${lvl} style="margin:0 0 8px;">${inner}</h${lvl}>`; }
      case "bulletList": return `<ul style="margin:0 0 8px;padding-left:24px;">${(node.content || []).map(renderNode).join("")}</ul>`;
      case "orderedList": return `<ol style="margin:0 0 8px;padding-left:24px;">${(node.content || []).map(renderNode).join("")}</ol>`;
      case "listItem": return `<li style="margin:0 0 4px;">${(node.content || []).map(renderNode).join("")}</li>`;
      case "text": { let text = (node.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); for (const mark of node.marks || []) { switch (mark.type) { case "bold": text = `<strong>${text}</strong>`; break; case "italic": text = `<em>${text}</em>`; break; case "underline": text = `<u>${text}</u>`; break; case "strike": text = `<s>${text}</s>`; break; case "link": text = `<a href="${mark.attrs?.href || "#"}" style="color:#0059A3;text-decoration:underline;">${text}</a>`; break; case "textStyle": if (mark.attrs?.color) text = `<span style="color:${mark.attrs.color}">${text}</span>`; break; } } return text; }
      case "hardBreak": return "<br/>";
      case "horizontalRule": return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:12px 0;"/>`;
      case "blockquote": return `<blockquote style="border-left:3px solid #e5e7eb;padding-left:12px;margin:8px 0;color:#666;">${(node.content || []).map(renderNode).join("")}</blockquote>`;
      case "contractToken": return `{{${node.attrs?.tokenKey || ""}}}`;
      default: return (node.content || []).map(renderNode).join("");
    }
  };
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#333;line-height:1.6;">${renderNode(doc)}</div>`;
}

function buildReplySubject(subject?: string | null): string {
  const normalized = (subject || "").trim();
  if (!normalized) return "Re: Sin asunto";
  return /^re:/i.test(normalized) ? normalized : `Re: ${normalized}`;
}

type QuoteOption = { id: string; code: string; clientName?: string | null; status: string; };
type DealQuote = { id: string; quoteId: string; };
type ContactRow = { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleTitle?: string | null; isPrimary?: boolean; };
type DealContactRow = { id: string; dealId: string; contactId: string; role: string; contact: ContactRow; };
type PipelineStageOption = { id: string; name: string; isClosedWon?: boolean; isClosedLost?: boolean; };

export type DealDetail = {
  id: string;
  title: string;
  amount: string;
  stage?: { id: string; name: string } | null;
  account?: { id: string; name: string } | null;
  primaryContactId?: string | null;
  primaryContact?: { firstName: string; lastName: string; email?: string | null } | null;
  quotes?: DealQuote[];
  proposalLink?: string | null;
};

type DocTemplateMail = { id: string; name: string; content: any };
type DocTemplateWhatsApp = { id: string; name: string; content: any };

export function CrmDealDetailClient({
  deal, quotes, pipelineStages, dealContacts: initialDealContacts, accountContacts, gmailConnected, docTemplatesMail = [], docTemplatesWhatsApp = [],
}: {
  deal: DealDetail; quotes: QuoteOption[];
  pipelineStages: PipelineStageOption[];
  dealContacts: DealContactRow[]; accountContacts: ContactRow[];
  gmailConnected: boolean; docTemplatesMail?: DocTemplateMail[]; docTemplatesWhatsApp?: DocTemplateWhatsApp[];
}) {
  // ── Quote linking state ──
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState("");
  const [linkedQuotes, setLinkedQuotes] = useState<DealQuote[]>(deal.quotes || []);

  // ── Deal contacts state ──
  const [dealContacts, setDealContacts] = useState<DealContactRow[]>(initialDealContacts);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [addingContact, setAddingContact] = useState(false);
  const [currentStage, setCurrentStage] = useState<DealDetail["stage"]>(deal.stage || null);
  const [changingStage, setChangingStage] = useState(false);
  const [linking, setLinking] = useState(false);

  // ── Email compose state ──
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailTo, setEmailTo] = useState(deal.primaryContact?.email || "");
  const [emailCc, setEmailCc] = useState("");
  const [emailBcc, setEmailBcc] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [emailSubject, setEmailSubject] = useState(`Propuesta para ${deal.account?.name || "cliente"}`);
  const [emailBody, setEmailBody] = useState("");
  const [emailTiptapContent, setEmailTiptapContent] = useState<any>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [signatureHtml, setSignatureHtml] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/signatures?mine=true").then((r) => r.json()).then((data) => {
      if (data.success && data.data?.length > 0) {
        const sig = data.data.find((s: any) => s.isDefault) || data.data[0];
        if (sig?.htmlContent) setSignatureHtml(sig.htmlContent);
      }
    }).catch(() => {});
  }, []);

  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const selectCn = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";

  const deleteDeal = async () => {
    try { const res = await fetch(`/api/crm/deals/${deal.id}`, { method: "DELETE" }); if (!res.ok) throw new Error(); toast.success("Negocio eliminado"); router.push("/crm/deals"); }
    catch { toast.error("No se pudo eliminar"); }
  };

  const applyPlaceholders = (value: string) => {
    const r: Record<string, string> = { "{cliente}": deal.account?.name || "", "{contacto}": deal.primaryContact ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim() : "", "{negocio}": deal.title || "", "{etapa}": currentStage?.name || "", "{monto}": deal.amount ? Number(deal.amount).toLocaleString("es-CL") : "", "{correo}": deal.primaryContact?.email || "" };
    return Object.entries(r).reduce((acc, [key, val]) => acc.split(key).join(val), value);
  };

  const primaryPhone = deal.primaryContact?.phone?.replace(/\D/g, "").replace(/^0/, "");
  const whatsappPhone = primaryPhone ? (primaryPhone.startsWith("56") ? primaryPhone : `56${primaryPhone}`) : null;
  const openWhatsApp = (templateId?: string) => {
    if (!whatsappPhone) return;
    if (!templateId) {
      window.open(`https://wa.me/${whatsappPhone}`, "_blank");
      return;
    }
    const tpl = docTemplatesWhatsApp.find((t) => t.id === templateId);
    if (!tpl?.content) return;
    const entities = {
      contact: (deal.primaryContact || undefined) as Record<string, unknown> | undefined,
      account: (deal.account || undefined) as Record<string, unknown> | undefined,
      deal: { ...deal, proposalLink: deal.proposalLink || "" } as Record<string, unknown>,
    };
    const { resolvedContent } = resolveDocument(tpl.content, entities);
    const text = tiptapToPlainText(resolvedContent);
    window.open(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const selectTemplate = (value: string) => {
    setSelectedTemplateId(value);
    if (!value) return;

    if (value.startsWith("doc:")) {
      const id = value.slice(4);
      const tpl = docTemplatesMail.find((t) => t.id === id);
      if (!tpl?.content) return;
      const entities = {
        contact: (deal.primaryContact || undefined) as Record<string, unknown> | undefined,
        account: (deal.account || undefined) as Record<string, unknown> | undefined,
      };
      const { resolvedContent } = resolveDocument(tpl.content, entities);
      setEmailSubject(tpl.name);
      setEmailTiptapContent(resolvedContent);
      setEmailBody(tiptapToEmailHtml(resolvedContent));
    }
  };

  const quotesById = useMemo(() => quotes.reduce<Record<string, QuoteOption>>((acc, q) => { acc[q.id] = q; return acc; }, {}), [quotes]);

  const linkQuote = async () => {
    if (!selectedQuoteId) { toast.error("Selecciona una cotización."); return; }
    setLinking(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: selectedQuoteId }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setLinkedQuotes((prev) => [...prev, payload.data]); setSelectedQuoteId(""); setQuoteDialogOpen(false); toast.success("Cotización vinculada");
    } catch (error) { console.error(error); toast.error("No se pudo vincular."); }
    finally { setLinking(false); }
  };

  const handleTiptapChange = useCallback((content: any) => { setEmailTiptapContent(content); setEmailBody(tiptapToEmailHtml(content)); }, []);

  const sendEmail = async () => {
    if (!gmailConnected) { toast.error("Conecta Gmail antes de enviar."); return; }
    if (!emailTo || !emailSubject) { toast.error("Completa destinatario y asunto."); return; }
    setSending(true);
    try {
      const cc = emailCc.split(",").map((s) => s.trim()).filter(Boolean);
      const bcc = emailBcc.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/crm/gmail/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: emailTo, cc, bcc, subject: emailSubject, html: emailBody, dealId: deal.id, accountId: deal.account?.id, contactId: deal.primaryContactId }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setEmailOpen(false); setEmailBody(""); setEmailTiptapContent(null); setEmailCc(""); setEmailBcc(""); setShowCcBcc(false);
      toast.success("Correo enviado exitosamente");
    } catch (error) { console.error(error); toast.error("No se pudo enviar."); }
    finally { setSending(false); }
  };

  const handleReplyFromHistory = useCallback(
    (message: EmailMessage) => {
      if (!gmailConnected) {
        toast.error("Conecta Gmail para responder correos.");
        return;
      }

      const replyTo =
        message.direction === "in"
          ? message.fromEmail
          : message.toEmails?.[0] || "";

      if (!replyTo) {
        toast.error("No se encontró destinatario para responder.");
        return;
      }

      setEmailTo(replyTo);
      setEmailSubject(buildReplySubject(message.subject));
      setEmailBody("");
      setEmailTiptapContent(null);
      setEmailCc("");
      setEmailBcc("");
      setShowCcBcc(false);
      setSelectedTemplateId("");
      setEmailOpen(true);
    },
    [gmailConnected]
  );

  // ── Deal contacts handlers ──
  const linkedContactIds = new Set(dealContacts.map((dc) => dc.contactId));
  const availableContacts = accountContacts.filter((c) => !linkedContactIds.has(c.id));

  const addDealContact = async () => {
    if (!selectedContactId) { toast.error("Selecciona un contacto."); return; }
    setAddingContact(true);
    try {
      const role = dealContacts.length === 0 ? "primary" : "participant";
      const res = await fetch(`/api/crm/deals/${deal.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: selectedContactId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setDealContacts((prev) => [...prev, data.data]);
      setSelectedContactId("");
      setAddContactOpen(false);
      toast.success("Contacto vinculado al negocio");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo vincular.");
    } finally {
      setAddingContact(false);
    }
  };

  const removeDealContact = async (contactId: string) => {
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/contacts?contactId=${contactId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDealContacts((prev) => prev.filter((dc) => dc.contactId !== contactId));
      toast.success("Contacto desvinculado");
    } catch { toast.error("No se pudo desvincular."); }
  };

  const markPrimary = async (contactId: string) => {
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, role: "primary" }),
      });
      if (!res.ok) throw new Error();
      setDealContacts((prev) =>
        prev.map((dc) => ({
          ...dc,
          role: dc.contactId === contactId ? "primary" : "participant",
        }))
      );
      toast.success("Contacto marcado como principal");
    } catch { toast.error("No se pudo actualizar."); }
  };

  const updateStage = async (stageId: string) => {
    if (!stageId || currentStage?.id === stageId) return;
    const nextStage = pipelineStages.find((stage) => stage.id === stageId);
    if (!nextStage) return;

    const snapshot = currentStage;
    setCurrentStage({ id: nextStage.id, name: nextStage.name });
    setChangingStage(true);
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error cambiando etapa");
      setCurrentStage(
        payload.data?.stage
          ? { id: payload.data.stage.id, name: payload.data.stage.name }
          : { id: nextStage.id, name: nextStage.name }
      );
      toast.success("Etapa actualizada");
    } catch (error) {
      console.error(error);
      setCurrentStage(snapshot);
      toast.error("No se pudo actualizar la etapa.");
    } finally {
      setChangingStage(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <Link href="/crm/deals" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Volver a negocios
        </Link>
        <RecordActions
          actions={[
            { label: "Enviar correo", icon: Mail, onClick: () => setEmailOpen(true), hidden: !gmailConnected },
            { label: "Eliminar negocio", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
          ]}
        />
      </div>

      {/* ── Section 1: Resumen ── */}
      <CollapsibleSection icon={<TrendingUp className="h-4 w-4" />} title="Resumen del negocio">
        <div className="space-y-3 text-sm">
          <InfoRow label="Cliente">
            {deal.account ? (
              <Link href={`/crm/accounts/${deal.account.id}`} className="flex items-center gap-1 font-medium text-primary hover:underline">
                {deal.account.name}<ExternalLink className="h-3 w-3" />
              </Link>
            ) : <span className="font-medium">Sin cliente</span>}
          </InfoRow>
          <InfoRow label="Etapa">
            <div className="flex items-center gap-2">
              <select
                className="h-8 min-w-[150px] rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                value={currentStage?.id || ""}
                onChange={(event) => updateStage(event.target.value)}
                disabled={changingStage || pipelineStages.length === 0}
                aria-label={`Cambiar etapa de ${deal.title}`}
              >
                {currentStage?.id && !pipelineStages.some((stage) => stage.id === currentStage.id) && (
                  <option value={currentStage.id}>{currentStage.name}</option>
                )}
                {pipelineStages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
                {pipelineStages.length === 0 && <option value="">Sin etapas disponibles</option>}
              </select>
              {changingStage && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          </InfoRow>
          <InfoRow label="Monto"><span className="font-medium">${Number(deal.amount).toLocaleString("es-CL")}</span></InfoRow>
          <InfoRow label="Contacto">
            {deal.primaryContact && deal.primaryContactId ? (
              <Link href={`/crm/contacts/${deal.primaryContactId}`} className="flex items-center gap-1 font-medium text-primary hover:underline">
                {`${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim()}<ExternalLink className="h-3 w-3" />
              </Link>
            ) : <span className="font-medium">Sin contacto</span>}
          </InfoRow>
          <InfoRow label="Link propuesta">
            {deal.proposalLink ? (
              <a href={deal.proposalLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-medium text-primary hover:underline">
                Ver propuesta<ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : <span className="text-muted-foreground">Sin link</span>}
          </InfoRow>
        </div>
      </CollapsibleSection>

      {/* ── Section 2: Cotizaciones ── */}
      <CollapsibleSection
        icon={<FileText className="h-4 w-4" />}
        title="Cotizaciones"
        count={linkedQuotes.length}
        defaultOpen={linkedQuotes.length > 0}
        action={
          <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs">Vincular</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Vincular cotización</DialogTitle><DialogDescription>Selecciona una cotización desde CPQ.</DialogDescription></DialogHeader>
              <div className="space-y-2">
                <Label>Cotización</Label>
                <select className={selectCn} value={selectedQuoteId} onChange={(e) => setSelectedQuoteId(e.target.value)} disabled={linking}>
                  <option value="">Selecciona cotización</option>
                  {quotes.map((q) => <option key={q.id} value={q.id}>{q.code} · {q.clientName || "Sin cliente"}</option>)}
                </select>
              </div>
              <DialogFooter>
                <Button onClick={linkQuote} disabled={linking}>{linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar vínculo</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      >
        {linkedQuotes.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="Sin cotizaciones" description="No hay cotizaciones vinculadas a este negocio." compact />
        ) : (
          <div className="space-y-2">
            {linkedQuotes.map((quote) => {
              const info = quotesById[quote.quoteId];
              return (
                <Link key={quote.id} href={`/crm/cotizaciones/${quote.quoteId}`} className="flex items-center justify-between rounded-lg border p-3 sm:p-4 transition-colors hover:bg-accent/30 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{info?.code || "CPQ"}</p>
                      <Badge variant="outline" className={info?.status === "approved" ? "border-emerald-500/30 text-emerald-400" : info?.status === "sent" ? "border-blue-500/30 text-blue-400" : info?.status === "rejected" ? "border-red-500/30 text-red-400" : ""}>
                        {info?.status === "draft" ? "Borrador" : info?.status === "sent" ? "Enviada" : info?.status === "approved" ? "Aprobada" : info?.status === "rejected" ? "Rechazada" : info?.status || "Borrador"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{info?.clientName || "Sin cliente"}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:translate-x-0.5 transition-transform shrink-0 hidden sm:block" />
                </Link>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Section 3: Contactos del negocio ── */}
      <CollapsibleSection
        icon={<Users className="h-4 w-4" />}
        title="Contactos del negocio"
        count={dealContacts.length}
        defaultOpen={dealContacts.length > 0}
        action={
          availableContacts.length > 0 ? (
            <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Vincular contacto al negocio</DialogTitle><DialogDescription>Selecciona un contacto de la cuenta.</DialogDescription></DialogHeader>
                <div className="space-y-2">
                  <Label>Contacto</Label>
                  <select className={selectCn} value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} disabled={addingContact}>
                    <option value="">Selecciona contacto</option>
                    {availableContacts.map((c) => (
                      <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim()} · {c.email || "Sin email"}</option>
                    ))}
                  </select>
                </div>
                <DialogFooter>
                  <Button onClick={addDealContact} disabled={addingContact}>
                    {addingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Vincular
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      >
        {dealContacts.length === 0 ? (
          <EmptyState icon={<Users className="h-8 w-8" />} title="Sin contactos" description="Vincula contactos de la cuenta a este negocio." compact />
        ) : (
          <div className="space-y-2">
            {dealContacts.map((dc) => {
              const c = dc.contact;
              return (
                <div key={dc.id} className="flex items-center justify-between rounded-lg border p-3 sm:p-4 group">
                  <Link href={`/crm/contacts/${c.id}`} className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm group-hover:text-primary transition-colors">{`${c.firstName} ${c.lastName}`.trim()}</p>
                      {dc.role === "primary" && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Principal</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.roleTitle || "Sin cargo"} · {c.email || "Sin email"} · {c.phone || "Sin teléfono"}</p>
                  </Link>
                  <div className="flex items-center gap-1 shrink-0">
                    {dc.role !== "primary" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Marcar como principal" onClick={() => markPrimary(c.id)}>
                        <Star className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Desvincular" onClick={() => removeDealContact(c.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                    <Link href={`/crm/contacts/${c.id}`}>
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
        defaultOpen={false}
        action={
          <div className="flex items-center gap-1">
            {whatsappPhone && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10">
                    <MessageSquare className="h-3 w-3 mr-1" /> WhatsApp
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openWhatsApp()}>Sin plantilla</DropdownMenuItem>
                  {docTemplatesWhatsApp.map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => openWhatsApp(t.id)}>
                      <FileText className="h-3 w-3 mr-2" />{t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {gmailConnected ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEmailOpen(true)}>
                <Send className="h-3 w-3 mr-1" /> Enviar correo
              </Button>
            ) : (
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link href="/opai/configuracion/integraciones">Conectar Gmail</Link>
              </Button>
            )}
          </div>
        }
      >
        <EmailHistoryList
          dealId={deal.id}
          compact
          onReply={gmailConnected ? handleReplyFromHistory : undefined}
        />
      </CollapsibleSection>

      {/* ── Email Compose Modal ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar correo</DialogTitle>
            <DialogDescription>Se enviará desde tu cuenta Gmail conectada. Tu firma se adjuntará automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Template</Label>
              <select className={selectCn} value={selectedTemplateId} onChange={(e) => selectTemplate(e.target.value)} disabled={sending}>
                <option value="">Sin plantilla</option>
                {docTemplatesMail.length > 0 &&
                  docTemplatesMail.map((t) => (
                    <option key={t.id} value={`doc:${t.id}`}>{t.name}</option>
                  ))
                }
              </select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Para</Label>
                {!showCcBcc && <button type="button" onClick={() => setShowCcBcc(true)} className="text-[11px] text-primary hover:underline">CC / BCC</button>}
              </div>
              <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn}`} placeholder="correo@cliente.com" disabled={sending} />
            </div>
            {showCcBcc && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">CC</Label><input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn}`} placeholder="copia@empresa.com" disabled={sending} /></div>
                <div className="space-y-1.5"><Label className="text-xs">BCC</Label><input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} className={`h-9 w-full rounded-md border px-3 text-sm ${inputCn}`} placeholder="oculto@empresa.com" disabled={sending} /></div>
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

      <ConfirmDialog open={deleteConfirm} onOpenChange={setDeleteConfirm} title="Eliminar negocio" description="Se eliminarán las cotizaciones vinculadas y el historial." onConfirm={deleteDeal} />
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-medium">{children}</div>
    </div>
  );
}
