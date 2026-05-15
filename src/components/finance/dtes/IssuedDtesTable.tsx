"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Building, MapPin, Mail, MailX, Eye } from "lucide-react";
import { DataTable, EmptyState, type DataTableColumn } from "@/components/opai-ds";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { DteActionsMenu } from "../DteActionsMenu";
import { DteAgingBadge } from "../DteAgingBadge";
import { DocumentTag } from "./DocumentTag";
import { DtePaymentTag } from "./DtePaymentTag";
import { SiiStatusPill } from "./SiiStatusPill";
import { CessionBadge } from "./CessionBadge";
import { LinkedNoteBadge } from "./LinkedNoteBadge";
import { RelationRow } from "./RelationRow";
import { fmtCLP } from "./shared/constants";
import { formatCalendarDateDisplay } from "@/lib/fx-date";
import type { DteRow } from "./shared/types";

interface Props {
  rows: DteRow[];
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: (visibleIds: string[], allSelected: boolean) => void;
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
  onUnreconcile?: (id: string) => void;
  onMarkUnpaid?: (id: string) => void;
}

/** Tri-state checkbox: indeterminate cuando hay selección parcial. */
function TriStateCheckbox({
  state,
  onChange,
  ariaLabel,
}: {
  state: "all" | "some" | "none";
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={state === "all"}
      ref={(el) => {
        if (el) el.indeterminate = state === "some";
      }}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 rounded border-ds-border-default bg-ds-surface-2 text-primary cursor-pointer"
    />
  );
}

