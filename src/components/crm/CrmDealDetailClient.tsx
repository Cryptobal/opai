/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { cn, formatCLP, formatUFSuffix } from "@/lib/utils";
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
import { Loader2, ExternalLink, Trash2, FileText, Mail, ChevronRight, ChevronDown, Send, MessageSquare, Star, X, Clock3, MapPin, MoreHorizontal, Check, AlertCircle, Pause, Play, RotateCcw, XCircle, Settings2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmailHistoryList, type EmailMessage } from "@/components/crm/EmailHistoryList";
import { ContractEditor } from "@/components/docs/ContractEditor";
import { CrmDetailLayout, type DetailSection } from "./CrmDetailLayout";
import { DetailField, DetailFieldGrid } from "./DetailField";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
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
  totalGuards?: number | null;
  createdAt?: string;
  updatedAt?: string | null;
  parameters?: {
    salePriceMonthly?: string | number | null;
  } | null;
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
  activeQuotationId?: string | null;
  activeQuoteSummary?: {
    quoteId: string;
    code: string | null;
    status: string;
    amountClp: number;
    amountUf: number;
    totalGuards: number;
    isManual: boolean;
    sentAt: string | null;
  } | null;
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
  const [activeQuotationId, setActiveQuotationId] = useState<string | null>(
    deal.activeQuotationId ?? null
  );
  const [updatingActiveQuotation, setUpdatingActiveQuotation] = useState(false);

  useEffect(() => {
    setLinkedQuotes(deal.quotes || []);
  }, [deal.quotes]);

  useEffect(() => {
    setActiveQuotationId(deal.activeQuotationId ?? null);
  }, [deal.activeQuotationId]);

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

  // ── Deal edit state ──
  const [editDealOpen, setEditDealOpen] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealTitle, setDealTitle] = useState(deal.title);
  const [dealAmount, setDealAmount] = useState(deal.amount);
  const [editDealForm, setEditDealForm] = useState({
    title: deal.title,
    amount: deal.amount,
    proposalLink: deal.proposalLink || "",
  });

  const openDealEdit = () => {
    setEditDealForm({
      title: dealTitle,
      amount: dealAmount,
      proposalLink: dealProposalLink || "",
    });
    setEditDealOpen(true);
  };

  const saveDeal = async () => {
    if (!editDealForm.title.trim()) { toast.error("El título es obligatorio."); return; }
    setSavingDeal(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDealForm.title,
          amount: editDealForm.amount,
          proposalLink: editDealForm.proposalLink || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setDealTitle(editDealForm.title);
      setDealAmount(editDealForm.amount);
      if (typeof editDealForm.proposalLink === "string") {
        setDealProposalLink(editDealForm.proposalLink || null);
      }
      setEditDealOpen(false);
      toast.success("Negocio actualizado");
    } catch {
      toast.error("No se pudo actualizar el negocio.");
    } finally {
      setSavingDeal(false);
    }
  };

  const selectCn = "flex h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
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
    if (value === "__none__") { setSelectedTemplateId(""); return; }
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
      const salePriceMonthly = Number(quote.parameters?.salePriceMonthly ?? 0);
      const raw = salePriceMonthly > 0 ? salePriceMonthly : Number(quote.monthlyCost ?? 0);
      if (!Number.isFinite(raw) || raw <= 0) return "Monto no disponible";
      const safeUf = ufValue > 0 ? ufValue : 38000;
      // salePriceMonthly/monthlyCost are always stored in CLP; currency is display preference only
      const amountClp = raw;
      const amountUf = raw / safeUf;
      return `$${Math.round(amountClp).toLocaleString("es-CL")} · UF ${amountUf.toLocaleString("es-CL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    },
    [ufValue]
  );
  const sentLinkedQuotes = useMemo(() => {
    return linkedQuotes
      .map((quoteLink) => ({ quoteLink, quoteInfo: quotesById[quoteLink.quoteId] }))
      .filter(
        (entry): entry is { quoteLink: DealQuote; quoteInfo: QuoteOption } =>
          Boolean(entry.quoteInfo) && entry.quoteInfo.status === "sent"
      )
      .sort((a, b) => {
        const bTime = new Date(
          b.quoteInfo.updatedAt || b.quoteInfo.createdAt || 0
        ).getTime();
        const aTime = new Date(
          a.quoteInfo.updatedAt || a.quoteInfo.createdAt || 0
        ).getTime();
        return bTime - aTime;
      });
  }, [linkedQuotes, quotesById]);
  const activeQuotationSelectValue =
    activeQuotationId &&
    sentLinkedQuotes.some(({ quoteInfo }) => quoteInfo.id === activeQuotationId)
      ? activeQuotationId
      : "__auto__";
  const rawAmountClp = Number(deal.activeQuoteSummary?.amountClp ?? 0);
  const rawAmountUf = Number(deal.activeQuoteSummary?.amountUf ?? 0);
  const rawTotalGuards = Number(deal.activeQuoteSummary?.totalGuards ?? 0);
  const activeQuoteIndicators = {
    amountClp: Number.isFinite(rawAmountClp) ? rawAmountClp : 0,
    amountUf: Number.isFinite(rawAmountUf) ? rawAmountUf : 0,
    totalGuards: Number.isFinite(rawTotalGuards) ? rawTotalGuards : 0,
  };

  const updateActiveQuotation = async (value: string) => {
    const nextActiveQuotationId = value === "__auto__" ? null : value;
    const previousActiveQuotationId = activeQuotationId;
    setActiveQuotationId(nextActiveQuotationId);
    setUpdatingActiveQuotation(true);
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeQuotationId: nextActiveQuotationId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo actualizar la cotización activa.");
      }
      setActiveQuotationId(payload?.data?.activeQuotationId ?? nextActiveQuotationId);
      toast.success(
        nextActiveQuotationId
          ? "Cotización activa actualizada."
          : "Selección automática activada."
      );
      router.refresh();
    } catch (error: any) {
      setActiveQuotationId(previousActiveQuotationId ?? null);
      toast.error(error?.message || "No se pudo actualizar la cotización activa.");
    } finally {
      setUpdatingActiveQuotation(false);
    }
  };

  const linkQuote = async () => {
    if (!selectedQuoteId) { toast.error("Selecciona una cotización."); return; }
    setLinking(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId: selectedQuoteId }) });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error);
      setLinkedQuotes((prev) => [...prev, payload.data]); setSelectedQuoteId(""); setQuoteDialogOpen(false); toast.success("Cotización vinculada");
      router.refresh();
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
    formatCLP(activeQuoteIndicators.amountClp),
  ].filter(Boolean).join(" · ");

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
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border/70 bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Monto CLP
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatCLP(activeQuoteIndicators.amountClp)}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Monto UF
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatUFSuffix(activeQuoteIndicators.amountUf)}
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-card px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Guardias
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {activeQuoteIndicators.totalGuards.toLocaleString("es-CL")}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Cotización activa en negociación
          </Label>
          <Select
            value={activeQuotationSelectValue}
            onValueChange={(value) => void updateActiveQuotation(value)}
            disabled={updatingActiveQuotation || sentLinkedQuotes.length === 0}
          >
            <SelectTrigger className="h-8 text-xs max-w-xl">
              <SelectValue
                placeholder={
                  sentLinkedQuotes.length === 0
                    ? "Sin cotizaciones enviadas"
                    : "Selecciona cotización activa"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__auto__">
                Automática{" "}
                {linkedQuotes.length > 1
                  ? "(última enviada)"
                  : "(única cotización)"}
              </SelectItem>
              {sentLinkedQuotes.map(({ quoteInfo }) => {
                const quoteDate = quoteInfo.updatedAt || quoteInfo.createdAt || null;
                const quoteDateLabel = quoteDate
                  ? formatDealDate(quoteDate)
                  : "sin fecha";
                return (
                  <SelectItem key={quoteInfo.id} value={quoteInfo.id}>
                    {`${quoteInfo.code} · ${quoteDateLabel} · ${formatQuoteAmounts(
                      quoteInfo
                    )}`}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {deal.activeQuoteSummary
              ? `Actual: ${deal.activeQuoteSummary.code || "Sin código"} (${deal.activeQuoteSummary.isManual ? "selección manual" : "selección automática"}).`
              : "Sin cotización activa. El negocio mostrará $0 hasta tener una cotización enviada."}
          </p>
          {updatingActiveQuotation && (
            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando selección...
            </div>
          )}
        </div>

        <DetailFieldGrid columns={3}>
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
              <div className="flex items-center gap-2 min-w-0">
                <Select
                  value={currentStage?.id || ""}
                  onValueChange={(value) => updateStage(value)}
                  disabled={changingStage || pipelineStages.length === 0}
                >
                  <SelectTrigger className="h-8 text-xs min-w-0 max-w-[180px]">
                    <SelectValue placeholder="Sin etapas" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentStage?.id && !pipelineStages.some((stage) => stage.id === currentStage.id) && (
                      <SelectItem value={currentStage.id}>{currentStage.name}</SelectItem>
                    )}
                    {pipelineStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {changingStage && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
            }
          />
          <DetailField
            label="Monto negocio (manual)"
            value={dealAmount ? `$${Number(dealAmount).toLocaleString("es-CL")}` : undefined}
            mono
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
      </div>
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

  const [historyOpen, setHistoryOpen] = useState(false);

  const followUpHasActions = localPendingCount > 0 || localPausedCount > 0 || !!dealProposalSentAt || canConfigureCrm;

  const followUpSection: DetailSection = {
    key: "followup",
    count: localFollowUpLogs.length,
    action: followUpHasActions ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={followUpActioning}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {localPendingCount > 0 && (
            <DropdownMenuItem onClick={() => handleFollowUpAction("pause")}>
              <Pause className="h-3.5 w-3.5 mr-2" /> Pausar
            </DropdownMenuItem>
          )}
          {localPausedCount > 0 && (
            <DropdownMenuItem onClick={() => handleFollowUpAction("resume")}>
              <Play className="h-3.5 w-3.5 mr-2" /> Reanudar
            </DropdownMenuItem>
          )}
          {dealProposalSentAt && (
            <DropdownMenuItem onClick={() => handleFollowUpAction("restart")}>
              <RotateCcw className="h-3.5 w-3.5 mr-2" /> Reprogramar
            </DropdownMenuItem>
          )}
          {localPendingCount > 0 && (
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleFollowUpAction("cancel")}>
              <XCircle className="h-3.5 w-3.5 mr-2" /> Cancelar todo
            </DropdownMenuItem>
          )}
          {canConfigureCrm && (
            <DropdownMenuItem asChild>
              <Link href="/opai/configuracion/crm#seguimientos-automaticos">
                <Settings2 className="h-3.5 w-3.5 mr-2" /> Configurar
              </Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : undefined,
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
            {/* ── Inline summary ── */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className={followUpConfig?.isActive === false ? "text-[10px] border-amber-500/30 text-amber-500" : "text-[10px] border-emerald-500/30 text-emerald-500"}>
                {followUpConfig?.isActive === false ? "Pausada" : "Activa"}
              </Badge>
              {sentFollowUpsCount > 0 && (
                <span className="text-muted-foreground">{sentFollowUpsCount} enviado{sentFollowUpsCount !== 1 ? "s" : ""}</span>
              )}
              {pendingFollowUps.length > 0 && (
                <span className={overdueFollowUpsCount > 0 ? "text-amber-500" : "text-muted-foreground"}>
                  {pendingFollowUps.length} pendiente{pendingFollowUps.length !== 1 ? "s" : ""}
                  {overdueFollowUpsCount > 0 && ` (${overdueFollowUpsCount} vencido${overdueFollowUpsCount !== 1 ? "s" : ""})`}
                </span>
              )}
              {failedFollowUpsCount > 0 && (
                <span className="text-red-500">{failedFollowUpsCount} fallido{failedFollowUpsCount !== 1 ? "s" : ""}</span>
              )}
            </div>

            {/* ── Timeline stepper S1 → S2 → S3 ── */}
            <div className="flex items-start gap-0">
              {[1, 2, 3].map((sequence, idx) => {
                const log = latestFollowUpBySequence[sequence];
                const status = log?.status || "none";
                const isSent = status === "sent";
                const isPending = status === "pending" || status === "paused";
                const isFailed = status === "failed";

                const dotColor = isSent
                  ? "bg-emerald-500"
                  : isFailed
                    ? "bg-red-500"
                    : isPending
                      ? "bg-blue-500 animate-pulse"
                      : "bg-muted-foreground/30";

                const lineColor = isSent ? "bg-emerald-500/40" : "bg-border";

                return (
                  <div key={sequence} className="flex-1 flex flex-col items-center relative">
                    {/* Connector line */}
                    {idx > 0 && (
                      <div className={`absolute top-[7px] right-1/2 w-full h-px ${lineColor}`} />
                    )}

                    {/* Dot */}
                    <div className={`relative z-10 h-3.5 w-3.5 rounded-full ${dotColor} flex items-center justify-center`}>
                      {isSent && <Check className="h-2 w-2 text-white" />}
                      {isFailed && <AlertCircle className="h-2 w-2 text-white" />}
                    </div>

                    {/* Label */}
                    <p className="mt-1 text-[10px] font-medium text-foreground">S{sequence}</p>

                    {/* Date / status */}
                    <p className="text-[10px] text-muted-foreground leading-tight text-center">
                      {isSent && log?.sentAt
                        ? formatDealDate(log.sentAt)
                        : isPending && log
                          ? formatDealDate(log.scheduledAt)
                          : isFailed
                            ? "Fallido"
                            : "—"}
                    </p>

                    {/* Send now (only place) */}
                    {isPending && log && (
                      <button
                        type="button"
                        className="mt-0.5 text-[10px] text-primary hover:underline disabled:opacity-50"
                        disabled={sendingLogId === log.id}
                        onClick={() => handleSendFollowUpNow(log.id)}
                      >
                        {sendingLogId === log.id ? "Enviando…" : "Enviar ahora"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Collapsible history ── */}
            {localFollowUpLogsDesc.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((o) => !o)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {historyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  Historial ({localFollowUpLogsDesc.length})
                </button>

                {historyOpen && (
                  <div className="mt-2 space-y-1">
                    {localFollowUpLogsDesc.map((log) => {
                      const statusMeta = getFollowUpStatusMeta(log.status);
                      const borderColor = log.status === "sent"
                        ? "border-l-emerald-500"
                        : log.status === "failed"
                          ? "border-l-red-500"
                          : log.status === "pending"
                            ? "border-l-blue-500"
                            : log.status === "paused"
                              ? "border-l-amber-500"
                              : "border-l-muted";
                      return (
                        <div key={log.id} className={cn("flex items-center justify-between gap-3 rounded-md border-l-2 px-2.5 py-1.5 text-xs hover:bg-muted/40 transition-colors", borderColor)}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium shrink-0">S{log.sequence}</span>
                            <span className="text-muted-foreground truncate">
                              {log.sentAt ? formatDealDateTime(log.sentAt) : formatDealDateTime(log.scheduledAt)}
                            </span>
                            {log.emailMessage && (
                              <span className="text-muted-foreground/60 truncate hidden sm:inline">
                                {log.emailMessage.openCount > 0 && `${log.emailMessage.openCount} apert.`}
                                {log.emailMessage.clickCount > 0 && ` · ${log.emailMessage.clickCount} clic${log.emailMessage.clickCount !== 1 ? "s" : ""}`}
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className={statusMeta.className}>
                            {statusMeta.badge}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
            router.refresh();
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
      <CrmRelatedRecordGrid>
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
      </CrmRelatedRecordGrid>
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
      <CrmRelatedRecordGrid>
        {dealContacts.map((dc) => {
          const c = dc.contact;
          return (
            <CrmRelatedRecordCard
              key={dc.id}
              module="contacts"
              title={`${c.firstName} ${c.lastName}`.trim()}
              subtitle={c.roleTitle || "Sin cargo"}
              meta={c.email || undefined}
              badge={dc.role === "primary" ? { label: "Principal", variant: "default" } : undefined}
              href={`/crm/contacts/${c.id}`}
              actions={
                <div className="flex items-center gap-0.5" onClick={(e) => e.preventDefault()}>
                  {dc.role !== "primary" && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="Marcar como principal" aria-label="Marcar como principal" onClick={() => markPrimary(c.id)}>
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Desvincular contacto" aria-label="Desvincular contacto" onClick={() => removeDealContact(c.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              }
            />
          );
        })}
      </CrmRelatedRecordGrid>
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
        fixedSectionKey="general"
        title={dealTitle}
        subtitle={subtitle}
        badge={statusBadge}
        backHref="/crm/deals"
        actions={[
          { label: "Editar negocio", icon: Pencil, onClick: openDealEdit },
          { label: "Enviar correo", icon: Mail, onClick: () => setEmailOpen(true), hidden: !gmailConnected },
          { label: "Eliminar negocio", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
        ]}
        sections={sections}
      />

      {/* ── Email Compose Modal ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar correo</DialogTitle>
            <DialogDescription>Se enviará desde tu cuenta Gmail conectada. Tu firma se adjuntará automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Template</Label>
              <Select value={selectedTemplateId} onValueChange={(v) => selectTemplate(v)} disabled={sending}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin plantilla" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin plantilla</SelectItem>
                  {docTemplatesMail.map((t) => (
                    <SelectItem key={t.id} value={`doc:${t.id}`}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Para</Label>
                {!showCcBcc && <button type="button" onClick={() => setShowCcBcc(true)} className="text-[11px] text-primary hover:underline">CC / BCC</button>}
              </div>
              <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="correo@cliente.com" disabled={sending} />
            </div>
            {showCcBcc && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label className="text-xs">CC</Label><Input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="copia@empresa.com" disabled={sending} /></div>
                <div className="space-y-1.5"><Label className="text-xs">BCC</Label><Input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder="oculto@empresa.com" disabled={sending} /></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Asunto</Label>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Asunto" disabled={sending} />
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

      {/* ── Deal Edit Modal ── */}
      <Dialog open={editDealOpen} onOpenChange={setEditDealOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Editar negocio</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título *</Label>
              <Input value={editDealForm.title} onChange={(e) => setEditDealForm((p) => ({ ...p, title: e.target.value }))} placeholder="Nombre del negocio" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Monto</Label>
              <Input value={editDealForm.amount} onChange={(e) => setEditDealForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Link propuesta</Label>
              <Input value={editDealForm.proposalLink} onChange={(e) => setEditDealForm((p) => ({ ...p, proposalLink: e.target.value }))} placeholder="https://..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDealOpen(false)}>Cancelar</Button>
            <Button onClick={saveDeal} disabled={savingDeal}>
              {savingDeal && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
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

function formatDealDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
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
