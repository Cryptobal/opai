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

function countSuffix(sentCount: number): string {
  if (sentCount < 1) return "";
  return sentCount === 1 ? " (1 envío)" : ` (${sentCount} envíos)`;
}

/** Texto del tooltip / aria-label. Exportado para tests. */
export function buildDocStatusTitle({
  variant,
  required,
  status,
  sentAt,
  sentCount,
  lastRecipient,
}: Omit<DocStatusIconProps, "className">): string {
  const label = variant === "PROFORMA" ? "Proforma" : "Estado de pago";
  if (required && status === "NONE") {
    return `${label}: pendiente de enviar`;
  }
  if (status === "SENT") {
    const when = sentAt
      ? format(new Date(sentAt), "dd MMM HH:mm", { locale: es })
      : "";
    const whenPart = when ? ` ${when}` : "";
    const to = lastRecipient ? ` a ${lastRecipient}` : "";
    return `${label}: enviada${whenPart}${countSuffix(sentCount)}${to}`;
  }
  if (status === "VIEWED") {
    return `${label}: vista por cliente${countSuffix(sentCount)}`;
  }
  if (status === "APPROVED") {
    return `${label}: aprobada${countSuffix(sentCount)}`;
  }
  if (status === "REJECTED") {
    return `${label}: rechazada${countSuffix(sentCount)}`;
  }
  return `${label}: no requerida`;
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
  const title = buildDocStatusTitle({
    variant,
    required,
    status,
    sentAt,
    sentCount,
    lastRecipient,
  });

  let toneClass = "text-ds-text-4";
  let overlay: ReactNode = null;

  if (required && status === "NONE") {
    toneClass = "text-status-warn-fg";
    overlay = (
      <AlertCircle className="absolute -right-1 -top-1 h-2.5 w-2.5 fill-status-warn-soft text-status-warn-fg" />
    );
  } else if (status === "SENT") {
    toneClass = "text-status-info-fg";
  } else if (status === "VIEWED") {
    toneClass = "text-status-info-fg";
    overlay = (
      <Eye className="absolute -right-1 -bottom-1 h-2.5 w-2.5 text-status-info-fg" />
    );
  } else if (status === "APPROVED") {
    toneClass = "text-status-ok-fg";
    overlay = (
      <CheckCircle2 className="absolute -right-1 -bottom-1 h-2.5 w-2.5 fill-status-ok-soft text-status-ok-fg" />
    );
  } else if (status === "REJECTED") {
    toneClass = "text-status-danger-fg";
    overlay = (
      <XCircle className="absolute -right-1 -bottom-1 h-2.5 w-2.5 fill-status-danger-soft text-status-danger-fg" />
    );
  }

  return (
    <span
      className={cn(
        "relative inline-flex h-5 items-center justify-center gap-0.5",
        sentCount >= 1 ? "min-w-[1.75rem]" : "w-5",
        className,
      )}
      title={title}
      aria-label={title}
      role="img"
    >
      <Icon className={cn("h-4 w-4 shrink-0", toneClass)} />
      {sentCount >= 1 ? (
        <span className={cn("text-[12px] font-mono tabular-nums leading-none", toneClass)}>
          {sentCount}
        </span>
      ) : null}
      {overlay}
    </span>
  );
}

interface OcChipProps {
  references: DraftAdditionalReference[] | null;
}

/** Etiqueta corta para cada tipo de referencia visible en el chip. */
const REF_LABELS: Record<string, string> = {
  "801": "OC",
  "802": "Pedido",
  "803": "Contrato",
  HES: "HES",
};

export function OcReferenceChip({ references }: OcChipProps) {
  if (!references || references.length === 0) return null;
  // Solo refs OC/HES con folio cargado. Si está vacío, el chip mostraría
  // "OC #" o "HES #" sin número y eso confunde al usuario.
  const visible = references.filter(
    (r) =>
      (r.tipoDocRef === "801" ||
        r.tipoDocRef === "HES" ||
        r.tipoDocRef === "802") &&
      (r.folioRef ?? "").trim().length > 0,
  );
  if (visible.length === 0) return null;
  const label =
    visible.length === 1
      ? `${REF_LABELS[visible[0].tipoDocRef] ?? "Ref"} #${visible[0].folioRef}`
      : `${visible.length} refs`;
  const title = visible
    .map(
      (r) =>
        `${REF_LABELS[r.tipoDocRef] ?? r.tipoDocRef} ${r.folioRef}${r.razonRef ? ` — ${r.razonRef}` : ""}`,
    )
    .join("\n");
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-ds-border-subtle bg-ds-surface-2 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-2"
      title={title}
      aria-label={title}
    >
      <Paperclip className="h-3 w-3" />
      {label}
    </span>
  );
}
