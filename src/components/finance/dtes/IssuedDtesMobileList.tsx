"use client";

/**
 * IssuedDtesMobileList — listado de DTEs emitidos en formato card
 * para celular.
 *
 * El detalle de cada fila se abre tocando la card. Acciones secundarias
 * (PDF, XML, email, NC, ND, ceder, anular) se concentran en un
 * MobileActionSheet (bottom sheet) para tener targets táctiles ≥48px,
 * en lugar de un DropdownMenu chico como en desktop.
 *
 * Las reglas SII (qué acciones aplican según `dteType` / `siiStatus` /
 * NCs vivas / cesión) son las mismas que DteActionsMenu (desktop) —
 * por simplicidad se calculan inline aquí, no se extrajo a un helper
 * compartido para evitar refactor del componente desktop estable.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatCalendarDateDisplay } from "@/lib/fx-date";
import {
  Ban,
  Coins,
  Download,
  ExternalLink,
  FileCode,
  FileEdit,
  FileMinus,
  FilePlus,
  FileSearch,
  Copy,
  Mail,
  MailX,
  MoreHorizontal,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/opai-ds";
import { cn, formatCLP } from "@/lib/utils";
import { DteAgingBadge } from "../DteAgingBadge";
import { DocumentTag } from "./DocumentTag";
import { DtePaymentTag } from "./DtePaymentTag";
import { SiiStatusPill } from "./SiiStatusPill";
import { CessionBadge } from "./CessionBadge";
import { LinkedNoteBadge } from "./LinkedNoteBadge";
import { RelationRow } from "./RelationRow";
import { fmtCLPSmart } from "./shared/constants";
import type { DteRow } from "./shared/types";
import {
  MobileActionSheet,
  type MobileActionSheetItem,
} from "@/components/finance/mobile";

interface Props {
  rows: DteRow[];
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  canManage: boolean;
  sendingEmail: string | null;
  checkingStatus: string | null;
  voiding: string | null;
  deletingDraft: string | null;
  cloningDraft: string | null;
  onViewDetail: (id: string) => void;
  onPreviewPdf: (id: string) => void;
  onDownloadPdf: (id: string, folio: number) => void;
  onDownloadXml: (id: string, folio: number) => void;
  onResendEmail: (id: string) => void;
  onCheckStatus: (id: string, folio: number) => void;
  onVoid: (id: string) => void;
  onCede: (id: string) => void;
  onCreditNote: (id: string) => void;
  onDebitNote: (id: string) => void;
  onEditDraft: (id: string) => void;
  onIssueDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  onCloneDraft: (id: string) => void;
}

/**
 * Misma matriz de decisión que DteActionsMenu. Se duplica acá adrede:
 * desktop usa DropdownMenu y mobile usa bottom sheet, no compartimos UI.
 */
