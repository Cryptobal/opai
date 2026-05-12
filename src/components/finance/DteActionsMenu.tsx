"use client";

/**
 * DteActionsMenu — Menú de acciones colapsado para una fila de DTE emitido.
 *
 * Sustituye los 8 botones inline (PDF, XML, Email, Estado SII, Anular,
 * NC, ND, Ceder) por:
 *   - 1 botón siempre visible "Ver detalle" (Eye)
 *   - 1 botón "..." que abre un DropdownMenu con todas las demás acciones
 *     agrupadas (Documento / Comunicación / SII / Acciones / Anular).
 *
 * Reglas SII aplicadas:
 *   - PDF/XML: solo si `hasXml` (DTEs importados de SII no lo tienen).
 *   - Anular: SOLO si SII aún no aceptó (PENDING/SENT). Una vez ACCEPTED,
 *     hay que emitir una NC (CodRef=1).
 *   - NC: aplica a 33 (Factura), 34 (F. Exenta), 39 (Boleta), 41
 *     (B. Exenta), 56 (N. Débito).
 *   - ND: SOLO aplica a 61 (NC) — la ND se usa exclusivamente para
 *     anular una NC emitida por error.
 *   - Ceder a factoring: 33/34/43/46 + ACCEPTED + hasXml + sin cesión activa.
 */

