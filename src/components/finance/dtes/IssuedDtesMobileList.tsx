"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Mail, MailX, FileEdit, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DteActionsMenu } from "../DteActionsMenu";
import { DteAgingBadge } from "../DteAgingBadge";
import { DocumentTag } from "./DocumentTag";
import { SiiStatusPill } from "./SiiStatusPill";
import { CessionBadge } from "./CessionBadge";
import { LinkedNoteBadge } from "./LinkedNoteBadge";
import { RelationRow } from "./RelationRow";
import { fmtCLPSmart } from "./shared/constants";
import type { DteRow } from "./shared/types";

interface Props {
  rows: DteRow[];
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  canManage: boolean;
  sendingEmail: string | null;
  checkingStatus: string | null;
  voiding: string | null;
  deletingDraft: string | null;
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
}: Props) {
  const selectionMode = selectedIds.size > 0;

  return (
    <div className="space-y-2">
      {rows.map((d) => {
        const isDraftRow = d.siiStatus === "DRAFT";
        const isAnnulled =
          d.siiStatus === "ANNULLED" ||
          d.linkedCreditNote?.hasFullAnnulment === true;
        const isSelected = selectedIds.has(d.id);
        return (
          <Card
            key={d.id}
            className={cn(
              "cursor-pointer hover:bg-ds-surface-2 transition-colors border-l-[3px]",
              d.activeCession ? "border-l-violet-500" : "border-l-transparent",
              isSelected && "ring-2 ring-primary/40",
            )}
            onClick={() =>
              isDraftRow ? onEditDraft(d.id) : onViewDetail(d.id)
            }
          >
            <CardContent className="p-4">
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
                    <DocumentTag dteType={d.dteType} />
                    {!isDraftRow && (
                      <span className="font-mono text-xs text-ds-text-2">
                        #{d.folio}
                      </span>
                    )}
                    <SiiStatusPill siiStatus={d.siiStatus} />
                    {d.activeCession && (
                      <CessionBadge code={d.activeCession.code} />
                    )}
                    {d.date && (
                      <DteAgingBadge
                        date={d.date}
                        dueDate={d.dueDate}
                        paymentStatus={d.paymentStatus}
                        siiStatus={d.siiStatus}
                      />
                    )}
                    <span className="ml-auto inline-flex">
                      {d.emailSentAt ? (
                        <Mail
                          className="h-4 w-4 text-status-ok-fg"
                          aria-label={`Email enviado ${format(new Date(d.emailSentAt), "dd MMM", { locale: es })}`}
                        />
                      ) : d.emailStatus === "FAILED" ? (
                        <MailX
                          className="h-4 w-4 text-status-danger-fg"
                          aria-label="Email falló"
                        />
                      ) : (
                        <Mail
                          className="h-4 w-4 text-ds-text-4"
                          aria-label="Sin enviar"
                        />
                      )}
                    </span>
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
                  <p className="font-medium text-sm text-ds-text-1">
                    {d.receiverName}
                  </p>
                  {d.crmAccount?.name &&
                  d.crmAccount.name.trim().toLowerCase() !==
                    d.receiverName.trim().toLowerCase() ? (
                    <p
                      className="text-xs text-ds-text-3 truncate"
                      title={d.crmAccount.name}
                    >
                      {d.crmAccount.name}
                    </p>
                  ) : null}
                  <p className="text-xs text-ds-text-4 font-mono">
                    {d.receiverRut}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums truncate",
                        isAnnulled && "line-through text-ds-text-3",
                      )}
                      title={d.totalAmount.toLocaleString("es-CL")}
                    >
                      {fmtCLPSmart(d.totalAmount)}
                    </span>
                    <span className="text-xs text-ds-text-3 shrink-0">
                      {format(new Date(d.date ?? d.createdAt), "dd MMM yyyy", {
                        locale: es,
                      })}
                    </span>
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
                    className="flex-1 justify-center"
                  >
                    <FileEdit className="h-3.5 w-3.5 mr-1.5" />
                    Editar
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewDetail(d.id)}
                    className="flex-1 justify-center"
                  >
                    <Eye className="h-3.5 w-3.5 mr-1.5" />
                    Detalle
                  </Button>
                )}
                <DteActionsMenu
                  row={d}
                  canManage={canManage}
                  sendingEmail={sendingEmail}
                  checkingStatus={checkingStatus}
                  voiding={voiding}
                  deletingDraft={deletingDraft}
                  onViewDetail={() => onViewDetail(d.id)}
                  onPreviewPdf={() => onPreviewPdf(d.id)}
                  onDownloadPdf={() => onDownloadPdf(d.id, d.folio)}
                  onDownloadXml={() => onDownloadXml(d.id, d.folio)}
                  onResendEmail={() => onResendEmail(d.id)}
                  onCheckStatus={() => onCheckStatus(d.id, d.folio)}
                  onVoid={() => onVoid(d.id)}
                  onCede={() => onCede(d.id)}
                  onCreditNote={() => onCreditNote(d.id)}
                  onDebitNote={() => onDebitNote(d.id)}
                  onEditDraft={() => onEditDraft(d.id)}
                  onIssueDraft={() => onIssueDraft(d.id)}
                  onDeleteDraft={() => onDeleteDraft(d.id)}
                  triggerVariant="ghost"
                  hideViewDetail
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
