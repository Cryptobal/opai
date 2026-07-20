"use client";

import { FileText, ClipboardCheck, CheckCircle2, XCircle, Eye, AlertCircle, type LucideIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { CellGestionSummary, CashflowCellStatus } from "@/modules/finance/cashflow/types";
import type { DraftProformaStatus } from "@/modules/finance/billing/dte-draft.service";

type DocKind = "PROFORMA" | "ESTADO_DE_PAGO";
const DOC: Record<DocKind, { Icon: LucideIcon; label: string }> = {
  PROFORMA: { Icon: FileText, label: "Proforma" },
  ESTADO_DE_PAGO: { Icon: ClipboardCheck, label: "Estado de pago" },
};

/** Tono + overlay por estado — misma semántica que DocStatusIcon de Programación. */
const STYLE: Record<
  DraftProformaStatus,
  { tone: string; Overlay: LucideIcon | null; ov: string }
> = {
  NONE: { tone: "text-status-warn-fg", Overlay: AlertCircle, ov: "fill-status-warn-soft text-status-warn-fg" },
  SENT: { tone: "text-status-info-fg", Overlay: null, ov: "" },
  VIEWED: { tone: "text-status-info-fg", Overlay: Eye, ov: "text-status-info-fg" },
  APPROVED: { tone: "text-status-ok-fg", Overlay: CheckCircle2, ov: "fill-status-ok-soft text-status-ok-fg" },
  REJECTED: { tone: "text-status-danger-fg", Overlay: XCircle, ov: "fill-status-danger-soft text-status-danger-fg" },
};

type GlyphSpec = { key: string; Icon: LucideIcon; tone: string; Overlay: LucideIcon | null; ov: string; title: string };

const TITLE: Record<Exclude<DraftProformaStatus, "SENT">, string> = {
  NONE: "pendiente de enviar",
  VIEWED: "vista por el cliente",
  APPROVED: "aprobada por el cliente",
  REJECTED: "con corrección solicitada",
};

function titleFor(label: string, status: DraftProformaStatus, sentAt: string | null, recipient: string | null): string {
  if (status !== "SENT") return `${label} ${TITLE[status]}`;
  const w = sentAt ? format(new Date(sentAt), "d MMM", { locale: es }) : "";
  return `${label} enviada${w ? ` ${w}` : ""}${recipient ? ` a ${recipient}` : ""}`;
}

/** Glifo de un documento, o null si no se muestra (en PAID sólo APPROVED). */
function docGlyph(kind: DocKind, status: DraftProformaStatus, sentAt: string | null, recipient: string | null, paid: boolean): GlyphSpec | null {
  if (paid && status !== "APPROVED") return null;
  const { Icon, label } = DOC[kind];
  const s = STYLE[status] ?? STYLE.NONE;
  return { key: kind, Icon, tone: s.tone, Overlay: s.Overlay, ov: s.ov, title: titleFor(label, status, sentAt, recipient) };
}

/** Micro-glifos de gestión (proforma/EP/OC) en el chip. Semántica de
 *  SendStatusIcons miniaturizada; máx. 3, oculta no requeridos, en PAID sólo
 *  aprobada/OC (auditoría). */
export function GestionGlyphs({
  gestion,
  emiteProforma = false,
  cellStatus,
  size = "xs",
}: {
  gestion?: CellGestionSummary | null;
  emiteProforma?: boolean;
  cellStatus?: CashflowCellStatus;
  size?: "xs" | "sm";
}) {
  const paid = cellStatus === "PAID";
  const glyphs: GlyphSpec[] = [];
  if (gestion) {
    if (gestion.proformaRequired) {
      const g = docGlyph("PROFORMA", gestion.proformaStatus, gestion.proformaSentAt, gestion.proformaLastRecipient, paid);
      if (g) glyphs.push(g);
    }
    if (gestion.epRequired) {
      const g = docGlyph("ESTADO_DE_PAGO", gestion.epStatus, gestion.epSentAt, null, paid);
      if (g) glyphs.push(g);
    }
  } else if (emiteProforma && cellStatus === "PROJECTED") {
    const g = docGlyph("PROFORMA", "NONE", null, null, false);
    if (g) glyphs.push({ ...g, title: "Proforma pendiente de emitir" });
  }
  const oc = gestion?.ocFolio ?? null;
  if (glyphs.length === 0 && !oc) return null;

  const iconCls = size === "sm" ? "h-[13px] w-[13px]" : "h-[11px] w-[11px]";
  const ovCls = size === "sm" ? "h-2 w-2" : "h-[7px] w-[7px]";
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="Gestión de cobro">
      {glyphs.slice(0, 3).map(({ key, Icon, tone, Overlay, ov, title }) => (
        <span key={key} className="relative inline-flex items-center justify-center" title={title} aria-label={title} role="img">
          <Icon className={cn(iconCls, tone)} />
          {Overlay && <Overlay className={cn("absolute -bottom-1 -right-1", ovCls, ov)} />}
        </span>
      ))}
      {oc && (
        <span
          className="rounded bg-tint-violet px-1 font-mono text-[8.5px] font-semibold tracking-[.05em] text-tint-violet-fg"
          title={`OC ${oc}`}
          aria-label={`OC ${oc}`}
        >
          OC
        </span>
      )}
    </span>
  );
}