function buildActionItems(
  row: DteRow,
  canManage: boolean,
  sendingEmail: string | null,
  checkingStatus: string | null,
  voiding: string | null,
  deletingDraft: string | null,
  cloningDraft: string | null,
  handlers: {
    onPreviewPdf: () => void;
    onDownloadPdf: () => void;
    onDownloadXml: () => void;
    onResendEmail: () => void;
    onCheckStatus: () => void;
    onVoid: () => void;
    onCede: () => void;
    onCreditNote: () => void;
    onDebitNote: () => void;
    onEditDraft: () => void;
    onIssueDraft: () => void;
    onDeleteDraft: () => void;
    onCloneDraft: () => void;
    onOpenCession: () => void;
  },
): MobileActionSheetItem[] {
  const items: MobileActionSheetItem[] = [];
  const isDraft = row.siiStatus === "DRAFT";

  if (isDraft) {
    if (canManage) {
      items.push({
        key: "edit-draft",
        label: "Editar borrador",
        icon: <FileEdit className="h-4 w-4" />,
        disabled:
          deletingDraft === row.id || cloningDraft === row.id,
        onSelect: handlers.onEditDraft,
      });
      items.push({
        key: "clone-draft",
        label: "Duplicar borrador",
        icon: <Copy className="h-4 w-4" />,
        disabled:
          deletingDraft === row.id ||
          cloningDraft === row.id,
        onSelect: handlers.onCloneDraft,
      });
      items.push({
        key: "issue-draft",
        label: "Emitir al SII",
        icon: <Send className="h-4 w-4" />,
        disabled:
          deletingDraft === row.id || cloningDraft === row.id,
        onSelect: handlers.onIssueDraft,
      });
      items.push({
        key: "delete-draft",
        label: "Eliminar borrador",
        tone: "danger",
        icon: <Trash2 className="h-4 w-4" />,
        disabled:
          deletingDraft === row.id || cloningDraft === row.id,
        onSelect: handlers.onDeleteDraft,
      });
    }
    return items;
  }

  const hasXml = row.hasXml !== false;
  const canAnular = row.siiStatus === "PENDING" || row.siiStatus === "SENT";
  const isCreditableType = [33, 34, 39, 41, 56].includes(row.dteType);
  const remainingNet =
    row.netAmount != null && row.linkedCreditNote
      ? Math.max(0, row.netAmount - row.linkedCreditNote.creditedNet)
      : null;
  const isFullyCredited =
    row.linkedCreditNote != null &&
    row.linkedCreditNote.creditedNet > 0 &&
    remainingNet != null &&
    remainingNet <= 1;
  const creditNoteBlockedReason: string | null = !isCreditableType
    ? null
    : row.siiStatus === "ANNULLED"
      ? null
      : row.linkedCreditNote?.hasFullAnnulment
        ? `Ya anulada con NC ${row.linkedCreditNote.primaryFolio}`
        : isFullyCredited && row.linkedCreditNote
          ? `Saldo agotado (${formatCLP(row.linkedCreditNote.creditedNet)} acreditados)`
          : null;
  const canCreditNote = isCreditableType && row.siiStatus !== "ANNULLED";
  const canDebitNote = row.dteType === 61 && row.siiStatus !== "ANNULLED";
  const canBeCeded = row.canBeCeded === true && !row.activeCession;
  const canCheckStatus =
    canManage && (row.siiStatus === "PENDING" || row.siiStatus === "SENT");
  const canResend = Boolean(
    canManage && row.receiverEmail && hasXml && row.siiStatus !== "ANNULLED",
  );

  if (hasXml) {
    items.push({
      key: "pdf-preview",
      label: "Vista previa PDF",
      icon: <FileSearch className="h-4 w-4" />,
      onSelect: handlers.onPreviewPdf,
    });
    items.push({
      key: "pdf",
      label: "Descargar PDF",
      icon: <Download className="h-4 w-4" />,
      onSelect: handlers.onDownloadPdf,
    });
    items.push({
      key: "xml",
      label: "Descargar XML",
      icon: <FileCode className="h-4 w-4" />,
      onSelect: handlers.onDownloadXml,
    });
  }

  if (canResend) {
    items.push({
      key: "email",
      label: row.emailSentAt ? "Reenviar email" : "Enviar email",
      description: row.receiverEmail ?? undefined,
      icon: <Mail className="h-4 w-4" />,
      disabled: sendingEmail === row.id,
      onSelect: handlers.onResendEmail,
    });
  }

  if (canCheckStatus) {
    items.push({
      key: "sii-status",
      label: "Consultar estado SII",
      icon: <RefreshCw className="h-4 w-4" />,
      disabled: checkingStatus === row.id,
      onSelect: handlers.onCheckStatus,
    });
  }

  if (canManage && canCreditNote) {
    items.push({
      key: "nc",
      label: "Nota de Crédito",
      description: creditNoteBlockedReason ?? undefined,
      icon: <FileMinus className="h-4 w-4" />,
      disabled: Boolean(creditNoteBlockedReason),
      onSelect: handlers.onCreditNote,
    });
  }

  if (canManage && canDebitNote) {
    items.push({
      key: "nd",
      label: "Nota de Débito",
      icon: <FilePlus className="h-4 w-4" />,
      onSelect: handlers.onDebitNote,
    });
  }

  if (canManage && canBeCeded) {
    items.push({
      key: "cede",
      label: "Ceder a factoring",
      icon: <Coins className="h-4 w-4" />,
      onSelect: handlers.onCede,
    });
  }

  if (canManage && canAnular) {
    items.push({
      key: "void",
      label: "Anular DTE",
      tone: "danger",
      icon: <Ban className="h-4 w-4" />,
      disabled: voiding === row.id,
      onSelect: handlers.onVoid,
    });
  }

  if (row.activeCession) {
    items.push({
      key: "cession",
      label: `Ver cesión ${row.activeCession.code}`,
      icon: <ExternalLink className="h-4 w-4" />,
      onSelect: handlers.onOpenCession,
    });
  }

  return items;
}