import Link from "next/link";
import { formatCLP } from "@/lib/utils";
import {
  Ban,
  Coins,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileEdit,
  FileMinus,
  FilePlus,
  FileSearch,
  Loader2,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface DteActionsRow {
  id: string;
  dteType: number;
  folio: number;
  receiverEmail: string | null;
  siiStatus: string;
  emailSentAt: string | null;
  hasXml?: boolean;
  canBeCeded?: boolean;
  activeCession?: { id: string; code: string; status: string } | null;
  /**
   * Resumen de NCs vivas que referencian este DTE. Si tiene anulación
   * total (CodRef=1) o saldo agotado, el item "Nota de Crédito" se
   * muestra deshabilitado con tooltip explicando por qué.
   */
  linkedCreditNote?: {
    count: number;
    hasFullAnnulment: boolean;
    creditedNet: number;
    primaryFolio: number;
  } | null;
  /** Neto original — para detectar saldo agotado en NCs parciales. */
  netAmount?: number;
}

interface Props {
  row: DteActionsRow;
  canManage: boolean;
  sendingEmail: string | null;
  checkingStatus: string | null;
  voiding: string | null;
  /** Si el borrador está siendo eliminado, deshabilita la acción. */
  deletingDraft?: string | null;
  onViewDetail: () => void;
  onPreviewPdf: () => void;
  onDownloadPdf: () => void;
  onDownloadXml: () => void;
  onResendEmail: () => void;
  onCheckStatus: () => void;
  onVoid: () => void;
  onCede: () => void;
  onCreditNote: () => void;
  onDebitNote: () => void;
  /** Editar borrador (siiStatus=DRAFT). */
  onEditDraft?: () => void;
  /** Emitir borrador al SII (siiStatus=DRAFT). */
  onIssueDraft?: () => void;
  /** Eliminar borrador (siiStatus=DRAFT). */
  onDeleteDraft?: () => void;
  /** Oculta el botón "Ver detalle" (cuando se renderiza fuera, ej. mobile cards). */
  hideViewDetail?: boolean;
  triggerVariant?: "ghost" | "outline";
}

const SECTION_LABEL =
  "text-[11px] font-mono uppercase tracking-[0.08em] text-muted-foreground";

export function DteActionsMenu({
  row,
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
  hideViewDetail,
  triggerVariant = "ghost",
}: Props) {
  const isDraft = row.siiStatus === "DRAFT";

  // Borrador: solo Editar / Emitir / Eliminar. Las acciones SII estándar
  // (PDF/XML/Email/Anular/NC/ND/Ceder) no aplican porque el borrador no
  // existe aún en SII.
  if (isDraft) {
    return (
      <div className="flex items-center gap-1">
        {canManage && onEditDraft && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onEditDraft();
            }}
            title="Editar borrador"
          >
            <FileEdit className="h-3.5 w-3.5" />
          </Button>
        )}
        {canManage && onIssueDraft && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onIssueDraft();
            }}
            title="Emitir al SII"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
        {canManage && onDeleteDraft && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteDraft();
            }}
            disabled={deletingDraft === row.id}
            title="Eliminar borrador"
            className="text-destructive hover:text-destructive"
          >
            {deletingDraft === row.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    );
  }

  const canAnular = row.siiStatus === "PENDING" || row.siiStatus === "SENT";
  const isCreditableType = [33, 34, 39, 41, 56].includes(row.dteType);
  // Razón por la que el botón "Nota de Crédito" debe quedar bloqueado
  // (deshabilitado con tooltip). Misma lógica que el backend.
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
        : isFullyCredited
          ? `Saldo agotado por NCs previas (${formatCLP(row.linkedCreditNote!.creditedNet)} acreditados)`
          : null;
  const canCreditNote = isCreditableType && row.siiStatus !== "ANNULLED";
  const canDebitNote = row.dteType === 61 && row.siiStatus !== "ANNULLED";
  const hasXml = row.hasXml !== false;
  const canBeCeded = row.canBeCeded === true && !row.activeCession;
  const canCheckStatus =
    canManage && (row.siiStatus === "PENDING" || row.siiStatus === "SENT");
  const canResend = Boolean(
    canManage && row.receiverEmail && hasXml && row.siiStatus !== "ANNULLED",
  );
  const showFinancialSep =
    canManage && (canCreditNote || canDebitNote || canBeCeded);

  return (
    <div className="flex items-center gap-1">
      {!hideViewDetail && (
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetail();
          }}
          title="Ver detalle"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
      )}
      {/*
        modal=false: por default Radix hace scroll-lock al body, lo que
        oculta el scrollbar y dispara un reflow horizontal de toda la
        página (filas se mueven, KPIs saltan). Sin scroll-lock se siente
        igual de bien y el click "fantasma" sobre Anular DTE desaparece.
      */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={triggerVariant}
            size="sm"
            onClick={(e) => e.stopPropagation()}
            title="Más acciones"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Documento */}
          {hasXml && (
            <>
              <DropdownMenuLabel className={SECTION_LABEL}>
                Documento
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={onPreviewPdf}>
                <FileSearch className="h-4 w-4 mr-2" />
                Vista previa PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadPdf}>
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDownloadXml}>
                <FileCode className="h-4 w-4 mr-2" />
                Descargar XML
              </DropdownMenuItem>
            </>
          )}
          {!hasXml && (
            <DropdownMenuLabel className="text-[12px] italic font-normal text-muted-foreground normal-case tracking-normal">
              Importado del SII (sin XML local)
            </DropdownMenuLabel>
          )}

          {/* Comunicación */}
          {canResend && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={SECTION_LABEL}>
                Comunicación
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={onResendEmail}
                disabled={sendingEmail === row.id}
              >
                {sendingEmail === row.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                {row.emailSentAt ? "Reenviar email" : "Enviar email"}
              </DropdownMenuItem>
            </>
          )}

          {/* SII */}
          {canCheckStatus && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onCheckStatus}
                disabled={checkingStatus === row.id}
              >
                {checkingStatus === row.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Consultar estado SII
              </DropdownMenuItem>
            </>
          )}

          {/* Acciones financieras */}
          {showFinancialSep && <DropdownMenuSeparator />}
          {canManage && canCreditNote && (
            <DropdownMenuItem
              onClick={onCreditNote}
              disabled={Boolean(creditNoteBlockedReason)}
              title={creditNoteBlockedReason ?? undefined}
              className={
                creditNoteBlockedReason ? "opacity-60 cursor-not-allowed" : undefined
              }
            >
              <FileMinus className="h-4 w-4 mr-2" />
              <span className="flex-1">Nota de Crédito</span>
              {creditNoteBlockedReason && (
                <span className="text-[10px] text-muted-foreground ml-2 truncate max-w-[140px]">
                  {creditNoteBlockedReason}
                </span>
              )}
            </DropdownMenuItem>
          )}
          {canManage && canDebitNote && (
            <DropdownMenuItem onClick={onDebitNote}>
              <FilePlus className="h-4 w-4 mr-2" />
              Nota de Débito
            </DropdownMenuItem>
          )}
          {canManage && canBeCeded && (
            <DropdownMenuItem onClick={onCede}>
              <Coins className="h-4 w-4 mr-2" />
              Ceder a factoring
            </DropdownMenuItem>
          )}

          {/* Anular (destructivo, al final) */}
          {canManage && canAnular && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onVoid}
                disabled={voiding === row.id}
                className="text-destructive focus:text-destructive"
              >
                {voiding === row.id ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Anular DTE
              </DropdownMenuItem>
            </>
          )}

          {/* Cesión activa */}
          {row.activeCession && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={SECTION_LABEL}>
                Cesión activa
              </DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={`/finanzas/facturacion/cesiones/${row.activeCession.id}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver cesión {row.activeCession.code}
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
