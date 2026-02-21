/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
import { Loader2, ExternalLink, Trash2, FileText, Mail, ChevronRight, Send, MessageSquare, Plus, Star, X, Clock3, MapPin } from "lucide-react";
import { EmailHistoryList, type EmailMessage } from "@/components/crm/EmailHistoryList";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard } from "./CrmRelatedRecordCard";
import { CrmInstallationsClient } from "./CrmInstallationsClient";
import { CrmSectionCreateButton } from "./CrmSectionCreateButton";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CRM_MODULES } from "./CrmModuleIcons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/opai/EmptyState";
import { toast } from "sonner";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";
import { NotesSection } from "./NotesSection";
import { FileAttachments } from "./FileAttachments";

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
      case "pageBreak": return `<div style="page-break-before:always"></div>`;
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

type QuoteOption = {
  id: string;
  code: string;
  clientName?: string | null;
  status: string;
  monthlyCost?: string | number | null;
  currency?: "CLP" | "UF" | string;
};
type DealQuote = { id: string; quoteId: string; };
type ContactRow = { id: string; firstName: string; lastName: string; email?: string | null; phone?: string | null; roleTitle?: string | null; isPrimary?: boolean; };
type DealContactRow = { id: string; dealId: string; contactId: string; role: string; contact: ContactRow; };
type PipelineStageOption = { id: string; name: string; isClosedWon?: boolean; isClosedLost?: boolean; };
type FollowUpConfigState = {
  isActive: boolean;
  firstFollowUpDays: number;
  secondFollowUpDays: number;
  thirdFollowUpDays: number;
  sendHour: number;
  autoAdvanceStage: boolean;
  pauseOnReply: boolean;
};
type FollowUpEmail = {
  id: string;
  subject: string;
  toEmails: string[];
  status: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  openCount: number;
  clickCount: number;
  bouncedAt?: string | null;
};
type FollowUpLog = {
  id: string;
  sequence: number;
  status: string;
  scheduledAt: string;
  sentAt?: string | null;
  error?: string | null;
  createdAt: string;
  emailMessage?: FollowUpEmail | null;
};

export type DealDetail = {
  id: string;
  title: string;
  amount: string;
  status?: string;
  stage?: { id: string; name: string } | null;
  account?: { id: string; name: string; isActive?: boolean } | null;
  primaryContactId?: string | null;
  primaryContact?: { firstName: string; lastName: string; email?: string | null; phone?: string | null } | null;
  quotes?: DealQuote[];
  proposalLink?: string | null;
  proposalSentAt?: string | null;
};

type InstallationRow = { id: string; name: string; address?: string | null; city?: string | null; commune?: string | null; isActive?: boolean };
type DocTemplateMail = { id: string; name: string; content: any };
type DocTemplateWhatsApp = { id: string; name: string; content: any };