export function IssuedDtesMobileList({
  rows,
  selectedIds,
  onToggleRow,
  canManage,
  sendingEmail,
  checkingStatus,
  voiding,
  deletingDraft,
  cloningDraft,
  onViewDetail,
  onPreviewPdf,
  onDownloadPdf,
  onDownloadXml,
  onResendEmail,
  onCheckStatus,
  onVoid,
  onCede,
  onCreditNote,
  onDebitNote,
  onEditDraft,
  onIssueDraft,
  onDeleteDraft,
  onCloneDraft,
}: Props) {
  const selectionMode = selectedIds.size > 0;
  const [actionFor, setActionFor] = useState<string | null>(null);
  const actionRow = actionFor ? rows.find((r) => r.id === actionFor) : null;

  const emailIcon = (d: DteRow): ReactNode => {
    if (d.emailSentAt) {
      return (
        <Mail
          className="h-4 w-4 text-status-ok-fg"
          aria-label={`Email enviado ${format(new Date(d.emailSentAt), "dd MMM", { locale: es })}`}
        />
      );
    }
    if (d.emailStatus === "FAILED") {
      return (
        <MailX
          className="h-4 w-4 text-status-danger-fg"
          aria-label="Email falló"
        />
      );
    }
    return <Mail className="h-4 w-4 text-ds-text-4" aria-label="Sin enviar" />;
  };

  return (
    <>
      <ul className="space-y-2 ds-list-cascade">
        {rows.map((d) => {
          const isDraftRow = d.siiStatus === "DRAFT";
          const isAnnulled =
            d.siiStatus === "ANNULLED" ||
            d.linkedCreditNote?.hasFullAnnulment === true;
          const isSelected = selectedIds.has(d.id);
          // Receptor: nombre de fantasía (CRM) primero, razón social
          // después, RUT al pie. Mismo orden que desktop.
          const fantasyName = d.crmAccount?.name?.trim() || null;
          const legalName = d.receiverName?.trim() || "";
          const sameName =
            fantasyName && fantasyName.toLowerCase() === legalName.toLowerCase();
          const primaryName = fantasyName && !sameName ? fantasyName : legalName;
          const secondaryName = fantasyName && !sameName ? legalName : null;
          return (
            <li key={d.id}>
              <Surface
                elevation={1}
                padding="sm"
                tappable
                selected={isSelected}
                className={cn(
                  "relative",
                  d.activeCession && [
                    "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r before:bg-tint-violet-fg/60",
                  ],
                )}
                onClick={() =>
                  isDraftRow ? onEditDraft(d.id) : onViewDetail(d.id)
                }
              >
                <div className="flex items-start gap-2.5">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar DTE ${d.folio}`}
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleRow(d.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 mt-1 rounded border-ds-border-default bg-ds-surface-2 text-primary cursor-pointer shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-xs font-mono tabular-nums text-ds-text-3 shrink-0">
                        {d.date
                          ? formatCalendarDateDisplay(d.date, "dd MMM yyyy", es)
                          : format(new Date(d.createdAt), "dd MMM yyyy", {
                              locale: es,
                            })}
                      </span>
                      <DocumentTag dteType={d.dteType} />
                      {!isDraftRow && (
                        <span className="font-mono tabular-nums text-xs text-ds-text-2">
                          #{d.folio}
                        </span>
                      )}
                      <SiiStatusPill siiStatus={d.siiStatus} />
                      {d.activeCession && (
                        <CessionBadge
                          code={d.activeCession.code}
                          factoringName={d.activeCession.factoringCompany}
                        />
                      )}
                      {d.date && (
                        <DteAgingBadge
                          date={d.date}
                          dueDate={d.dueDate}
                          paymentStatus={d.paymentStatus}
                          siiStatus={d.siiStatus}
                        />
                      )}
                      <span className="ml-auto inline-flex">{emailIcon(d)}</span>
                    </div>
                    {d.linkedCreditNote && (
                      <div className="mb-1">
                        <LinkedNoteBadge
                          count={d.linkedCreditNote.count}
                          hasFullAnnulment={d.linkedCreditNote.hasFullAnnulment}
                          primaryFolio={d.linkedCreditNote.primaryFolio}
                          creditedNet={d.linkedCreditNote.creditedNet}
                        />
                      </div>
                    )}
                    {d.referenceFolio != null && d.referenceType != null && (
                      <div className="mb-1">
                        <RelationRow
                          referenceCode={null}
                          referenceFolio={d.referenceFolio}
                          referenceType={d.referenceType}
                          compact
                        />
                      </div>
                    )}
                    {fantasyName && !sameName ? (
                      <Link
                        href={`/crm/accounts/${d.crmAccount?.id}?tab=contracts`}
                        onClick={(e) => e.stopPropagation()}
                        className="block text-sm font-medium text-ds-text-1 truncate hover:underline focus-visible:underline outline-none"
                        title={
                          secondaryName
                            ? `${primaryName} · ${secondaryName}`
                            : primaryName
                        }
                      >
                        {primaryName}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium text-ds-text-1 truncate">
                        {primaryName}
                      </p>
                    )}
                    {d.installation?.name && (
                      <p
                        className="text-xs text-ds-text-3 truncate"
                        title={d.installation.name}
                      >
                        {d.installation.name}
                      </p>
                    )}
                    <p className="text-xs text-ds-text-4 font-mono tabular-nums">
                      {d.receiverRut}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={cn(
                          "font-mono text-sm font-semibold tabular-nums truncate",
                          isAnnulled && "line-through text-ds-text-3",
                        )}
                        title={d.totalAmount.toLocaleString("es-CL")}
                      >
                        {fmtCLPSmart(d.totalAmount)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <DtePaymentTag
                        paymentStatus={d.paymentStatus}
                        totalAmount={d.totalAmount}
                        lastReconciliation={d.lastReconciliation}
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="flex gap-1 mt-3 pt-3 border-t border-ds-border-subtle"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isDraftRow ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditDraft(d.id)}
                      disabled={
                        deletingDraft === d.id || cloningDraft === d.id
                      }
                      className="flex-1 justify-center h-11"
                    >
                      <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                      Editar
                    </Button>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Más acciones"
                    onClick={() => setActionFor(d.id)}
                    className="h-11 w-11 justify-center"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </div>
              </Surface>
            </li>
          );
        })}
      </ul>
      <MobileActionSheet
        open={actionFor !== null}
        onOpenChange={(o) => {
          if (!o) setActionFor(null);
        }}
        title={
          actionRow
            ? actionRow.siiStatus === "DRAFT"
              ? "Borrador"
              : `DTE #${actionRow.folio}`
            : ""
        }
        description={actionRow?.receiverName ?? undefined}
        items={
          actionRow
            ? buildActionItems(
                actionRow,
                canManage,
                sendingEmail,
                checkingStatus,
                voiding,
                deletingDraft,
                cloningDraft,
                {
                  onPreviewPdf: () => onPreviewPdf(actionRow.id),
                  onDownloadPdf: () =>
                    onDownloadPdf(actionRow.id, actionRow.folio),
                  onDownloadXml: () =>
                    onDownloadXml(actionRow.id, actionRow.folio),
                  onResendEmail: () => onResendEmail(actionRow.id),
                  onCheckStatus: () =>
                    onCheckStatus(actionRow.id, actionRow.folio),
                  onVoid: () => onVoid(actionRow.id),
                  onCede: () => onCede(actionRow.id),
                  onCreditNote: () => onCreditNote(actionRow.id),
                  onDebitNote: () => onDebitNote(actionRow.id),
                  onEditDraft: () => onEditDraft(actionRow.id),
                  onIssueDraft: () => onIssueDraft(actionRow.id),
                  onDeleteDraft: () => onDeleteDraft(actionRow.id),
                  onCloneDraft: () => onCloneDraft(actionRow.id),
                  onOpenCession: () => {
                    if (actionRow.activeCession) {
                      window.location.href = `/finanzas/facturacion/cesiones/${actionRow.activeCession.id}`;
                    }
                  },
                },
              )
            : []
        }
      />
    </>
  );
}
