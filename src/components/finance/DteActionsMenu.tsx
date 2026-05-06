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
import {
  Ban,
  Coins,
  Download,
  ExternalLink,
  Eye,
  FileCode,
  FileMinus,
  FilePlus,
  FileSearch,
  Loader2,
  Mail,
  MoreHorizontal,
  RefreshCw,
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
}

interface Props {
  row: DteActionsRow;
  canManage: boolean;
  sendingEmail: string | null;
  checkingStatus: string | null;
  voiding: string | null;
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
  hideViewDetail,
  triggerVariant = "ghost",
}: Props) {
  const canAnular = row.siiStatus === "PENDING" || row.siiStatus === "SENT";
  const canCreditNote =
    [33, 34, 39, 41, 56].includes(row.dteType) && row.siiStatus !== "ANNULLED";
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
      <DropdownMenu>
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
            <DropdownMenuItem onClick={onCreditNote}>
              <FileMinus className="h-4 w-4 mr-2" />
              Nota de Crédito
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
