"use client";

import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Building, MapPin, Mail, MailX, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { DataTable, EmptyState, Tag, type DataTableColumn } from "@/components/opai-ds";
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
import type { DteRow, DteSortKey } from "./shared/types";

/** Header clickeable que ordena por su columna. Toggle desc→asc→desc; muestra
 *  flecha activa. Si no se pasa onSortChange, cae a un header plano. */
function SortHeader({
  label,
  col,
  sort,
  onSortChange,
}: {
  label: string;
  col: "date" | "tipo" | "folio" | "total";
  sort?: DteSortKey;
  onSortChange?: (key: DteSortKey) => void;
}) {
  if (!onSortChange) return <>{label}</>;
  const activeDesc = sort === `${col}_desc`;
  const activeAsc = sort === `${col}_asc`;
  const next: DteSortKey = activeDesc ? `${col}_asc` : `${col}_desc`;
  return (
    <button
      type="button"
      onClick={() => onSortChange(next)}
      className="inline-flex items-center gap-1 hover:text-ds-text-1 transition-colors"
      title={`Ordenar por ${label.toLowerCase()}`}
    >
      {label}
      {activeDesc ? (
        <ChevronDown className="h-3 w-3" />
      ) : activeAsc ? (
        <ChevronUp className="h-3 w-3" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

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
  cloningDraft: string | null;
  onViewDetail: (id: string) => void;
  onPreviewPdf: (id: string) => void;
  onDownloadPdf: (id: string, folio: number) => void;
  onDownloadXml: (id: string, folio: number) => void;
  onResendEmail: (id: string) => void;
  onSendCobranza: (id: string) => void;
  onCheckStatus: (id: string, folio: number) => void;
  onVoid: (id: string) => void;
  onCede: (id: string) => void;
  onCreditNote: (id: string) => void;
  onDebitNote: (id: string) => void;
  onEditDraft: (id: string) => void;
  onIssueDraft: (id: string) => void;
  onDeleteDraft: (id: string) => void;
  onCloneDraft: (id: string) => void;
  onUnreconcile?: (id: string) => void;
  onMarkUnpaid?: (id: string) => void;
  /** Sort actual + callback para headers clickeables (fecha/tipo/folio/monto). */
  sort?: DteSortKey;
  onSortChange?: (key: DteSortKey) => void;
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
  cloningDraft,
  onViewDetail,
  onPreviewPdf,
  onDownloadPdf,
  onDownloadXml,
  onResendEmail,
  onSendCobranza,
  onCheckStatus,
  onVoid,
  onCede,
  onCreditNote,
  onDebitNote,
  onEditDraft,
  onIssueDraft,
  onDeleteDraft,
  onCloneDraft,
  onUnreconcile,
  onMarkUnpaid,
  sort,
  onSortChange,
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
      header: <SortHeader label="Fecha" col="date" sort={sort} onSortChange={onSortChange} />,
      width: "w-[112px]",
      cell: (row) => {
        // Para DRAFT: mostrar dos fechas — la del documento (teórica) y
        // la de generación real (createdAt). Sin esto, era imposible
        // distinguir cuándo se generó un borrador.
        // Para emitidas (no-DRAFT): solo la fecha del documento, que es
        // la que importa contablemente.
        const fechaDoc = row.date
          ? formatCalendarDateDisplay(row.date, "dd MMM yyyy", es)
          : format(new Date(row.createdAt), "dd MMM yyyy", { locale: es });
        const fechaGen = format(new Date(row.createdAt), "dd MMM", { locale: es });
        if (row.siiStatus === "DRAFT") {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="text-ds-text-3 text-xs font-mono tabular-nums">
                {fechaDoc}
              </span>
              <span className="text-ds-text-4 text-[11px] font-mono tabular-nums uppercase tracking-[0.08em]">
                Gen. {fechaGen}
              </span>
            </div>
          );
        }
        return (
          <span className="text-ds-text-3 text-xs font-mono tabular-nums">
            {fechaDoc}
          </span>
        );
      },
    },
    {
      id: "dteType",
      header: <SortHeader label="Tipo" col="tipo" sort={sort} onSortChange={onSortChange} />,
      width: "w-[96px]",
      cell: (row) => <DocumentTag dteType={row.dteType} />,
    },
    {
      id: "folio",
      header: <SortHeader label="Folio" col="folio" sort={sort} onSortChange={onSortChange} />,
      width: "min-w-0 w-[172px]",
      cell: (row) => (
        <div className="min-w-0 max-w-full overflow-hidden space-y-1">
          <div className="font-mono tabular-nums text-xs">
            {/* El borrador es una etapa del documento (aún sin folio), no un
                estado SII. Lo mostramos acá, en la identidad del doc, en vez de
                la columna Estado SII. Pasa a folio real al emitirse. */}
            {row.siiStatus === "DRAFT" ? (
              <SiiStatusPill siiStatus="DRAFT" size="sm" />
            ) : (
              row.folio
            )}
          </div>
          {(row.activeCession || row.linkedCreditNote) && (
            <div className="flex flex-col items-start gap-1 min-w-0 max-w-full">
              {row.activeCession ? (
                <CessionBadge
                  code={row.activeCession.code}
                  factoringName={row.activeCession.factoringCompany}
                />
              ) : null}
              {row.linkedCreditNote ? (
                <LinkedNoteBadge
                  count={row.linkedCreditNote.count}
                  hasFullAnnulment={row.linkedCreditNote.hasFullAnnulment}
                  primaryFolio={row.linkedCreditNote.primaryFolio}
                  creditedNet={row.linkedCreditNote.creditedNet}
                />
              ) : null}
            </div>
          )}
          {row.referenceFolio != null && row.referenceType != null ? (
            <RelationRow
              referenceCode={null}
              referenceFolio={row.referenceFolio}
              referenceType={row.referenceType}
              compact
            />
          ) : null}
        </div>
      ),
    },
    {
      id: "receiverName",
      header: "Receptor",
      width: "w-[260px]",
      cell: (row) => {
        const accountName = row.crmAccount?.name?.trim() || null;
        const legalName = row.receiverName?.trim() || "";
        const installationName = row.installation?.name?.trim() || null;
        const sameName =
          accountName && accountName.toLowerCase() === legalName.toLowerCase();
        const primary = accountName && !sameName ? accountName : legalName;
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-1 min-w-0">
              <Building className="h-3 w-3 shrink-0 text-ds-text-4" />
              {row.crmAccount ? (
                <Link
                  href={`/crm/accounts/${row.crmAccount.id}?tab=contracts`}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm font-medium text-ds-text-1 truncate hover:underline focus-visible:underline outline-none"
                  title={
                    accountName && !sameName
                      ? `${primary} · ${legalName}`
                      : primary
                  }
                >
                  {primary}
                </Link>
              ) : (
                <span
                  className="text-sm font-medium text-ds-text-1 truncate"
                  title={primary}
                >
                  {primary}
                </span>
              )}
            </div>
            {installationName && (
              <div
                className="flex items-center gap-1 min-w-0 text-xs text-ds-text-3"
                title={installationName}
              >
                <MapPin className="h-3 w-3 shrink-0 text-ds-text-4" />
                <span className="truncate">{installationName}</span>
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
      header: <SortHeader label="Total" col="total" sort={sort} onSortChange={onSortChange} />,
      align: "right",
      width: "min-w-0 w-[128px]",
      cell: (row) => {
        const isAnnulled =
          row.siiStatus === "ANNULLED" ||
          !!row.voidedByCreditNoteId ||
          row.linkedCreditNote?.hasFullAnnulment === true;
        return (
          <span
            className={cn(
              "inline-block max-w-full whitespace-nowrap font-medium font-mono tabular-nums text-right",
              isAnnulled && "text-ds-text-3 line-through",
            )}
            title={fmtCLP.format(row.totalAmount)}
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
      width: "min-w-0 w-[144px]",
      cell: (row) => (
        <div className="min-w-0 max-w-full">
          <DtePaymentTag
            paymentStatus={row.paymentStatus}
            totalAmount={row.totalAmount}
            lastReconciliation={row.lastReconciliation}
          />
        </div>
      ),
    },
    {
      id: "siiStatus",
      header: "Estado SII",
      width: "min-w-0 w-[128px]",
      cell: (row) => {
        // Estado de acreditación por NC: lee los campos persistidos
        // en el original (más confiable que linkedCreditNote derivado).
        const isVoidedByNc = !!row.voidedByCreditNoteId;
        const partiallyCredited =
          !isVoidedByNc && Number(row.creditedNetAmount ?? 0) > 0;
        // Un borrador todavía NO se envió al SII → no tiene estado SII. La etapa
        // "Borrador" se muestra en la columna Folio (identidad del doc), no acá.
        if (row.siiStatus === "DRAFT") {
          return <span className="text-ds-text-4 text-xs">—</span>;
        }
        return (
          <div className="flex flex-col items-start gap-1 min-w-0 max-w-full">
            <SiiStatusPill siiStatus={row.siiStatus} />
            {isVoidedByNc ? (
              <Tag variant="danger" size="sm">
                Anulada por NC
              </Tag>
            ) : partiallyCredited ? (
              <Tag variant="warn" size="sm">
                Acreditada parcial
              </Tag>
            ) : null}
            {/* Evita duplicar “Pagada” junto a la columna Pago (“Pagado” / “Sin conciliar”).
              También evita aging cuando la factura ya está fuera de cobranza por NC. */}
            {row.date &&
            row.paymentStatus !== "PAID" &&
            row.siiStatus !== "ANNULLED" &&
            !isVoidedByNc &&
            !partiallyCredited ? (
              <DteAgingBadge
                date={row.date}
                dueDate={row.dueDate}
                paymentStatus={row.paymentStatus}
                siiStatus={row.siiStatus}
              />
            ) : null}
          </div>
        );
      },
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
      id: "_actions",
      header: "",
      width: "w-[48px]",
      // Sticky right: las acciones (ver, menú) deben quedar siempre
      // accesibles aunque la tabla haga scroll horizontal en viewports
      // medianos. Sin esto, los iconos se cortan al borde derecho del
      // contenedor y obligan al usuario a scrollear para llegar a ellas.
      sticky: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
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
            cloningDraft={cloningDraft}
            onViewDetail={() => onViewDetail(row.id)}
            onPreviewPdf={() => onPreviewPdf(row.id)}
            onDownloadPdf={() => onDownloadPdf(row.id, row.folio)}
            onDownloadXml={() => onDownloadXml(row.id, row.folio)}
            onResendEmail={() => onResendEmail(row.id)}
            onSendCobranza={() => onSendCobranza(row.id)}
            onCheckStatus={() => onCheckStatus(row.id, row.folio)}
            onVoid={() => onVoid(row.id)}
            onCede={() => onCede(row.id)}
            onCreditNote={() => onCreditNote(row.id)}
            onDebitNote={() => onDebitNote(row.id)}
            onEditDraft={() => onEditDraft(row.id)}
            onIssueDraft={() => onIssueDraft(row.id)}
            onDeleteDraft={() => onDeleteDraft(row.id)}
            onCloneDraft={() => onCloneDraft(row.id)}
            onUnreconcile={
              onUnreconcile ? () => onUnreconcile(row.id) : undefined
            }
            onMarkUnpaid={
              onMarkUnpaid ? () => onMarkUnpaid(row.id) : undefined
            }
            hideViewDetail={false}
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
        !!row.voidedByCreditNoteId ||
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
