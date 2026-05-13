"use client";

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
      width: "w-10",
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
      id: "dteType",
      header: "Tipo",
      cell: (row) => <DocumentTag dteType={row.dteType} />,
    },
    {
      id: "folio",
      header: "Folio",
      cell: (row) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs">
              {row.siiStatus === "DRAFT" ? "—" : row.folio}
            </span>
            {row.activeCession && (
              <CessionBadge
                code={row.activeCession.code}
                factoringName={row.activeCession.factoringCompany}
              />
            )}
          </div>
          {row.activeCession?.factoringCompany && (
            <div
              className="text-[11px] text-violet-300/90 truncate"
              title={row.activeCession.factoringCompany}
            >
              Cedido a {row.activeCession.factoringCompany}
            </div>
          )}
          {row.linkedCreditNote && (
            <LinkedNoteBadge
              count={row.linkedCreditNote.count}
              hasFullAnnulment={row.linkedCreditNote.hasFullAnnulment}
              primaryFolio={row.linkedCreditNote.primaryFolio}
              creditedNet={row.linkedCreditNote.creditedNet}
            />
          )}
          {row.referenceFolio != null && row.referenceType != null && (
            <RelationRow
              referenceCode={row.referenceType === 56 || row.referenceType === 61 ? null : null}
              referenceFolio={row.referenceFolio}
              referenceType={row.referenceType}
            />
          )}
        </div>
      ),
    },
    {
      id: "receiverName",
      header: "Receptor",
      cell: (row) => {
        // Mostrar también el nombre de la cuenta CRM (nombre de fantasía)
        // si difiere de la razón social emitida en el DTE. Permite que la
        // búsqueda y el reconocimiento visual funcione tanto con
        // "ANDALUZA DE MONTAJES..." como con "Ametel".
        const accountName = row.crmAccount?.name;
        const showFantasy =
          accountName &&
          accountName.trim().toLowerCase() !==
            row.receiverName.trim().toLowerCase();
        return (
          <div>
            <div className="text-sm">{row.receiverName}</div>
            {showFantasy ? (
              <div
                className="text-xs text-ds-text-3 truncate"
                title={accountName}
              >
                {accountName}
              </div>
            ) : null}
            <div className="text-xs text-ds-text-4 font-mono">
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
      cell: (row) => {
        const isAnnulled =
          row.siiStatus === "ANNULLED" ||
          row.linkedCreditNote?.hasFullAnnulment === true;
        return (
          <span
            className={cn(
              "font-medium",
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
      id: "date",
      header: "Fecha",
      cell: (row) => (
        <span className="text-ds-text-3 text-xs">
          {format(new Date(row.date ?? row.createdAt), "dd MMM yyyy", {
            locale: es,
          })}
        </span>
      ),
    },
    {
      id: "emailStatus",
      header: "Email",
      align: "center",
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
      cell: (row) => {
        if (!row.crmAccount) {
          return (
            <span className="text-xs text-ds-text-4 italic">Sin asignar</span>
          );
        }
        return (
          <div className="text-xs space-y-0.5">
            <div
              className="flex items-center gap-1 truncate"
              title={row.crmAccount.name}
            >
              <Building className="h-3 w-3 shrink-0 text-ds-text-4" />
              <span className="truncate font-medium">
                {row.crmAccount.name}
              </span>
            </div>
            {row.installation && (
              <div
                className="flex items-center gap-1 truncate text-ds-text-3"
                title={row.installation.name}
              >
                <MapPin className="h-3 w-3 shrink-0" />
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
      width: "w-24",
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
            row={row}
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
