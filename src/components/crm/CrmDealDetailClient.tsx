/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { cn, formatCLP, formatUFSuffix } from "@/lib/utils";
import { getQuoteStatus } from "@/lib/quoteStatus";
import { useRegisterChatPageContext } from "@/components/opai/ChatPageContextProvider";
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
import { Loader2, ExternalLink, Trash2, FileText, Mail, ChevronRight, ChevronDown, Send, MessageSquare, Star, X, Clock3, MapPin, MoreHorizontal, Check, AlertCircle, Pause, Play, RotateCcw, XCircle, Settings2, Pencil, Info, Users, Briefcase, CalendarClock, Phone, Link2, History, Copy, Building2, ListChecks, Ticket as TicketIcon } from "lucide-react";
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
import { EntityDetailLayout, useEntityTabs, type EntityTab, type EntityHeaderAction } from "./EntityDetailLayout";
import { DetailField } from "./DetailField";
import { CrmRelatedRecordCard, CrmRelatedRecordGrid } from "./CrmRelatedRecordCard";
import { CrmInstallationsClient } from "./CrmInstallationsClient";
import { CrmSectionCreateButton } from "./CrmSectionCreateButton";
import { CreateQuoteModal } from "@/components/cpq/CreateQuoteModal";
import { CRM_MODULES } from "./CrmModuleIcons";
import { formatWeekdaysShort } from "@/components/cpq/utils";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/opai-ds";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { toast } from "sonner";
import { OnboardingClientModal } from "@/components/crm/onboarding/OnboardingClientModal";
import { resolveDocument, tiptapToPlainText } from "@/lib/docs/token-resolver";
import { FileAttachments } from "./FileAttachments";
import { AssociatedRecordsPanel, type AssociatedSection } from "@/components/ui/AssociatedRecordsPanel";
import { CrmActivityTimeline } from "./CrmActivityTimeline";

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
  name?: string | null;
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
type PipelineStageOption = { id: string; name: string; color?: string | null; isClosedWon?: boolean; isClosedLost?: boolean; isAccepted?: boolean; };
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
type ActivityEvent = {
  id: string;
  action: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
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
  stage?: { id: string; name: string; color?: string | null } | null;
  account?: { id: string; name: string; isActive?: boolean } | null;
  primaryContactId?: string | null;
  primaryContact?: { firstName: string; lastName: string; email?: string | null; phone?: string | null } | null;
  quotes?: DealQuote[];
  proposalLink?: string | null;
  proposalSentAt?: string | null;
  serviceStartDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type InstallationRow = { id: string; name: string; address?: string | null; city?: string | null; commune?: string | null; lat?: number | null; lng?: number | null; status?: "prospect" | "active" | "inactive" };
type DocTemplateMail = { id: string; name: string; content: any };
type DocTemplateWhatsApp = { id: string; name: string; content: any };

function DealPipelineStepper({
  stages,
  currentStageId,
  dealStatus,
  onStageClick,
  onWonClick,
  onLostClick,
  disabled,
}: {
  stages: PipelineStageOption[];
  currentStageId: string | undefined;
  dealStatus: string | undefined;
  onStageClick: (stageId: string) => void;
  onWonClick: () => void;
  onLostClick: () => void;
  disabled?: boolean;
}) {
  const openStages = stages.filter((s) => !s.isClosedWon && !s.isClosedLost);
  const wonStage = stages.find((s) => s.isClosedWon);
  const lostStage = stages.find((s) => s.isClosedLost);
  const currentIdx = openStages.findIndex((s) => s.id === currentStageId);
  // El negocio se considera cerrado si dealStatus lo marca, o si la etapa seleccionada
  // es la etapa "ganado"/"perdido" (esto cubre el caso en que recién se hizo click en
  // Ganado y aún no se recargó el prop deal.status).
  const isWonByStage = !!wonStage && currentStageId === wonStage.id;
  const isLostByStage = !!lostStage && currentStageId === lostStage.id;
  const isWon = dealStatus === "won" || isWonByStage;
  const isLost = dealStatus === "lost" || isLostByStage;
  const isClosed = isWon || isLost;

  const currentOpenStage = currentIdx >= 0 ? openStages[currentIdx] : undefined;
  const closedStage = isWon ? wonStage : isLost ? lostStage : undefined;
  const closedColor = isWon ? "#10b981" : isLost ? "#ef4444" : "#94a3b8";
  const currentStageColor = isClosed
    ? closedStage?.color || closedColor
    : currentOpenStage?.color || "#94a3b8";

  // Etiqueta para el card "Etapa actual" en móvil
  const currentLabel = isWon
    ? "Ganado"
    : isLost
      ? "Perdido"
      : currentOpenStage?.name || "Sin etapa";
  const progressPct = isClosed
    ? 100
    : currentIdx >= 0 && openStages.length > 0
      ? ((currentIdx + 1) / openStages.length) * 100
      : 0;

  return (
    <div className="space-y-2 py-2 sm:space-y-0">
      {/* Mobile: indicador compacto de etapa actual + progreso */}
      <div className="sm:hidden space-y-2">
        {openStages.length > 0 && (
          <div
            className="rounded-md border px-3 py-2 transition-colors"
            style={{
              borderColor: isClosed ? `${currentStageColor}60` : undefined,
              backgroundColor: isClosed ? `${currentStageColor}10` : undefined,
            }}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="uppercase tracking-wider">Etapa actual</span>
              <span className="tabular-nums">
                {isClosed
                  ? "Cerrado"
                  : `${currentIdx >= 0 ? currentIdx + 1 : "–"} / ${openStages.length}`}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: currentStageColor }}
              />
              <span
                className="text-sm font-medium truncate"
                style={isClosed ? { color: currentStageColor } : undefined}
              >
                {currentLabel}
              </span>
            </div>
            {/* Progress bar */}
            <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  backgroundColor: currentStageColor,
                }}
              />
            </div>
          </div>
        )}

        {/* Scroll horizontal con chips compactas */}
        <div className="-mx-1 overflow-x-auto scrollbar-thin">
          <div className="flex flex-nowrap gap-1.5 px-1 pb-1">
            {openStages.map((stage, idx) => {
              const isCurrent = !isClosed && stage.id === currentStageId;
              const isPast = !isClosed && currentIdx >= 0 && idx < currentIdx;
              const isFuture = !isClosed && currentIdx >= 0 && idx > currentIdx;
              const stageColor = stage.color || "#94a3b8";
              return (
                <button
                  key={stage.id}
                  type="button"
                  disabled={disabled || isClosed}
                  onClick={() => onStageClick(stage.id)}
                  className={cn(
                    "flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isClosed && "opacity-50 cursor-not-allowed",
                    !isClosed && !isCurrent && "cursor-pointer hover:brightness-110",
                    isCurrent && "text-white border-transparent shadow-sm",
                    isPast && "text-white/90 border-transparent",
                    isFuture && "bg-background text-muted-foreground border-border",
                  )}
                  style={
                    isCurrent
                      ? { backgroundColor: stageColor }
                      : isPast
                        ? { backgroundColor: `${stageColor}80` }
                        : undefined
                  }
                  title={stage.name}
                >
                  {isPast && <Check className="h-3 w-3 shrink-0" />}
                  <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-black/20 text-[9px] tabular-nums">
                    {idx + 1}
                  </span>
                  <span>{stage.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ganado / Perdido */}
        <div className="flex flex-row gap-2">
          {wonStage && (
            <button
              type="button"
              disabled={disabled}
              onClick={onWonClick}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isWon
                  ? "bg-status-ok-soft text-status-ok-fg border border-status-ok-border shadow-sm"
                  : "border border-border text-muted-foreground hover:border-status-ok-border hover:text-status-ok-fg hover:bg-status-ok-soft"
              )}
            >
              <Check className="h-3 w-3" />
              Ganado
            </button>
          )}
          {lostStage && (
            <button
              type="button"
              disabled={disabled}
              onClick={onLostClick}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isLost
                  ? "bg-status-danger-soft text-status-danger-fg border border-status-danger-border shadow-sm"
                  : "border border-border text-muted-foreground hover:border-status-danger-border hover:text-status-danger-fg hover:bg-status-danger-soft"
              )}
            >
              <XCircle className="h-3 w-3" />
              Perdido
            </button>
          )}
        </div>
      </div>

      {/* Desktop: chevrons tradicionales */}
      <div className="hidden sm:flex sm:items-center gap-2 sm:overflow-x-auto scrollbar-thin">
        <div className="flex sm:flex-row sm:items-stretch sm:min-w-0">
          {openStages.map((stage, idx) => {
            const isCurrent = !isClosed && stage.id === currentStageId;
            const isPast = !isClosed && currentIdx >= 0 && idx < currentIdx;
            const isFuture = !isClosed && currentIdx >= 0 && idx > currentIdx;
            const isFirst = idx === 0;
            const isLast = idx === openStages.length - 1;
            const stageColor = stage.color || "#94a3b8";

            const chevronVariant = openStages.length === 1 ? "only" : isFirst ? "first" : isLast ? "last" : "middle";

            return (
              <button
                key={stage.id}
                type="button"
                disabled={disabled || isClosed}
                onClick={() => onStageClick(stage.id)}
                data-chevron={openStages.length > 1 ? chevronVariant : undefined}
                className={cn(
                  "relative flex items-center justify-center px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  "min-w-0",
                  openStages.length > 1 ? "rounded-none pipeline-step-chevron" : "rounded-md",
                  !isFirst && "-ml-[6px]",
                  isClosed && "opacity-50 cursor-not-allowed",
                  !isClosed && !isCurrent && "cursor-pointer hover:brightness-110",
                  isCurrent && "text-white shadow-sm",
                  isPast && "text-white/80",
                  isFuture && "bg-muted text-muted-foreground",
                )}
                style={
                  isCurrent
                    ? { backgroundColor: stageColor }
                    : isPast
                      ? { backgroundColor: `${stageColor}60` }
                      : undefined
                }
                title={stage.name}
              >
                {isPast && <Check className="h-3 w-3 mr-1 shrink-0" />}
                <span className="truncate max-w-[120px] text-center">{stage.name}</span>
              </button>
            );
          })}
        </div>

        <div className="h-5 w-px bg-border shrink-0" />

        <div className="flex flex-row gap-2 shrink-0">
          {wonStage && (
            <button
              type="button"
              disabled={disabled}
              onClick={onWonClick}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isWon
                  ? "bg-status-ok-soft text-status-ok-fg border border-status-ok-border shadow-sm"
                  : "border border-border text-muted-foreground hover:border-status-ok-border hover:text-status-ok-fg hover:bg-status-ok-soft"
              )}
            >
              <Check className="h-3 w-3" />
              Ganado
            </button>
          )}
          {lostStage && (
            <button
              type="button"
              disabled={disabled}
              onClick={onLostClick}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isLost
                  ? "bg-status-danger-soft text-status-danger-fg border border-status-danger-border shadow-sm"
                  : "border border-border text-muted-foreground hover:border-status-danger-border hover:text-status-danger-fg hover:bg-status-danger-soft"
              )}
            >
              <XCircle className="h-3 w-3" />
              Perdido
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CrmDealDetailClient({
  deal, quotes, pipelineStages, dealContacts: initialDealContacts, accountContacts, accountInstallations = [], gmailConnected, docTemplatesMail = [], docTemplatesWhatsApp = [], followUpConfig = null, followUpLogs = [], activityEvents = [], ufValue, canConfigureCrm = false, currentUserId = "",
}: {
  deal: DealDetail; quotes: QuoteOption[];
  pipelineStages: PipelineStageOption[];
  dealContacts: DealContactRow[]; accountContacts: ContactRow[];
  accountInstallations?: InstallationRow[];
  gmailConnected: boolean; docTemplatesMail?: DocTemplateMail[]; docTemplatesWhatsApp?: DocTemplateWhatsApp[];
  followUpConfig?: FollowUpConfigState | null;
  followUpLogs?: FollowUpLog[];
  activityEvents?: ActivityEvent[];
  ufValue: number;
  canConfigureCrm?: boolean;
  currentUserId?: string;
}) {
  // Contexto de página para OPAI Intelligence (chat contextual tipo Notion)
  useRegisterChatPageContext({
    entityType: "crm_deal",
    entityId: deal.id,
    entityName: deal.title,
    entityUrl: `/crm/deals/${deal.id}`,
  });

  // ── Quote linking & creation state ──
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteCreateOpen, setQuoteCreateOpen] = useState(false);
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
  const [accountContactsList, setAccountContactsList] = useState<ContactRow[]>(accountContacts);
  const [addingContact, setAddingContact] = useState(false);
  const [linkContactConfirmOpen, setLinkContactConfirmOpen] = useState(false);
  const [linkContactId, setLinkContactId] = useState<string | null>(null);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "" });

  useEffect(() => {
    setAccountContactsList(accountContacts);
  }, [accountContacts]);
  const [currentStage, setCurrentStage] = useState<DealDetail["stage"]>(deal.stage || null);
  const [changingStage, setChangingStage] = useState(false);
  const [wonConfirmOpen, setWonConfirmOpen] = useState(false);
  const [pendingWonStageId, setPendingWonStageId] = useState<string | null>(null);
  const [acceptedDialogOpen, setAcceptedDialogOpen] = useState(false);
  const [pendingAcceptedStageId, setPendingAcceptedStageId] = useState<string | null>(null);
  const [acceptedDate, setAcceptedDate] = useState("");
  const [dealServiceStartDate, setDealServiceStartDate] = useState(deal.serviceStartDate || null);
  const [dealTitle, setDealTitle] = useState(deal.title);
  const [onboardingTarget, setOnboardingTarget] = useState<
    { dealId: string; defaultPlaybookId?: string } | null
  >(null);
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
    }).catch(() => { });
  }, []);

  const router = useRouter();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const createInstallationRef = useRef<{ open: () => void } | null>(null);

  // ── WhatsApp Adjudicado state ──
  const [waAdjudicadoOpen, setWaAdjudicadoOpen] = useState(false);
  const [waAdjudicadoMsg, setWaAdjudicadoMsg] = useState("");
  const [waAdjudicadoLoading, setWaAdjudicadoLoading] = useState(false);

  type QuotePositionRow = {
    customName?: string | null;
    weekdays: string[];
    startTime: string;
    endTime: string;
    numGuards: number;
    baseSalary: number;
    employerCost: number;
    netSalary?: number | null;
    puestoTrabajo?: { name: string } | null;
    cargo?: { name: string } | null;
  };

  const buildAdjudicadoMessage = useCallback((positions: QuotePositionRow[]) => {
    const lines: string[] = [];
    const contactName = deal.primaryContact ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim() : "—";
    const contactEmail = deal.primaryContact?.email || "—";
    const contactPhone = deal.primaryContact?.phone || "—";
    const accountName = deal.account?.name || "—";
    const install = accountInstallations[0];
    const installName = install?.name || "—";
    const installAddress = [install?.address, install?.commune, install?.city].filter(Boolean).join(", ") || "—";
    const hasCoords = install && typeof install.lat === "number" && typeof install.lng === "number";
    const mapsLink = hasCoords ? `https://maps.google.com/?q=${install.lat},${install.lng}` : null;
    const startDate = dealServiceStartDate
      ? new Date(dealServiceStartDate).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })
      : "—";
    const activeQuote = deal.activeQuoteSummary;
    const quoteCode = activeQuote?.code || "Sin código";
    const totalGuards = activeQuote?.totalGuards ?? positions.reduce((sum, p) => sum + p.numGuards, 0);
    const opaiUrl = typeof window !== "undefined" ? `${window.location.origin}/crm/deals/${deal.id}` : `/crm/deals/${deal.id}`;

    lines.push("*NEGOCIO ADJUDICADO*");
    lines.push("");
    lines.push("*Datos del Negocio*");
    lines.push(`Negocio: ${dealTitle}`);
    lines.push(`Cliente: ${accountName}`);
    lines.push(`Etapa: ${currentStage?.name || "Adjudicado"}`);
    lines.push("");
    lines.push("*Contacto Principal*");
    lines.push(`Nombre: ${contactName}`);
    lines.push(`Email: ${contactEmail}`);
    lines.push(`Celular: ${contactPhone}`);
    lines.push("");
    lines.push("*Instalacion*");
    lines.push(`Nombre: ${installName}`);
    lines.push(`Direccion: ${installAddress}`);
    if (mapsLink) lines.push(`Google Maps: ${mapsLink}`);
    lines.push("");
    lines.push("*Fecha de Inicio del Servicio*");
    lines.push(startDate);
    lines.push("");
    lines.push(`*Detalle de la Cotizacion (${quoteCode})*`);

    if (positions.length > 0) {
      lines.push("");
      lines.push("*Dotacion de Personal*");
      for (const pos of positions) {
        const cargoName = pos.cargo?.name || "Guardia";
        const puestoName = pos.puestoTrabajo?.name || "Sin puesto";
        const days = formatWeekdaysShort(pos.weekdays);
        const netPay = pos.netSalary ? `$${Math.round(pos.netSalary).toLocaleString("es-CL")}` : "—";
        lines.push("");
        lines.push(`- ${cargoName} — Puesto: ${puestoName}`);
        if (pos.customName) lines.push(`  Nombre: ${pos.customName}`);
        lines.push(`  Dias: ${days} | Horario: ${pos.startTime} - ${pos.endTime}`);
        lines.push(`  Guardias: ${pos.numGuards} | Sueldo liquido: ${netPay}`);
      }
      lines.push("");
      lines.push(`Total guardias: ${totalGuards}`);
    }

    lines.push("");
    lines.push("*Ver negocio en OPAI*");
    lines.push(opaiUrl);
    lines.push("");
    lines.push("---");
    lines.push("Mensaje generado automaticamente desde OPAI");

    return lines.join("\n");
  }, [deal, dealTitle, dealServiceStartDate, currentStage, accountInstallations]);

  const openWaAdjudicado = async () => {
    setWaAdjudicadoLoading(true);
    setWaAdjudicadoOpen(true);
    let positions: QuotePositionRow[] = [];
    const quoteId = deal.activeQuoteSummary?.quoteId || activeQuotationId;
    if (quoteId) {
      try {
        const res = await fetch(`/api/cpq/quotes/${quoteId}`);
        const data = await res.json();
        if (data.success && data.data?.positions) {
          positions = data.data.positions;
        }
      } catch { /* ignore */ }
    }
    setWaAdjudicadoMsg(buildAdjudicadoMessage(positions));
    setWaAdjudicadoLoading(false);
  };

  const sendWaAdjudicado = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(waAdjudicadoMsg)}`, "_blank");
  };

  const copyWaAdjudicado = () => {
    navigator.clipboard.writeText(waAdjudicadoMsg).then(() => toast.success("Mensaje copiado al portapapeles"));
  };

  // ── Deal edit state ──
  const [editDealOpen, setEditDealOpen] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealAmount, setDealAmount] = useState(deal.amount);
  const [accountOptions, setAccountOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [editDealForm, setEditDealForm] = useState({
    title: deal.title,
    amount: deal.amount,
    proposalLink: deal.proposalLink || "",
    accountId: deal.account?.id ?? "",
  });

  const openDealEdit = () => {
    setEditDealForm({
      title: dealTitle,
      amount: dealAmount,
      proposalLink: dealProposalLink || "",
      accountId: deal.account?.id ?? "",
    });
    if (accountOptions.length === 0) {
      fetch("/api/crm/accounts")
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) {
            setAccountOptions(d.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
          }
        })
        .catch(() => {});
    }
    setEditDealOpen(true);
  };

  const saveDeal = async () => {
    if (!editDealForm.title.trim()) { toast.error("El título es obligatorio."); return; }
    if (!editDealForm.accountId) { toast.error("Selecciona una cuenta."); return; }
    setSavingDeal(true);
    try {
      const res = await fetch(`/api/crm/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editDealForm.title,
          amount: Number(editDealForm.amount) || 0,
          proposalLink: editDealForm.proposalLink || null,
          accountId: editDealForm.accountId || undefined,
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
      if (editDealForm.accountId !== deal.account?.id) {
        router.refresh();
      }
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
          Boolean(entry.quoteInfo) &&
          (entry.quoteInfo.status === "sent" || entry.quoteInfo.status === "approved")
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
  const dealContactByContactId = useMemo(() => {
    const m = new Map<string, DealContactRow>();
    for (const dc of dealContacts) m.set(dc.contactId, dc);
    return m;
  }, [dealContacts]);

  const addDealContact = async (contactId: string) => {
    setAddingContact(true);
    setLinkContactId(contactId);
    try {
      const role = dealContacts.length === 0 ? "primary" : "participant";
      const res = await fetch(`/api/crm/deals/${deal.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setDealContacts((prev) => [...prev, data.data]);
      toast.success("Contacto vinculado al negocio");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo vincular.");
    } finally {
      setAddingContact(false);
      setLinkContactId(null);
    }
  };

  const createContact = async () => {
    const accountId = deal.account?.id;
    if (!accountId) { toast.error("Este negocio no tiene cuenta asociada."); return; }
    const { firstName, lastName, email, phone, roleTitle } = newContactForm;
    if (!firstName.trim() || !lastName.trim()) { toast.error("Nombre y apellido son obligatorios."); return; }
    if (!email.trim()) { toast.error("Email es obligatorio."); return; }
    setCreatingContact(true);
    try {
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          roleTitle: roleTitle.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      const created = data.data as ContactRow;
      setAccountContactsList((prev) => [...prev, created]);
      setNewContactForm({ firstName: "", lastName: "", email: "", phone: "", roleTitle: "" });
      setNewContactOpen(false);
      toast.success("Contacto creado");
      setCreatingContact(false);
      // Vincular automáticamente si no hay contactos en el negocio
      if (dealContacts.length === 0) {
        await addDealContact(created.id);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el contacto.");
      setCreatingContact(false);
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

  const updateStage = async (stageId: string, extraBody?: Record<string, unknown>) => {
    if (!stageId || currentStage?.id === stageId) return;
    const nextStage = pipelineStages.find((stage) => stage.id === stageId);
    if (!nextStage) return;

    // Si la etapa es "aceptada" y no viene serviceStartDate, mostrar dialog
    if (nextStage.isAccepted && !extraBody?.serviceStartDate) {
      setPendingAcceptedStageId(stageId);
      setAcceptedDate("");
      setAcceptedDialogOpen(true);
      return;
    }

    const snapshot = currentStage;
    setCurrentStage({ id: nextStage.id, name: nextStage.name, color: nextStage.color });
    setChangingStage(true);
    try {
      const response = await fetch(`/api/crm/deals/${deal.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId, ...extraBody }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error cambiando etapa");
      setCurrentStage(
        payload.data?.stage
          ? { id: payload.data.stage.id, name: payload.data.stage.name, color: payload.data.stage.color || nextStage.color }
          : { id: nextStage.id, name: nextStage.name, color: nextStage.color }
      );
      if (payload.data?.proposalSentAt) {
        setDealProposalSentAt(payload.data.proposalSentAt);
      }
      if (typeof payload.data?.proposalLink === "string") {
        setDealProposalLink(payload.data.proposalLink);
      }
      if (payload.data?.serviceStartDate) {
        setDealServiceStartDate(payload.data.serviceStartDate);
      }
      const willOpenOnboarding =
        !!(payload?.requiresOnboarding && payload?.defaultPlaybookId) ||
        !!payload?.existingOnboarding?.id;
      if (payload?.requiresOnboarding && payload?.defaultPlaybookId) {
        setOnboardingTarget({
          dealId: deal.id,
          defaultPlaybookId: payload.defaultPlaybookId,
        });
      } else if (
        payload?.existingOnboarding?.id &&
        payload?.existingOnboarding?.accountId
      ) {
        const accountId = payload.existingOnboarding.accountId as string;
        const onboardingId = payload.existingOnboarding.id as string;
        toast.success("Negocio ganado. Onboarding ya iniciado.", {
          action: {
            label: "Ver onboarding",
            onClick: () =>
              router.push(
                `/crm/accounts/${accountId}/onboarding/${onboardingId}`,
              ),
          },
          duration: 8000,
        });
      }
      if (!willOpenOnboarding) {
        toast.success("Etapa actualizada");
      }
    } catch (error) {
      console.error(error);
      setCurrentStage(snapshot);
      toast.error("No se pudo actualizar la etapa.");
    } finally {
      setChangingStage(false);
    }
  };

  const confirmAccepted = async () => {
    if (!pendingAcceptedStageId || !acceptedDate) return;
    setAcceptedDialogOpen(false);
    await updateStage(pendingAcceptedStageId, { serviceStartDate: acceptedDate });
    setPendingAcceptedStageId(null);
  };

  const handleWonClick = () => {
    const wonStage = pipelineStages.find((s) => s.isClosedWon);
    if (!wonStage) return;
    setPendingWonStageId(wonStage.id);
    setWonConfirmOpen(true);
  };

  const confirmWon = async () => {
    if (!pendingWonStageId) return;
    setWonConfirmOpen(false);
    await updateStage(pendingWonStageId);
    setPendingWonStageId(null);
  };

  const handleLostClick = () => {
    const lostStage = pipelineStages.find((s) => s.isClosedLost);
    if (lostStage) updateStage(lostStage.id);
  };

  // ── Helpers ──
  const ContactsIcon = CRM_MODULES.contacts.icon;
  const InstallationsIcon = CRM_MODULES.installations.icon;
  const QuotesIcon = CRM_MODULES.quotes.icon;
  const FollowUpIcon = Clock3;

  const currentStageColor = currentStage?.color
    || pipelineStages.find((s) => s.id === currentStage?.id)?.color
    || "#94a3b8";

  const statusBadge = deal.status === "won"
    ? { label: "Ganado", variant: "success" as const }
    : deal.status === "lost"
      ? { label: "Perdido", variant: "destructive" as const }
      : currentStage
        ? { label: currentStage.name, color: currentStageColor }
        : undefined;

  // ── Sections ──
  // Patrón unificado con Account/Installation/Contact:
  //   hero (identidad + chips) → stats strip (montos/guardias) →
  //   widget cotización activa → colapsables (seguimiento + detalles técnicos).
  const generalSection = {
    key: "general",
    label: "Resumen del negocio",
    children: (
      <div className="space-y-3 sm:space-y-4">
        {/* ── Hero: identidad (estado + cliente + contacto) ── */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {deal.status === "won" && (
              <Badge variant="outline" className="border-status-ok-border text-status-ok-fg">
                <span className="mr-1 inline-flex h-1.5 w-1.5 rounded-full bg-status-ok" />
                Ganado
              </Badge>
            )}
            {deal.status === "lost" && (
              <Badge variant="outline" className="border-status-danger-border text-status-danger-fg">
                <span className="mr-1 inline-flex h-1.5 w-1.5 rounded-full bg-status-danger" />
                Perdido
              </Badge>
            )}
            {deal.status === "open" && currentStage && (
              <Badge
                variant="outline"
                style={{ borderColor: `${currentStageColor}40`, color: currentStageColor, backgroundColor: `${currentStageColor}15` }}
              >
                <span className="mr-1 inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: currentStageColor }} />
                {currentStage.name}
              </Badge>
            )}
            {deal.account && (
              <Link
                href={`/crm/accounts/${deal.account.id}`}
                className="inline-flex items-center gap-1 truncate rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-muted/50"
              >
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[180px] sm:max-w-xs">{deal.account.name}</span>
              </Link>
            )}
            {deal.primaryContact && deal.primaryContactId && (
              <Link
                href={`/crm/contacts/${deal.primaryContactId}`}
                className="inline-flex items-center gap-1 truncate rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-muted/50"
              >
                <Users className="h-3 w-3 shrink-0" />
                <span className="truncate max-w-[180px] sm:max-w-xs">
                  {`${deal.primaryContact.firstName} ${deal.primaryContact.lastName}`.trim()}
                </span>
              </Link>
            )}
            {changingStage && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Cambiando etapa…
              </span>
            )}
          </div>
          {dealServiceStartDate && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-status-info-fg">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              Inicio del servicio:{" "}
              {new Date(dealServiceStartDate).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
          )}
        </div>

        {/* ── Stats strip: montos y volumen. Se conservan colores por ser métricas clave. ── */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <div className="min-w-0 rounded-xl border border-status-ok-border bg-status-ok-soft p-3 sm:p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-status-ok-fg/80">Monto CLP</div>
            <div className="truncate text-[13px] font-semibold tabular-nums text-status-ok-fg">
              {formatCLP(activeQuoteIndicators.amountClp)}
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-status-info-border bg-status-info-soft p-3 sm:p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-status-info-fg/80">Monto UF</div>
            <div className="truncate text-[13px] font-semibold tabular-nums text-status-info-fg">
              {formatUFSuffix(activeQuoteIndicators.amountUf)}
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-status-warn-border bg-status-warn-soft p-3 sm:p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-status-warn-fg/80">Guardias</div>
            <div className="truncate text-[13px] font-semibold tabular-nums text-status-warn-fg">
              {activeQuoteIndicators.totalGuards.toLocaleString("es-CL")}
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">Monto manual</div>
            <div className="truncate font-mono text-[13px] font-medium tabular-nums text-foreground">
              {dealAmount
                ? `$${Number(dealAmount).toLocaleString("es-CL")}`
                : <span className="font-sans text-muted-foreground/70">—</span>}
            </div>
          </div>
        </div>

        {/* ── Cotización activa (widget dedicado, funcionalidad intacta) ── */}
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
          <Label>
            Cotización activa en negociación
          </Label>
          <Select
            value={activeQuotationSelectValue}
            onValueChange={(value) => void updateActiveQuotation(value)}
            disabled={updatingActiveQuotation || sentLinkedQuotes.length === 0}
          >
            <SelectTrigger className="h-auto min-h-8 text-xs max-w-xl">
              <SelectValue
                placeholder={
                  sentLinkedQuotes.length === 0
                    ? "Sin cotizaciones enviadas"
                    : "Selecciona cotización activa"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-24px)]">
              <SelectItem value="__auto__" className="whitespace-normal break-words pr-2">
                {(() => {
                  const autoSummary = deal.activeQuoteSummary?.code
                    ? ` · usando ${deal.activeQuoteSummary.code}`
                    : "";
                  const baseLabel =
                    linkedQuotes.length > 1
                      ? "Automática (última enviada)"
                      : "Automática (única cotización)";
                  return `${baseLabel}${autoSummary}`;
                })()}
              </SelectItem>
              {sentLinkedQuotes.map(({ quoteInfo }) => {
                const quoteDate = quoteInfo.updatedAt || quoteInfo.createdAt || null;
                const quoteDateLabel = quoteDate
                  ? formatDealDate(quoteDate)
                  : "sin fecha";
                const quoteLabel = quoteInfo.name
                  ? `${quoteInfo.code} — ${quoteInfo.name}`
                  : quoteInfo.code;
                const statusSuffix = quoteInfo.status === "approved" ? " · Aprobada" : "";
                return (
                  <SelectItem
                    key={quoteInfo.id}
                    value={quoteInfo.id}
                    className="whitespace-normal break-words pr-2"
                  >
                    {`${quoteLabel} · ${quoteDateLabel} · ${formatQuoteAmounts(quoteInfo)}${statusSuffix}`}
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

        {/* ── Seguimiento y propuesta (colapsable) ── */}
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none select-none items-center justify-between px-4 py-3 transition-colors hover:bg-muted/20">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Seguimiento y propuesta
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 pb-4 pt-1 sm:grid-cols-2">
            <DetailField
              label="Flujo seguimiento"
              value={<Badge variant="outline" className={followUpFlowStatus.className}>{followUpFlowStatus.label}</Badge>}
            />
            <DetailField
              label="Link propuesta"
              value={dealProposalLink ? (
                <a href={dealProposalLink} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                  Ver propuesta<ExternalLink className="h-3 w-3" />
                </a>
              ) : undefined}
            />
          </div>
        </details>

        {/* ── Detalles técnicos (colapsable) ── */}
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none select-none items-center justify-between px-4 py-3 transition-colors hover:bg-muted/20">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Detalles técnicos
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 px-4 pb-4 pt-1 sm:grid-cols-2">
            <DetailField
              label="Fecha creación"
              value={
                deal.createdAt
                  ? new Date(deal.createdAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—"
              }
            />
            <DetailField
              label="Última modificación"
              value={
                deal.updatedAt
                  ? new Date(deal.updatedAt).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—"
              }
            />
          </div>
        </details>
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

  const followUpSection = {
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
            <Badge variant="outline" className={followUpConfig?.isActive === false ? "text-[10px] border-status-warn-border text-status-warn-fg" : "text-[10px] border-status-ok-border text-status-ok-fg"}>
              {followUpConfig?.isActive === false ? "Pausada" : "Activa"}
            </Badge>
            {sentFollowUpsCount > 0 && (
              <span className="text-muted-foreground">{sentFollowUpsCount} enviado{sentFollowUpsCount !== 1 ? "s" : ""}</span>
            )}
            {pendingFollowUps.length > 0 && (
              <span className={overdueFollowUpsCount > 0 ? "text-status-warn-fg" : "text-muted-foreground"}>
                {pendingFollowUps.length} pendiente{pendingFollowUps.length !== 1 ? "s" : ""}
                {overdueFollowUpsCount > 0 && ` (${overdueFollowUpsCount} vencido${overdueFollowUpsCount !== 1 ? "s" : ""})`}
              </span>
            )}
            {failedFollowUpsCount > 0 && (
              <span className="text-status-danger-fg">{failedFollowUpsCount} fallido{failedFollowUpsCount !== 1 ? "s" : ""}</span>
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
                ? "bg-status-ok"
                : isFailed
                  ? "bg-status-danger"
                  : isPending
                    ? "bg-status-info animate-pulse"
                    : "bg-muted-foreground/30";

              const lineColor = isSent ? "bg-status-ok/40" : "bg-border";

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

  const communicationSection = {
    key: "communication",
    action: (
      <div className="flex items-center gap-1">
        {whatsappPhone && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="text-status-ok-fg hover:text-status-ok-fg hover:bg-status-ok-soft">
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

  const filesSection = {
    key: "files",
    label: "Documentos",
    children: <FileAttachments entityType="deal" entityId={deal.id} title="Documentos" />,
  };

  const associatedSections: AssociatedSection[] = [
    {
      id: "contacts",
      label: "Contactos de la cuenta",
      icon: ContactsIcon,
      count: accountContactsList.length,
      content: !deal.account?.id ? (
        <EmptyState icon={<ContactsIcon className="h-8 w-8" />} title="Sin cuenta" description="Vincula este negocio a una cuenta para ver y gestionar contactos." compact />
      ) : accountContactsList.length === 0 ? (
        <EmptyState icon={<ContactsIcon className="h-8 w-8" />} title="Sin contactos" description="Crea un contacto para esta cuenta." compact />
      ) : (
        <CrmRelatedRecordGrid className="!grid-cols-1">
          {accountContactsList.map((c) => {
            const dc = dealContactByContactId.get(c.id);
            const isLinked = !!dc;
            const contactName = `${c.firstName} ${c.lastName}`.trim();
            return (
              <CrmRelatedRecordCard
                key={c.id}
                module="contacts"
                title={contactName}
                subtitle={c.roleTitle || "Sin cargo"}
                meta={c.email || undefined}
                titleTruncate={false}
                badge={dc?.role === "primary" ? { label: "Principal", variant: "default" } : dc ? { label: "Vinculado", variant: "secondary" } : undefined}
                href={`/crm/contacts/${c.id}`}
                actions={
                  <div className="flex items-center gap-0.5" onClick={(e) => e.preventDefault()}>
                    {isLinked ? (
                      <>
                        {dc!.role !== "primary" && (
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Marcar como principal" aria-label="Marcar como principal" onClick={() => markPrimary(c.id)}>
                            <Star className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Desvincular contacto" aria-label="Desvincular contacto" onClick={() => removeDealContact(c.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-status-ok-fg hover:bg-status-ok-soft"
                        title="Vincular al negocio"
                        aria-label="Vincular al negocio"
                        onClick={() => { setLinkContactId(c.id); setLinkContactConfirmOpen(true); }}
                        disabled={addingContact}
                      >
                        {addingContact && linkContactId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                }
              />
            );
          })}
        </CrmRelatedRecordGrid>
      ),
      onAdd: deal.account?.id ? () => setNewContactOpen(true) : undefined,
    },
    {
      id: "installations",
      label: "Instalaciones de la cuenta",
      icon: InstallationsIcon,
      count: accountInstallations.length,
      content: deal.account?.id ? (
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
      onAdd: deal.account?.id ? () => createInstallationRef.current?.open() : undefined,
    },
    {
      id: "quotes",
      label: "Cotizaciones",
      icon: QuotesIcon,
      count: linkedQuotes.length,
      onAdd: () => setQuoteCreateOpen(true),
      content: (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setQuoteDialogOpen(true)}>
              <Link2 className="h-3 w-3" /> Vincular existente
            </Button>
          </div>
          <CreateQuoteModal
            defaultClientName={deal.account?.name ?? undefined}
            defaultDealName={deal.title}
            accountId={deal.account?.id}
            dealId={deal.id}
            open={quoteCreateOpen}
            onOpenChange={setQuoteCreateOpen}
            onCreated={(_quoteId, dealQuote) => {
              if (dealQuote) {
                setLinkedQuotes((prev) => [...prev, dealQuote]);
              }
              router.refresh();
            }}
          />
          <Dialog open={quoteDialogOpen} onOpenChange={setQuoteDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader><DialogTitle>Vincular cotización</DialogTitle><DialogDescription>Selecciona una cotización desde CPQ.</DialogDescription></DialogHeader>
              <div className="space-y-2">
                <Label>Cotización</Label>
                <SearchableSelect
                  value={selectedQuoteId}
                  options={quotes.map((q) => ({ id: q.id, label: `${q.code} — ${q.name || q.clientName || "Sin nombre"}` }))}
                  placeholder="Selecciona cotización"
                  disabled={linking}
                  onChange={setSelectedQuoteId}
                />
              </div>
              <DialogFooter>
                <Button onClick={linkQuote} disabled={linking}>{linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar vínculo</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {linkedQuotes.length === 0 ? (
            <EmptyState icon={<QuotesIcon className="h-8 w-8" />} title="Sin cotizaciones" description="No hay cotizaciones vinculadas a este negocio." compact />
          ) : (
            <CrmRelatedRecordGrid className="!grid-cols-1">
              {linkedQuotes.map((quote) => {
                const info = quotesById[quote.quoteId];
                const statusMeta = getQuoteStatus(info?.status);
                const quoteDate = info?.status === "sent" && info?.updatedAt
                  ? `Enviada: ${formatDealDate(info.updatedAt)}`
                  : info?.createdAt
                    ? `Creada: ${formatDealDate(info.createdAt)}`
                    : undefined;
                // El título muestra el nombre escrito (si existe) como identificador principal.
                // El código CPQ se muestra en el subtítulo junto con la fecha.
                const quoteName = info?.name?.trim();
                const code = info?.code || "CPQ";
                const title = quoteName || code;
                const subtitleParts = [quoteName ? code : null, quoteDate]
                  .filter(Boolean)
                  .join(" · ");
                const isActive = info?.id === activeQuotationId;
                return (
                  <CrmRelatedRecordCard
                    key={quote.id}
                    module="quotes"
                    title={title}
                    subtitle={subtitleParts || undefined}
                    meta={formatQuoteAmounts(info)}
                    badge={{
                      label: isActive ? `${statusMeta.label} · Activa` : statusMeta.label,
                      color: statusMeta.color,
                    }}
                    href={`/crm/cotizaciones/${quote.quoteId}`}
                  />
                );
              })}
            </CrmRelatedRecordGrid>
          )}
        </div>
      ),
    },
  ];

  // ── Tab state & definitions ──
  const { activeTab, setActiveTab } = useEntityTabs("general");

  const [fileCount, setFileCount] = useState(0);
  useEffect(() => {
    fetch(`/api/crm/files?entityType=deal&entityId=${encodeURIComponent(deal.id)}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setFileCount(d.data.length); })
      .catch(() => {});
  }, [deal.id]);

  const tabs: EntityTab[] = [
    { id: "general", label: "General", icon: Info },
    { id: "files", label: "Documentos", icon: FileText, count: fileCount },
    { id: "activity", label: "Actividad", icon: History, count: activityEvents.length },
  ];

  const handleOpenOnboarding = async () => {
    try {
      const res = await fetch(`/api/onboarding/by-deal?dealId=${deal.id}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        toast.error("No se pudo cargar el onboarding");
        return;
      }
      if (json.data.exists) {
        router.push(
          `/crm/accounts/${json.data.onboarding.accountId}/onboarding/${json.data.onboarding.id}`,
        );
      } else {
        setOnboardingTarget({
          dealId: deal.id,
          defaultPlaybookId: json.data.defaultPlaybookId,
        });
      }
    } catch {
      toast.error("No se pudo cargar el onboarding");
    }
  };

  const headerActions: EntityHeaderAction[] = [
    { label: "Editar negocio", icon: Pencil, onClick: openDealEdit, primary: true },
    {
      label: "Onboarding del cliente",
      icon: ListChecks,
      onClick: handleOpenOnboarding,
      hidden: deal.status !== "won",
    },
    { label: "Enviar correo", icon: Mail, onClick: () => setEmailOpen(true), hidden: !gmailConnected },
    { label: "Eliminar negocio", icon: Trash2, onClick: () => setDeleteConfirm(true), variant: "destructive" },
  ];

  return (
    <>
      <EntityDetailLayout
        breadcrumb={["CRM", "Negocios", dealTitle]}
        breadcrumbHrefs={["/crm", "/crm/deals"]}
        header={{
          avatar: { initials: dealTitle.charAt(0).toUpperCase() },
          title: dealTitle,
          status: statusBadge,
          actions: headerActions,
          extra: primaryPhone ? (
            <div className="flex items-center gap-1.5">
              <a href={`tel:+${whatsappPhone || primaryPhone}`} title="Llamar"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors">
                <Phone className="h-4 w-4" />
              </a>
              <a href={`https://wa.me/${whatsappPhone || primaryPhone}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-status-ok-border bg-status-ok-soft text-status-ok-fg hover:brightness-110 transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              </a>
            </div>
          ) : undefined,
        }}
        pipelineBar={
          <DealPipelineStepper
            stages={pipelineStages}
            currentStageId={currentStage?.id}
            dealStatus={deal.status}
            onStageClick={updateStage}
            onWonClick={handleWonClick}
            onLostClick={handleLostClick}
            disabled={changingStage}
          />
        }
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        rightPanel={<AssociatedRecordsPanel sections={associatedSections} />}
      >
        {activeTab === "general" && (
          <div className="space-y-4">
            {generalSection.children}

            {/* WhatsApp Adjudicado — visible solo en etapa aceptada/adjudicado */}
            {pipelineStages.find((s) => s.id === currentStage?.id)?.isAccepted && (
              <div className="rounded-lg border border-status-ok-border bg-status-ok-soft p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-status-ok-fg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-status-ok-fg">Enviar detalle por WhatsApp</h3>
                      <p className="text-[11px] text-muted-foreground">Comparte los datos del negocio adjudicado, cotización y dotación de personal</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="bg-status-ok hover:brightness-110 text-white gap-1.5"
                    onClick={openWaAdjudicado}
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Preparar mensaje
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" /> Seguimiento automático
                </h3>
                {followUpSection.action}
              </div>
              {followUpSection.children}
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" /> Comunicación
                </h3>
                {communicationSection.action}
              </div>
              {communicationSection.children}
            </div>
          </div>
        )}
        {activeTab === "activity" && (
          <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
            <CrmActivityTimeline events={activityEvents} />
          </div>
        )}
        {activeTab === "files" && <div className="rounded-lg border border-border bg-card p-4 sm:p-5">{filesSection.children}</div>}
      </EntityDetailLayout>

      {/* ── Email Compose Modal ── */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Enviar correo</DialogTitle>
            <DialogDescription>Se enviará desde tu cuenta Gmail conectada. Tu firma se adjuntará automáticamente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Template</Label>
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
                <Label>Para</Label>
                {!showCcBcc && <button type="button" onClick={() => setShowCcBcc(true)} className="text-[11px] text-primary hover:underline">CC / BCC</button>}
              </div>
              <Input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="correo@cliente.com" disabled={sending} />
            </div>
            {showCcBcc && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label>CC</Label><Input value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="copia@empresa.com" disabled={sending} /></div>
                <div className="space-y-1.5"><Label>BCC</Label><Input value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder="oculto@empresa.com" disabled={sending} /></div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Asunto</Label>
              <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Asunto" disabled={sending} />
            </div>
            <div className="space-y-1.5">
              <Label>Mensaje</Label>
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
              <Label>Cliente (cuenta) *</Label>
              <Select
                value={editDealForm.accountId}
                onValueChange={(v) => setEditDealForm((p) => ({ ...p, accountId: v }))}
              >
                <SelectTrigger className={selectCn}>
                  <SelectValue placeholder="Selecciona cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {deal.account && !accountOptions.find((a) => a.id === deal.account?.id) && (
                    <SelectItem value={deal.account.id}>{deal.account.name}</SelectItem>
                  )}
                  {accountOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={editDealForm.title} onChange={(e) => setEditDealForm((p) => ({ ...p, title: e.target.value }))} placeholder="Nombre del negocio" />
            </div>
            <div className="space-y-1.5">
              <Label>Monto</Label>
              <Input value={editDealForm.amount} onChange={(e) => setEditDealForm((p) => ({ ...p, amount: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Link propuesta</Label>
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

      {/* ── New Contact Dialog (opened via panel onAdd) ── */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nuevo contacto</DialogTitle><DialogDescription>Crea un contacto para la cuenta {deal.account?.name}.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input value={newContactForm.firstName} onChange={(e) => setNewContactForm((p) => ({ ...p, firstName: e.target.value }))} placeholder="Juan" />
              </div>
              <div className="space-y-1.5">
                <Label>Apellido</Label>
                <Input value={newContactForm.lastName} onChange={(e) => setNewContactForm((p) => ({ ...p, lastName: e.target.value }))} placeholder="Pérez" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={newContactForm.email} onChange={(e) => setNewContactForm((p) => ({ ...p, email: e.target.value }))} placeholder="juan@empresa.cl" />
            </div>
            <div className="space-y-1.5">
              <Label>Teléfono (opcional)</Label>
              <Input type="tel" value={newContactForm.phone} onChange={(e) => setNewContactForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+56 9 1234 5678" />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo (opcional)</Label>
              <Input value={newContactForm.roleTitle} onChange={(e) => setNewContactForm((p) => ({ ...p, roleTitle: e.target.value }))} placeholder="Gerente Comercial" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewContactOpen(false)}>Cancelar</Button>
            <Button onClick={createContact} disabled={creatingContact}>
              {creatingContact && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear contacto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={linkContactConfirmOpen}
        onOpenChange={(open) => { setLinkContactConfirmOpen(open); if (!open) setLinkContactId(null); }}
        title="Vincular contacto al negocio"
        description={(() => {
          const c = linkContactId ? accountContactsList.find((x) => x.id === linkContactId) : null;
          const name = c ? `${c.firstName} ${c.lastName}`.trim() : "este contacto";
          return `¿Vincular a ${name} como contacto de este negocio?`;
        })()}
        confirmLabel="Vincular"
        cancelLabel="Cancelar"
        variant="default"
        onConfirm={async () => {
          const id = linkContactId;
          setLinkContactConfirmOpen(false);
          if (id) await addDealContact(id);
        }}
        loading={addingContact}
        loadingLabel="Vinculando..."
      />

      <ConfirmDialog open={deleteConfirm} onOpenChange={setDeleteConfirm} title="Eliminar negocio" description="Se eliminarán las cotizaciones vinculadas y el historial." onConfirm={deleteDeal} />

      <ConfirmDialog
        open={wonConfirmOpen}
        onOpenChange={setWonConfirmOpen}
        title="Marcar como ganado"
        description={"Al marcar este negocio como ganado se cancelarán los seguimientos pendientes y se generará una notificación de contrato. ¿Está seguro?"}
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        onConfirm={confirmWon}
        variant="default"
        loading={changingStage}
        loadingLabel="Procesando..."
      />

      {/* Dialog: Fecha de inicio para etapa Adjudicado */}
      <Dialog open={acceptedDialogOpen} onOpenChange={(o) => { if (!o) { setAcceptedDialogOpen(false); setPendingAcceptedStageId(null); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Fecha de inicio del servicio</DialogTitle>
            <DialogDescription>
              Ingresa la fecha estimada de inicio del servicio para este negocio adjudicado.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="accepted-start-date">Fecha de inicio</Label>
            <Input
              id="accepted-start-date"
              type="date"
              value={acceptedDate}
              onChange={(e) => setAcceptedDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAcceptedDialogOpen(false); setPendingAcceptedStageId(null); }}>
              Cancelar
            </Button>
            <Button onClick={confirmAccepted} disabled={!acceptedDate}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: WhatsApp Adjudicado */}
      <Dialog open={waAdjudicadoOpen} onOpenChange={setWaAdjudicadoOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg className="h-5 w-5 text-status-ok-fg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              Enviar detalle del negocio adjudicado
            </DialogTitle>
            <DialogDescription>
              Revisa y edita el mensaje antes de enviarlo. Puedes enviarlo por WhatsApp o copiar al portapapeles.
            </DialogDescription>
          </DialogHeader>
          {waAdjudicadoLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Cargando datos de cotización...</span>
            </div>
          ) : (
            <div className="space-y-3">
              <Textarea
                value={waAdjudicadoMsg}
                onChange={(e) => setWaAdjudicadoMsg(e.target.value)}
                rows={20}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                Puedes editar el mensaje antes de enviarlo. Se abrirá WhatsApp Web con el texto pre-cargado.
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={copyWaAdjudicado} disabled={waAdjudicadoLoading} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copiar mensaje
            </Button>
            <Button
              onClick={sendWaAdjudicado}
              disabled={waAdjudicadoLoading}
              className="bg-status-ok hover:brightness-110 text-white gap-1.5"
            >
              <MessageSquare className="h-3.5 w-3.5" /> Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {onboardingTarget ? (
        <OnboardingClientModal
          open
          dealId={onboardingTarget.dealId}
          defaultPlaybookId={onboardingTarget.defaultPlaybookId}
          onClose={() => {
            toast.message(
              "Puedes iniciar el onboarding desde la cuenta cuando quieras",
            );
            setOnboardingTarget(null);
          }}
          onCreated={() => setOnboardingTarget(null)}
        />
      ) : null}
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
      className: "text-[10px] border-status-warn-border text-status-warn-fg",
    };
  }
  if (overdueLogs > 0) {
    return {
      label: "Con atrasos",
      className: "text-[10px] border-status-danger-border text-status-danger-fg",
    };
  }
  if (pendingLogs > 0) {
    return {
      label: "Activo",
      className: "text-[10px] border-status-ok-border text-status-ok-fg",
    };
  }
  if (totalLogs > 0) {
    return {
      label: "Completado",
      className: "text-[10px] border-status-info-border text-status-info-fg",
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
      className: "text-[10px] border-status-ok-border text-status-ok-fg",
    };
  }
  if (status === "failed") {
    return {
      label: "Fallido",
      badge: "Fallido",
      className: "text-[10px] border-status-danger-border text-status-danger-fg",
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
      className: "text-[10px] border-status-warn-border text-status-warn-fg",
    };
  }
  return {
    label: "Programado",
    badge: "Pendiente",
    className: "text-[10px] border-status-info-border text-status-info-fg",
  };
}

function getPendingTimingMeta(scheduledAt: string) {
  const diffMs = new Date(scheduledAt).getTime() - Date.now();
  if (diffMs <= 0) {
    return {
      label: "Vencido: requiere gestión inmediata.",
      className: "text-status-danger-fg",
    };
  }
  if (diffMs <= 24 * 60 * 60 * 1000) {
    return {
      label: "Programado para hoy.",
      className: "text-status-warn-fg",
    };
  }
  return {
    label: "Programado en fecha futura.",
    className: "text-status-ok-fg",
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