export function IssuedDtesTable({
  rows,
  selectedIds,
  onToggleRow,
  onToggleAll,
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
  onUnreconcile,
  onMarkUnpaid,
}: Props) {
  const visibleIds = rows.map((r) => r.id);
  const selectedVisible = visibleIds.filter((id) => selectedIds.has(id));
  const headerState =
    selectedVisible.length === 0
      ? "none"
      : selectedVisible.length === visibleIds.length
        ? "all"
        : "some";

  const columns: DataTableColumn<DteRow>[] = [
    {
      id: "_select",
      header: (
        <TriStateCheckbox
          state={headerState}
          onChange={() => onToggleAll(visibleIds, headerState === "all")}
          ariaLabel="Seleccionar todos"
        />
      ),
      width: "w-9",
      cell: (row) => (
        <input
          type="checkbox"
          aria-label={`Seleccionar DTE ${row.folio}`}
          checked={selectedIds.has(row.id)}
          onChange={() => onToggleRow(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-ds-border-default bg-ds-surface-2 text-primary cursor-pointer"
        />
      ),
    },
    {
      id: "date",
      header: "Fecha",
      width: "w-[88px]",
      cell: (row) => (
        <span className="text-ds-text-3 text-xs font-mono tabular-nums">
          {row.date
            ? formatCalendarDateDisplay(row.date, "dd MMM yyyy", es)
            : format(new Date(row.createdAt), "dd MMM yyyy", { locale: es })}
        </span>
      ),
    },
    {
      id: "dteType",
      header: "Tipo",
      width: "w-[96px]",
      cell: (row) => <DocumentTag dteType={row.dteType} />,
    },
    {
      id: "folio",
      header: "Folio",
      width: "w-[132px]",
      cell: (row) => (
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono tabular-nums text-xs">
              {row.siiStatus === "DRAFT" ? "—" : row.folio}
            </span>
            {row.activeCession && (
              <CessionBadge
                code={row.activeCession.code}
                factoringName={row.activeCession.factoringCompany}
              />
            )}
            {row.linkedCreditNote && (
              <LinkedNoteBadge
                count={row.linkedCreditNote.count}
                hasFullAnnulment={row.linkedCreditNote.hasFullAnnulment}
                primaryFolio={row.linkedCreditNote.primaryFolio}
                creditedNet={row.linkedCreditNote.creditedNet}
              />
            )}
          </div>
          {row.referenceFolio != null && row.referenceType != null && (
            <RelationRow
              referenceCode={null}
              referenceFolio={row.referenceFolio}
              referenceType={row.referenceType}
              compact
            />
          )}
        </div>
      ),
    },
    {
      id: "receiverName",
      header: "Receptor",
      width: "w-[236px]",
      cell: (row) => {
        // Receptor: nombre de fantasía (CRM) primero, razón social después,
        // RUT al pie. Cuando no hay nombre de fantasía o coincide con la
        // razón social, mostramos solo la razón social como `primary`.
        const fantasyName = row.crmAccount?.name?.trim() || null;
        const legalName = row.receiverName?.trim() || "";
        const sameName =
          fantasyName && fantasyName.toLowerCase() === legalName.toLowerCase();
        const primary = fantasyName && !sameName ? fantasyName : legalName;
        const secondary = fantasyName && !sameName ? legalName : null;
        return (
          <div className="min-w-0">
            <div
              className="text-sm font-medium text-ds-text-1 truncate"
              title={primary}
            >
              {primary}
            </div>
            {secondary && (
              <div
                className="text-xs text-ds-text-3 truncate"
                title={secondary}
              >
                {secondary}
              </div>
            )}
            <div className="text-xs text-ds-text-4 font-mono tabular-nums truncate">
              {row.receiverRut}
            </div>
          </div>
        );
      },
    },
    {
      id: "totalAmount",
      header: "Total",
      align: "right",
      width: "w-[120px]",
      cell: (row) => {
        const isAnnulled =
          row.siiStatus === "ANNULLED" ||
          row.linkedCreditNote?.hasFullAnnulment === true;
        return (
          <span
            className={cn(
              "font-medium font-mono tabular-nums",
              isAnnulled && "text-ds-text-3 line-through",
            )}
          >
            {fmtCLP.format(row.totalAmount)}
          </span>
        );
      },
    },
    {
      // Pago / Conciliación con cartola — visible para todos los DTEs
      // emitidos. Hace tooltip con detalle del mov. bancario cuando
      // existe un FinancePaymentRecord asociado a la cartola (post 2026-05).
      id: "payment",
      header: "Pago",
      width: "w-[128px]",
      cell: (row) => (
        <DtePaymentTag
          paymentStatus={row.paymentStatus}
          totalAmount={row.totalAmount}
          lastReconciliation={row.lastReconciliation}
        />
      ),
    },
    {
      id: "siiStatus",
      header: "Estado SII",
      width: "w-[120px]",
      cell: (row) => (
        <div className="flex items-center gap-1.5 flex-wrap">
          <SiiStatusPill siiStatus={row.siiStatus} />
          {row.date && (
            <DteAgingBadge
              date={row.date}
              dueDate={row.dueDate}
              paymentStatus={row.paymentStatus}
              siiStatus={row.siiStatus}
            />
          )}
        </div>
      ),
    },
    {
      id: "emailStatus",
      header: "Email",
      align: "center",
      width: "w-[52px]",
      cell: (row) => {
        if (row.emailSentAt) {
          return (
            <span
              title={`Enviado ${format(new Date(row.emailSentAt), "dd MMM yyyy", { locale: es })}`}
              className="inline-flex"
            >
              <Mail className="h-4 w-4 text-status-ok-fg" />
            </span>
          );
        }
        if (row.emailStatus === "FAILED") {
          return (
            <span title="Email falló" className="inline-flex">
              <MailX className="h-4 w-4 text-status-danger-fg" />
            </span>
          );
        }
        return (
          <span title="Sin enviar" className="inline-flex">
            <Mail className="h-4 w-4 text-ds-text-4" />
          </span>
        );
      },
    },
    {
      // Lo que mostramos acá ES el cliente CRM + la instalación a la que
      // pertenece el DTE. "Centro de costo" confundía al usuario porque
      // parecía un campo extra que tenía que llenar a mano — en realidad
      // se deriva de la cuenta y la instalación asociadas al emitir.
      id: "centroCosto",
      header: "Cliente / Instalación",
      width: "w-[176px]",
      cell: (row) => {
        if (!row.crmAccount) {
          return (
            <span className="text-xs text-ds-text-4 italic">Sin asignar</span>
          );
        }
        // El nombre de la cuenta es un link a la ficha del cliente,
        // pestaña "Contratos" — desde DTEs típicamente se quiere revisar
        // el contrato asociado. stopPropagation evita disparar el click
        // del row si el contenedor lo tuviera más adelante.
        return (
          <div className="min-w-0 text-xs space-y-0.5">
            <Link
              href={`/crm/accounts/${row.crmAccount.id}?tab=contracts`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 min-w-0 hover:underline focus-visible:underline outline-none"
              title={`Ver ficha de ${row.crmAccount.name}`}
            >
              <Building className="h-3 w-3 shrink-0 text-ds-text-4" />
              <span className="truncate font-medium">
                {row.crmAccount.name}
              </span>
            </Link>
            {row.installation && (
              <div
                className="flex items-center gap-1 min-w-0 text-ds-text-3"
                title={row.installation.name}
              >
                <MapPin className="h-3 w-3 shrink-0 text-ds-text-4" />
                <span className="truncate">{row.installation.name}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: "_actions",
      header: "",
      width: "w-[84px]",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            aria-label="Ver detalle"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail(row.id);
            }}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-ds-surface-2 text-ds-text-3 hover:text-ds-text-1 transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
          <DteActionsMenu
            row={{
              ...row,
              paymentStatus: row.paymentStatus ?? undefined,
              hasBankReconciliation:
                !!row.lastReconciliation?.bankTransactionId,
            }}
            canManage={canManage}
            sendingEmail={sendingEmail}
            checkingStatus={checkingStatus}
            voiding={voiding}
            deletingDraft={deletingDraft}
            onViewDetail={() => onViewDetail(row.id)}
            onPreviewPdf={() => onPreviewPdf(row.id)}
            onDownloadPdf={() => onDownloadPdf(row.id, row.folio)}
            onDownloadXml={() => onDownloadXml(row.id, row.folio)}
            onResendEmail={() => onResendEmail(row.id)}
            onCheckStatus={() => onCheckStatus(row.id, row.folio)}
            onVoid={() => onVoid(row.id)}
            onCede={() => onCede(row.id)}
            onCreditNote={() => onCreditNote(row.id)}
            onDebitNote={() => onDebitNote(row.id)}
            onEditDraft={() => onEditDraft(row.id)}
            onIssueDraft={() => onIssueDraft(row.id)}
            onDeleteDraft={() => onDeleteDraft(row.id)}
            onUnreconcile={
              onUnreconcile ? () => onUnreconcile(row.id) : undefined
            }
            onMarkUnpaid={
              onMarkUnpaid ? () => onMarkUnpaid(row.id) : undefined
            }
            hideViewDetail
          />
        </div>
      ),
    },
  ];

  return (
    <DataTable<DteRow>
      columns={columns}
      rows={rows}
      layout="fixed"
      rowKey={(row) => row.id}
      rowVariant={(row) =>
        row.siiStatus === "ANNULLED" ||
        row.linkedCreditNote?.hasFullAnnulment === true
          ? "danger"
          : "default"
      }
      onRowClick={(row) =>
        row.siiStatus === "DRAFT" ? onEditDraft(row.id) : onViewDetail(row.id)
      }
      empty={
        <EmptyState
          icon={FileText}
          title="Sin documentos"
          description="No hay DTEs en la página actual."
          compact
        />
      }
    />
  );
}
