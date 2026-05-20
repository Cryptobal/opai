"use client";

import type { ReactNode } from "react";
import {
  FileText,
  ClipboardCheck,
  Paperclip,
  CheckCircle2,
  XCircle,
  Eye,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type {
  DraftAdditionalReference,
  DraftProformaStatus,
} from "@/modules/finance/billing/dte-draft.service";

interface DocStatusIconProps {
  variant: "PROFORMA" | "ESTADO_DE_PAGO";
  required: boolean;
  status: DraftProformaStatus;
  sentAt: string | null;
  sentCount: number;
  lastRecipient: string | null;
  className?: string;
}

export function DocStatusIcon({
  variant,
  required,
  status,
  sentAt,
  sentCount,
  lastRecipient,
  className,
}: DocStatusIconProps) {
  const Icon = variant === "PROFORMA" ? FileText : ClipboardCheck;
  const label = variant === "PROFORMA" ? "Proforma" : "Estado de pago";

  let toneClass = "text-ds-text-4";
  let overlay: ReactNode = null;
  let title = `${label}: no requerida`;

  if (required && status === "NONE") {
    toneClass = "text-status-warn-fg";
    overlay = (
      <AlertCircle className="absolute -right-1 -top-1 h-2.5 w-2.5 fill-status-warn-soft text-status-warn-fg" />
    );
    title = `${label}: pendiente de enviar`;
  } else if (status === "SENT") {
    toneClass = "text-status-info-fg";
    const when = sentAt
      ? format(new Date(sentAt), "dd MMM HH:mm", { locale: es })
      : "";
    title = `${label}: enviada ${when}${sentCount > 1 ? ` (${sentCount} envíos)` : ""}${lastRecipient ? ` a ${lastRecipient}` : ""}`;
  } else if (status === "VIEWED") {
    toneClass = "text-status-info-fg";
    overlay = (
      <Eye className="absolute -right-1 -bottom-1 h-2.5 w-2.5 text-status-info-fg" />
    );
    title = `${label}: vista por cliente`;
  } else if (status === "APPROVED") {
    toneClass = "text-status-ok-fg";
    overlay = (
      <CheckCircle2 className="absolute -right-1 -bottom-1 h-2.5 w-2.5 fill-status-ok-soft text-status-ok-fg" />
    );
    title = `${label}: aprobada`;
  } else if (status === "REJECTED") {
    toneClass = "text-status-danger-fg";
    overlay = (
      <XCircle className="absolute -right-1 -bottom-1 h-2.5 w-2.5 fill-status-danger-soft text-status-danger-fg" />
    );
    title = `${label}: rechazada`;
  }

  return (
    <span
      className={cn("relative inline-flex h-5 w-5 items-center justify-center", className)}
      title={title}
      aria-label={title}
      role="img"
    >
      <Icon className={cn("h-4 w-4", toneClass)} />
      {overlay}
    </span>
  );
}

interface OcChipProps {
  references: DraftAdditionalReference[] | null;
  className?: string;
}

export function OcReferenceChip({ references, className }: OcChipProps) {
  if (!references || references.length === 0) return null;
  const ocs = references.filter((r) => r.tipoDocRef === "801");
  if (ocs.length === 0) return null;
  const label = ocs.length === 1 ? `OC #${ocs[0].folioRef}` : `${ocs.length} OCs`;
  const title = ocs
    .map((o) => `OC ${o.folioRef}${o.razonRef ? ` — ${o.razonRef}` : ""}`)
    .join("\n");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-ds-border-subtle bg-ds-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-ds-text-2",
        className,
      )}
      title={title}
      aria-label={title}
    >
      <Paperclip className="h-3 w-3" />
      {label}
    </span>
  );
}
