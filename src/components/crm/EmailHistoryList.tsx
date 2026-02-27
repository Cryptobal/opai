"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/opai/EmptyState";
import {
  Mail,
  CheckCircle2,
  Eye,
  MousePointerClick,
  AlertTriangle,
  Clock,
  Send,
  ArrowDownLeft,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmailContentSkeleton } from "@/components/ui/skeleton";

export type EmailMessage = {
  id: string;
  providerMessageId?: string | null;
  direction: string;
  fromEmail: string;
  toEmails: string[];
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  status: string;
  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  firstOpenedAt?: string | null;
  lastOpenedAt?: string | null;
  openCount: number;
  firstClickedAt?: string | null;
  clickCount: number;
  bouncedAt?: string | null;
  bounceType?: string | null;
  source: string;
  followUpLogId?: string | null;
  htmlBody?: string | null;
  textBody?: string | null;
  thread?: {
    dealId?: string | null;
    accountId?: string | null;
    contactId?: string | null;
    subject?: string;
  };
};

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Mail; className: string }
> = {
  queued: {
    label: "En cola",
    icon: Clock,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
  sent: {
    label: "Enviado",
    icon: Send,
    className: "bg-blue-50 text-blue-600 border-blue-200",
  },
  received: {
    label: "Recibido",
    icon: ArrowDownLeft,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  delivered: {
    label: "Entregado",
    icon: CheckCircle2,
    className: "bg-green-50 text-green-600 border-green-200",
  },
  opened: {
    label: "Abierto",
    icon: Eye,
    className: "bg-emerald-50 text-emerald-600 border-emerald-200",
  },
  clicked: {
    label: "Clic",
    icon: MousePointerClick,
    className: "bg-purple-50 text-purple-600 border-purple-200",
  },
  bounced: {
    label: "Rebotado",
    icon: AlertTriangle,
    className: "bg-red-50 text-red-600 border-red-200",
  },
  complained: {
    label: "Spam",
    icon: AlertTriangle,
    className: "bg-red-50 text-red-700 border-red-300",
  },
};

function getEffectiveStatus(msg: EmailMessage): string {
  if (msg.direction === "in") return "received";
  if (msg.bouncedAt) return "bounced";
  if (msg.clickCount > 0) return "clicked";
  if (msg.openCount > 0) return "opened";
  if (msg.deliveredAt) return "delivered";
  if (msg.sentAt) return "sent";
  return msg.status || "queued";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stripHtmlTags(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function getEmailBodyText(msg: EmailMessage): string {
  const textBody = msg.textBody?.trim();
  if (textBody) return textBody;

  const htmlBody = msg.htmlBody?.trim();
  if (htmlBody) {
    const plain = stripHtmlTags(htmlBody);
    if (plain) return plain;
  }

  return "No hay contenido del correo disponible.";
}

function TrackingBadges({ msg }: { msg: EmailMessage }) {
  if (msg.direction === "in") return null;

  const badges: { label: string; icon: typeof Mail; className: string }[] = [];

  if (msg.openCount > 0) {
    badges.push({
      ...STATUS_CONFIG.opened,
      label: `Abierto (${msg.openCount}x)`,
    });
  }
  if (msg.clickCount > 0) {
    badges.push({
      ...STATUS_CONFIG.clicked,
      label: `Clic (${msg.clickCount}x)`,
    });
  }
  if (msg.bouncedAt) {
    badges.push(STATUS_CONFIG.bounced);
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((badge, i) => {
        const Icon = badge.icon;
        return (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}
          >
            <Icon className="h-3 w-3" />
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}

interface EmailHistoryListProps {
  dealId?: string;
  contactId?: string;
  accountId?: string;
  compact?: boolean;
  syncBeforeFetch?: boolean;
  onReply?: (message: EmailMessage) => void;
  onCountChange?: (count: number) => void;
}

export function EmailHistoryList({
  dealId,
  contactId,
  accountId,
  compact = false,
  syncBeforeFetch = false,
  onReply,
  onCountChange,
}: EmailHistoryListProps) {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [loadingSelectedContent, setLoadingSelectedContent] = useState(false);

  const fetchEmails = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dealId) params.set("dealId", dealId);
      if (contactId) params.set("contactId", contactId);
      if (accountId) params.set("accountId", accountId);

      const res = await fetch(`/api/crm/emails?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) {
        const loadedEmails = data.data || [];
        setEmails(loadedEmails);
        onCountChange?.(loadedEmails.length);
      }
    } catch (error) {
      console.error("Error fetching emails:", error);
    } finally {
      setLoading(false);
    }
  }, [dealId, contactId, accountId, onCountChange]);

  const syncAndRefresh = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch("/api/crm/gmail/sync?max=30", {
        cache: "no-store",
      });
    } catch (error) {
      console.error("Error syncing Gmail:", error);
    } finally {
      setSyncing(false);
    }

    await fetchEmails();
  }, [fetchEmails]);

  const hydrateEmailContent = useCallback(async (emailId: string) => {
    setLoadingSelectedContent(true);
    try {
      const response = await fetch(`/api/crm/emails/${emailId}/content`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success || !payload?.data) return;

      const updatedMessage = payload.data as EmailMessage;
      setEmails((prev) =>
        prev.map((item) =>
          item.id === updatedMessage.id ? { ...item, ...updatedMessage } : item
        )
      );
      setSelectedEmail((prev) =>
        prev && prev.id === updatedMessage.id
          ? { ...prev, ...updatedMessage }
          : prev
      );
    } catch (error) {
      console.error("Error hydrating email content:", error);
    } finally {
      setLoadingSelectedContent(false);
    }
  }, []);

  const openEmail = useCallback(
    (message: EmailMessage) => {
      setSelectedEmail(message);
      if (message.htmlBody || message.textBody) return;
      void hydrateEmailContent(message.id);
    },
    [hydrateEmailContent]
  );

  const handleReply = useCallback(() => {
    if (!selectedEmail || !onReply) return;
    onReply(selectedEmail);
    setSelectedEmail(null);
  }, [selectedEmail, onReply]);

  useEffect(() => { void fetchEmails(); }, [fetchEmails]);
  useEffect(() => {
    if (syncBeforeFetch) {
      void syncAndRefresh();
    }
  }, [syncBeforeFetch, syncAndRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="Sin correos"
          description="No hay correos todavía."
          compact={compact}
        />
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void syncAndRefresh()}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Actualizar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {emails.length} correo{emails.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void syncAndRefresh()}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Actualizar
          </Button>
        </div>
        {emails.map((msg) => {
          const effectiveStatus = getEffectiveStatus(msg);
          const statusConfig =
            STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.queued;
          const StatusIcon = statusConfig.icon;
          const eventDate =
            msg.direction === "in"
              ? msg.receivedAt || msg.sentAt || msg.createdAt
              : msg.sentAt || msg.createdAt;

          return (
            <div
              key={msg.id}
              className="rounded-lg border border-border p-3 sm:p-4 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {msg.direction === "out" ? (
                    <Send className="h-4 w-4 text-blue-500 shrink-0" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{msg.subject}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {msg.direction === "out"
                        ? `Para: ${msg.toEmails.join(", ")}`
                        : `De: ${msg.fromEmail}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {msg.source === "followup" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/30 text-amber-500"
                    >
                      Automático
                    </Badge>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusConfig.className}`}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusConfig.label}
                  </span>
                </div>
              </div>

              <TrackingBadges msg={msg} />

              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70 pt-1">
                <div className="flex items-center gap-3 min-w-0">
                  <span>{formatDate(eventDate)}</span>
                  {msg.firstOpenedAt && (
                    <span>
                      Abierto: {formatDate(msg.firstOpenedAt)}
                    </span>
                  )}
                  {msg.firstClickedAt && (
                    <span>
                      Clic: {formatDate(msg.firstClickedAt)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-primary text-[11px] font-medium hover:underline"
                  onClick={() => openEmail(msg)}
                >
                  Ver correo
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={Boolean(selectedEmail)}
        onOpenChange={(open) => {
          if (!open) setSelectedEmail(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="break-words pr-8">
              {selectedEmail?.subject || "Correo"}
            </DialogTitle>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-3 max-w-full overflow-x-hidden">
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs space-y-1.5 max-w-full overflow-x-hidden">
                <p className="break-all">
                  <span className="font-medium text-foreground">De:</span>{" "}
                  {selectedEmail.fromEmail}
                </p>
                <p className="break-all">
                  <span className="font-medium text-foreground">Para:</span>{" "}
                  {selectedEmail.toEmails.join(", ") || "Sin destinatario"}
                </p>
                {selectedEmail.ccEmails && selectedEmail.ccEmails.length > 0 && (
                  <p className="break-all">
                    <span className="font-medium text-foreground">CC:</span>{" "}
                    {selectedEmail.ccEmails.join(", ")}
                  </p>
                )}
                {selectedEmail.bccEmails && selectedEmail.bccEmails.length > 0 && (
                  <p className="break-all">
                    <span className="font-medium text-foreground">BCC:</span>{" "}
                    {selectedEmail.bccEmails.join(", ")}
                  </p>
                )}
                <p>
                  <span className="font-medium text-foreground">Fecha:</span>{" "}
                  {formatDate(
                    selectedEmail.direction === "in"
                      ? selectedEmail.receivedAt ||
                          selectedEmail.sentAt ||
                          selectedEmail.createdAt
                      : selectedEmail.sentAt || selectedEmail.createdAt
                  )}
                </p>
              </div>
              {loadingSelectedContent &&
              !selectedEmail.htmlBody &&
              !selectedEmail.textBody ? (
                <EmailContentSkeleton />
              ) : (
                <div className="rounded-md border p-3 text-sm whitespace-pre-wrap break-all leading-relaxed max-w-full overflow-x-hidden">
                  {getEmailBodyText(selectedEmail)}
                </div>
              )}
              {onReply && (
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleReply}>
                    Responder
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