export function CrmDealDetailClient({
  deal, quotes, pipelineStages, dealContacts: initialDealContacts, accountContacts, accountInstallations = [], gmailConnected, docTemplatesMail = [], docTemplatesWhatsApp = [], followUpConfig = null, followUpLogs = [], ufValue, canConfigureCrm = false, currentUserId = "",
}: {
  deal: DealDetail; quotes: QuoteOption[];
  pipelineStages: PipelineStageOption[];
  dealContacts: DealContactRow[]; accountContacts: ContactRow[];
  accountInstallations?: InstallationRow[];
  gmailConnected: boolean; docTemplatesMail?: DocTemplateMail[]; docTemplatesWhatsApp?: DocTemplateWhatsApp[];
  followUpConfig?: FollowUpConfigState | null;
  followUpLogs?: FollowUpLog[];
  ufValue: number;
  canConfigureCrm?: boolean;
  currentUserId?: string;
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
  const createInstallationRef = useRef<{ open: () => void } | null>(null);

  const selectCn = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const inputCn = "bg-background text-foreground placeholder:text-muted-foreground border-input focus-visible:ring-ring";
  const [dealProposalLink, setDealProposalLink] = useState<string | null>(deal.proposalLink || null);
  const [dealProposalSentAt, setDealProposalSentAt] = useState<string | null>(deal.proposalSentAt || null);
  const [followUpActioning, setFollowUpActioning] = useState(false);
  const [sendingLogId, setSendingLogId] = useState<string | null>(null);
  const [localFollowUpLogs, setLocalFollowUpLogs] = useState(followUpLogs);

  const followUpLogsDesc = useMemo(
    () =>
      [...localFollowUpLogs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [localFollowUpLogs]
  );
  const latestFollowUpBySequence = useMemo(() => {
    const bySequence: Record<number, FollowUpLog | null> = { 1: null, 2: null, 3: null };
    for (const log of followUpLogsDesc) {
      if ((log.sequence === 1 || log.sequence === 2 || log.sequence === 3) && !bySequence[log.sequence]) {
        bySequence[log.sequence] = log;
      }
    }
    return bySequence;
  }, [followUpLogsDesc]);
  const pendingFollowUps = localFollowUpLogs.filter((log) => log.status === "pending");
  const overdueFollowUpsCount = pendingFollowUps.filter(
    (log) => new Date(log.scheduledAt).getTime() <= Date.now()
  ).length;
  const sentFollowUpsCount = localFollowUpLogs.filter((log) => log.status === "sent").length;
  const failedFollowUpsCount = localFollowUpLogs.filter((log) => log.status === "failed").length;
  const followUpFlowStatus = useMemo(
    () =>
      getFollowUpFlowStatus({
        proposalSentAt: dealProposalSentAt,
        proposalLink: dealProposalLink,
        config: followUpConfig,
        totalLogs: localFollowUpLogs.length,
        pendingLogs: pendingFollowUps.length,
        overdueLogs: overdueFollowUpsCount,
      }),
    [
      dealProposalSentAt,
      dealProposalLink,
      followUpConfig,
      localFollowUpLogs.length,
      pendingFollowUps.length,
      overdueFollowUpsCount,
    ]
  );
  const localFollowUpLogsDesc = followUpLogsDesc;

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
        deal: {
          ...deal,
          proposalLink: deal.proposalLink || "",
        } as Record<string, unknown>,
      };
      const { resolvedContent } = resolveDocument(tpl.content, entities);
      setEmailSubject(tpl.name);
      setEmailTiptapContent(resolvedContent);
      setEmailBody(tiptapToEmailHtml(resolvedContent));
    }
  };

  const quotesById = useMemo(() => quotes.reduce<Record<string, QuoteOption>>((acc, q) => { acc[q.id] = q; return acc; }, {}), [quotes]);
  const formatQuoteAmounts = useCallback(
    (quote?: QuoteOption) => {
      if (!quote) return "Monto no disponible";
      const raw = Number(quote.monthlyCost ?? 0);
      if (!Number.isFinite(raw) || raw <= 0) return "Monto no disponible";
      const safeUf = ufValue > 0 ? ufValue : 38000;
      const amountClp = quote.currency === "UF" ? raw * safeUf : raw;
      const amountUf = quote.currency === "UF" ? raw : raw / safeUf;
      return `$${Math.round(amountClp).toLocaleString("es-CL")} · UF ${amountUf.toLocaleString("es-CL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    [ufValue]
  );

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
      const entities = {
        contact: (deal.primaryContact || undefined) as Record<string, unknown> | undefined,
        account: (deal.account || undefined) as Record<string, unknown> | undefined,
        deal: {
          ...deal,
          proposalLink: dealProposalLink || deal.proposalLink || "",
        } as Record<string, unknown>,
      };
      const htmlForSend = emailTiptapContent
        ? tiptapToEmailHtml(resolveDocument(emailTiptapContent, entities).resolvedContent)
        : emailBody;
      const cc = emailCc.split(",").map((s) => s.trim()).filter(Boolean);
      const bcc = emailBcc.split(",").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/crm/gmail/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: emailTo, cc, bcc, subject: emailSubject, html: htmlForSend, dealId: deal.id, accountId: deal.account?.id, contactId: deal.primaryContactId }) });
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
      if (payload.data?.proposalSentAt) {
        setDealProposalSentAt(payload.data.proposalSentAt);
      }
      if (typeof payload.data?.proposalLink === "string") {
        setDealProposalLink(payload.data.proposalLink);
      }
      toast.success("Etapa actualizada");
    } catch (error) {
      console.error(error);
      setCurrentStage(snapshot);
      toast.error("No se pudo actualizar la etapa.");
    } finally {
      setChangingStage(false);
    }
  };

  // ── Helpers ──
  const ContactsIcon = CRM_MODULES.contacts.icon;
  const InstallationsIcon = CRM_MODULES.installations.icon;
  const QuotesIcon = CRM_MODULES.quotes.icon;
  const FollowUpIcon = Clock3;

  const subtitle = [
    deal.account?.name || "Sin cliente",
    currentStage?.name || "Sin etapa",
  ].join(" · ");

  const statusBadge = deal.status === "won"
    ? { label: "Ganado", variant: "success" as const }
    : deal.status === "lost"
    ? { label: "Perdido", variant: "destructive" as const }
    : undefined;

  // ── Sections ──
  const generalSection: DetailSection = {
    key: "general",
    label: "Resumen del negocio",
    children: (
      <DetailFieldGrid>
        <DetailField
          label="Cliente"
          value={deal.account ? (
            <Link href={`/crm/accounts/${deal.account.id}`} className="text-primary hover:underline flex items-center gap-1">
              {deal.account.name}<ExternalLink className="h-3 w-3" />
            </Link>
          ) : "Sin cliente"}
        />
        <DetailField
          label="Etapa"
          value={
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
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
                {pipelineStages.length === 0 && <option value="">Sin etapas</option>}
              </select>
              {changingStage && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          }
        />
        <DetailField
          label="Contacto"
          value={deal.primaryContact && deal.primaryContactId ? (
            <Link href={`/crm/contacts/${deal.primaryContactId}`} className="text-primary hover:underline flex items-center gap-1">
              {`${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim()}<ExternalLink className="h-3 w-3" />
            </Link>
          ) : "Sin contacto"}
        />
        <DetailField
          label="Link propuesta"
          value={dealProposalLink ? (
            <a href={dealProposalLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Ver propuesta<ExternalLink className="h-3 w-3" />
            </a>
          ) : undefined}
        />
        <DetailField
          label="Flujo seguimiento"
          value={<Badge variant="outline" className={followUpFlowStatus.className}>{followUpFlowStatus.label}</Badge>}
        />
      </DetailFieldGrid>
    ),
  };

  const localPendingCount = localFollowUpLogs.filter((l) => l.status === "pending").length;
  const localPausedCount = localFollowUpLogs.filter((l) => l.status === "paused").length;
  const pendingLogsBySequence = useMemo(
    () => [...localFollowUpLogs]
      .filter((l) => l.status === "pending" || l.status === "paused")
      .sort((a, b) => a.sequence - b.sequence || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [localFollowUpLogs]
  );

  const handleFollowUpAction = async (action: "pause" | "resume" | "restart" | "cancel") => {
    setFollowUpActioning(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error");
      toast.success(data.message);
      if (data.data) setLocalFollowUpLogs(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al gestionar seguimientos");
    } finally {
      setFollowUpActioning(false);
    }
  };

  const handleSendFollowUpNow = async (logId: string) => {
    setSendingLogId(logId);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/followups/send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || "Error");
      toast.success(data.message);
      if (data.data) setLocalFollowUpLogs(data.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar seguimiento");
    } finally {
      setSendingLogId(null);
    }
  };

  const followUpSection: DetailSection = {
    key: "followup",
    count: localFollowUpLogs.length,
    action: (
      <div className="flex items-center gap-1 flex-wrap">
        {localPendingCount > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={followUpActioning}
            onClick={() => handleFollowUpAction("pause")}>
            Pausar
          </Button>
        )}
        {localPausedCount > 0 && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={followUpActioning}
            onClick={() => handleFollowUpAction("resume")}>
            Reanudar
          </Button>
        )}
        {dealProposalSentAt && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={followUpActioning}
            onClick={() => handleFollowUpAction("restart")}>
            Reprogramar
          </Button>
        )}
        {localPendingCount > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" disabled={followUpActioning}
            onClick={() => handleFollowUpAction("cancel")}>
            Cancelar
          </Button>
        )}
        {canConfigureCrm && (
          <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
            <Link href="/opai/configuracion/crm#seguimientos-automaticos">Configurar</Link>
          </Button>
        )}
        {gmailConnected && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEmailOpen(true)}>
            <Send className="h-3.5 w-3.5 mr-1" /> Enviar correo
          </Button>
        )}
        {pendingLogsBySequence.map((log) => (
          <Button
            key={`quick-send-${log.id}`}
            size="sm"
            variant="default"
            className="h-7 text-xs"
            disabled={sendingLogId === log.id}
            onClick={() => handleSendFollowUpNow(log.id)}
          >
            {sendingLogId === log.id ? (
              <>Enviando...</>
            ) : (
              <>Enviar S{log.sequence} ahora</>
            )}
          </Button>
        ))}
      </div>
    ),
    children: (
        !deal.proposalSentAt && !deal.proposalLink && localFollowUpLogs.length === 0 ? (
          <EmptyState
            icon={<Clock3 className="h-8 w-8" />}
            title="Sin flujo activo"
            description="El seguimiento automático se activa cuando se envía una propuesta."
            compact
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FollowUpMetric
                label="Automatización"
                value={followUpConfig?.isActive === false ? "Pausada" : "Activa"}
                description={
                  followUpConfig
                    ? `Día ${followUpConfig.firstFollowUpDays}, ${followUpConfig.secondFollowUpDays} + ${followUpConfig.thirdFollowUpDays} días · ${String(followUpConfig.sendHour).padStart(2, "0")}:00`
                    : "Configuración por defecto"
                }
                tone={followUpConfig?.isActive === false ? "warning" : "success"}
              />
              <FollowUpMetric
                label="Seguimientos enviados"
                value={sentFollowUpsCount}
                description="Correos automáticos enviados"
                tone="default"
              />
              <FollowUpMetric
                label="Pendientes"
                value={pendingFollowUps.length}
                description={overdueFollowUpsCount > 0 ? `${overdueFollowUpsCount} vencidos` : "Sin vencidos"}
                tone={overdueFollowUpsCount > 0 ? "warning" : "success"}
              />
              <FollowUpMetric
                label="Fallidos"
                value={failedFollowUpsCount}
                description="Requieren revisión manual"
                tone={failedFollowUpsCount > 0 ? "danger" : "success"}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Al enviar seguimiento manual, el sistema envía correo inmediatamente y aplica cambio de etapa automático según configuración.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              {[1, 2, 3].map((sequence) => {
                const log = latestFollowUpBySequence[sequence];
                const statusMeta = getFollowUpStatusMeta(log?.status || "pending");
                const timingMeta = log?.status === "pending" ? getPendingTimingMeta(log.scheduledAt) : null;

                return (
                  <div key={sequence} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Seguimiento {sequence}
                        </p>
                        <p className="text-sm font-semibold mt-0.5">{statusMeta.label}</p>
                      </div>
                      <Badge variant="outline" className={statusMeta.className}>
                        {statusMeta.badge}
                      </Badge>
                    </div>

                    {!log ? (
                      <p className="text-xs text-muted-foreground mt-2">
                        Sin registro aún para esta etapa.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        <div className="text-xs text-muted-foreground space-y-1.5">
                          <p>
                            Programado: <span className="text-foreground">{formatDealDateTime(log.scheduledAt)}</span>
                          </p>
                          {timingMeta && (
                            <p className={timingMeta.className}>{timingMeta.label}</p>
                          )}
                          {log.sentAt && (
                            <p>
                              Enviado: <span className="text-foreground">{formatDealDateTime(log.sentAt)}</span>
                            </p>
                          )}
                          {log.error && (
                            <p className="text-red-500">Error: {log.error}</p>
                          )}
                          {log.emailMessage && (
                            <p className="text-muted-foreground/80">
                              {log.emailMessage.openCount} aperturas · {log.emailMessage.clickCount} clics
                            </p>
                          )}
                        </div>
                        {(log.status === "pending" || log.status === "paused") && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs mt-2"
                            disabled={sendingLogId === log.id}
                            onClick={() => handleSendFollowUpNow(log.id)}
                          >
                            {sendingLogId === log.id ? (
                              <>Enviando...</>
                            ) : (
                              <><Send className="h-3 w-3 mr-1" /> Enviar ahora</>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Historial de seguimientos
              </p>
              {localFollowUpLogsDesc.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay eventos de seguimiento registrados.
                </p>
              ) : (
                <div className="space-y-2">
                  {localFollowUpLogsDesc.map((log) => {
                    const statusMeta = getFollowUpStatusMeta(log.status);
                    const timingMeta = log.status === "pending" ? getPendingTimingMeta(log.scheduledAt) : null;
                    return (
                      <div key={log.id} className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              Seguimiento {log.sequence}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Programado: {formatDealDateTime(log.scheduledAt)}
                            </p>
                            {log.sentAt && (
                              <p className="text-xs text-muted-foreground">
                                Enviado: {formatDealDateTime(log.sentAt)}
                              </p>
                            )}
                            {timingMeta && (
                              <p className={`text-xs ${timingMeta.className}`}>{timingMeta.label}</p>
                            )}
                            {log.error && (
                              <p className="text-xs text-red-500">Error: {log.error}</p>
                            )}
                            {(log.status === "pending" || log.status === "paused") && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs mt-2"
                                disabled={sendingLogId === log.id}
                                onClick={() => handleSendFollowUpNow(log.id)}
                              >
                                {sendingLogId === log.id ? (
                                  <>Enviando...</>
                                ) : (
                                  <><Send className="h-3 w-3 mr-1" /> Enviar ahora</>
                                )}
                              </Button>
                            )}
                          </div>
                          <Badge variant="outline" className={statusMeta.className}>
                            {statusMeta.badge}
                          </Badge>
                        </div>

                        {log.emailMessage && (
                          <div className="mt-2 rounded-md border border-border/70 bg-muted/30 p-2.5 space-y-1.5">
                            <p className="text-xs font-medium truncate">
                              {log.emailMessage.subject || "Correo automático"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              Para: {log.emailMessage.toEmails?.join(", ") || "Sin destinatario"}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span>Estado mail: {formatEmailDeliveryStatus(log.emailMessage)}</span>
                              <span>Aperturas: {log.emailMessage.openCount}</span>
                              <span>Clics: {log.emailMessage.clickCount}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )
    ),
  };

  const quotesSection: DetailSection = {
    key: "quotes",
    label: "Cotizaciones",
    count: linkedQuotes.length,
    action: (
      <div className="flex items-center gap-1">
        <CreateQuoteModal
          defaultClientName={deal.account?.name ?? undefined}
          defaultDealName={deal.title}
          accountId={deal.account?.id}
          dealId={deal.id}
          onCreated={(_quoteId, dealQuote) => {
            if (dealQuote) {
              setLinkedQuotes((prev) => [...prev, dealQuote]);
            }
          }}
        />
        <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost">Vincular</Button>
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
      </div>
    ),
    children: linkedQuotes.length === 0 ? (
      <EmptyState icon={<QuotesIcon className="h-8 w-8" />} title="Sin cotizaciones" description="No hay cotizaciones vinculadas a este negocio." compact />
    ) : (
      <div className="space-y-2">
        {linkedQuotes.map((quote) => {
          const info = quotesById[quote.quoteId];
          const statusLabel = info?.status === "draft" ? "Borrador" : info?.status === "sent" ? "Enviada" : info?.status === "approved" ? "Aprobada" : info?.status === "rejected" ? "Rechazada" : info?.status || "Borrador";
          const statusVariant = info?.status === "approved" ? "success" : info?.status === "rejected" ? "destructive" : info?.status === "sent" ? "default" : "secondary";
          return (
            <CrmRelatedRecordCard
              key={quote.id}
              module="quotes"
              title={info?.code || "CPQ"}
              subtitle={info?.clientName || "Sin cliente"}
              meta={formatQuoteAmounts(info)}
              badge={{ label: statusLabel, variant: statusVariant as any }}
              href={`/crm/cotizaciones/${quote.quoteId}`}
            />
          );
        })}
      </div>
    ),
  };

  const installationsSection: DetailSection = {
    key: "installations",
    label: "Instalaciones de la cuenta",
    count: accountInstallations.length,
    keepMounted: true,
    action: deal.account?.id ? (
      <CrmSectionCreateButton onClick={() => createInstallationRef.current?.open()} />
    ) : undefined,
    children: deal.account?.id ? (
      <CrmInstallationsClient
        accountId={deal.account.id}
        accountIsActive={deal.account.isActive ?? true}
        initialInstallations={accountInstallations}
        createRef={createInstallationRef}
      />
    ) : (
      <EmptyState
        icon={<MapPin className="h-8 w-8" />}
        title="Sin cuenta"
        description="Vincula este negocio a una cuenta para crear instalaciones."
        compact
      />
    ),
  };

  const contactsSection: DetailSection = {
    key: "contacts",
    label: "Contactos del negocio",
    count: dealContacts.length,
    action: availableContacts.length > 0 ? (
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogTrigger asChild>
          <CrmSectionCreateButton />
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
            <Button onClick={addDealContact} disabled={addingContact}>{addingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ) : undefined,
    children: dealContacts.length === 0 ? (
      <EmptyState icon={<ContactsIcon className="h-8 w-8" />} title="Sin contactos" description="Vincula contactos de la cuenta a este negocio." compact />
    ) : (
      <div className="space-y-2">
        {dealContacts.map((dc) => {
          const c = dc.contact;
          return (
            <div key={dc.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 group">
              <Link href={`/crm/contacts/${c.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CRM_MODULES.contacts.color}`}>
                  <ContactsIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm group-hover:text-primary transition-colors truncate">{`${c.firstName} ${c.lastName}`.trim()}</p>
                    {dc.role === "primary" && <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">Principal</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{c.roleTitle || "Sin cargo"} · {c.email || "Sin email"}</p>
                </div>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                {dc.role !== "primary" && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" title="Marcar como principal" onClick={() => markPrimary(c.id)}>
                    <Star className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Desvincular" onClick={() => removeDealContact(c.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    ),
  };

  const communicationSection: DetailSection = {
    key: "communication",
    action: (
      <div className="flex items-center gap-1">
        {whatsappPhone && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-emerald-600 hover:text-emerald-500 hover:bg-emerald-500/10">
                <MessageSquare className="h-3.5 w-3.5 mr-1" /> WhatsApp
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
          <Button size="sm" variant="ghost" onClick={() => setEmailOpen(true)}>
            <Send className="h-3.5 w-3.5 mr-1" /> Enviar correo
          </Button>
        ) : (
          <Button asChild size="sm" variant="ghost">
            <Link href="/opai/configuracion/integraciones">Conectar Gmail</Link>
          </Button>
        )}
      </div>
    ),
    children: (
      <EmailHistoryList dealId={deal.id} compact onReply={gmailConnected ? handleReplyFromHistory : undefined} />
    ),
  };

  const notesSection: DetailSection = {
    key: "notes",
    children: <NotesSection entityType="deal" entityId={deal.id} currentUserId={currentUserId} />,
  };

  const filesSection: DetailSection = {
    key: "files",
    label: "Archivos",
    children: <FileAttachments entityType="deal" entityId={deal.id} title="Archivos" />,
  };

  const sections: DetailSection[] = [
    generalSection,
    contactsSection,
    installationsSection,
    quotesSection,
    followUpSection,
    communicationSection,
    notesSection,
    filesSection,
  ];

  return (
    <>
      <CrmDetailLayout
        pageType="deal"
        module="deals"
        title={deal.title}
        subtitle={subtitle}
        badge={statusBadge}
        backHref="/crm/deals"
        actions={[
          { label: "Enviar correo", icon: Mail, onClick: () => setEmailOpen(true), hidden: !gmailConnected },
          { label: "Eliminar negocio", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
        ]}
        sections={sections}
      />

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
    </>
  );
}

/* ── Helper Components ── */
function _InfoRowLegacy({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <div className="font-medium">{children}</div>
    </div>
  );
}

function FollowUpMetric({
  label,
  value,
  description,
  tone = "default",
}: {
  label: string;
  value: string | number;
  description?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : tone === "danger"
          ? "border-red-500/30 bg-red-500/5"
          : "border-border bg-card";

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

function formatDealDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFollowUpFlowStatus({
  proposalSentAt,
  proposalLink,
  config,
  totalLogs,
  pendingLogs,
  overdueLogs,
}: {
  proposalSentAt: string | null;
  proposalLink: string | null;
  config: FollowUpConfigState | null;
  totalLogs: number;
  pendingLogs: number;
  overdueLogs: number;
}) {
  if (!proposalSentAt && !proposalLink && totalLogs === 0) {
    return {
      label: "Sin iniciar",
      className: "text-[10px] border-muted text-muted-foreground",
    };
  }
  if (config?.isActive === false) {
    return {
      label: "Automatización pausada",
      className: "text-[10px] border-amber-500/30 text-amber-500",
    };
  }
  if (overdueLogs > 0) {
    return {
      label: "Con atrasos",
      className: "text-[10px] border-red-500/30 text-red-500",
    };
  }
  if (pendingLogs > 0) {
    return {
      label: "Activo",
      className: "text-[10px] border-emerald-500/30 text-emerald-500",
    };
  }
  if (totalLogs > 0) {
    return {
      label: "Completado",
      className: "text-[10px] border-blue-500/30 text-blue-500",
    };
  }
  return {
    label: "Sin eventos",
    className: "text-[10px] border-muted text-muted-foreground",
  };
}

function getFollowUpStatusMeta(status: string) {
  if (status === "sent") {
    return {
      label: "Enviado",
      badge: "Enviado",
      className: "text-[10px] border-emerald-500/30 text-emerald-500",
    };
  }
  if (status === "failed") {
    return {
      label: "Fallido",
      badge: "Fallido",
      className: "text-[10px] border-red-500/30 text-red-500",
    };
  }
  if (status === "cancelled") {
    return {
      label: "Cancelado",
      badge: "Cancelado",
      className: "text-[10px] border-muted text-muted-foreground",
    };
  }
  if (status === "paused") {
    return {
      label: "Pausado",
      badge: "Pausado",
      className: "text-[10px] border-amber-500/30 text-amber-500",
    };
  }
  return {
    label: "Programado",
    badge: "Pendiente",
    className: "text-[10px] border-blue-500/30 text-blue-500",
  };
}

function getPendingTimingMeta(scheduledAt: string) {
  const diffMs = new Date(scheduledAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return {
      label: "Vencido: requiere gestión inmediata.",
      className: "text-red-500",
    };
  }
  if (diffMs <= 24 * 60 * 60 * 1000) {
    return {
      label: "Programado para hoy.",
      className: "text-amber-500",
    };
  }
  return {
    label: "Programado en fecha futura.",
    className: "text-emerald-500",
  };
}

function formatEmailDeliveryStatus(email: FollowUpEmail) {
  if (email.bouncedAt) return "Rebotado";
  if (email.clickCount > 0) return "Con clic";
  if (email.openCount > 0) return "Abierto";
  if (email.deliveredAt) return "Entregado";
  if (email.sentAt) return "Enviado";
  return email.status || "En cola";
}
