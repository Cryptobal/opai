"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  Loader2,
  FileEdit,
  Send,
  Copy,
  Trash2,
  Mail,
  CheckCircle2,
  Eye,
  AlertCircle,
  MoreVertical,
  MapPin,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtCLP } from "@/components/finance/dtes/shared/constants";
import { DocumentTag } from "@/components/finance/dtes/DocumentTag";
import { DocStatusIcon, OcReferenceChip } from "./SendStatusIcons";
import type {
  DraftDetailItem,
  DraftProformaStatus,
} from "@/modules/finance/billing/dte-draft.service";

interface Props {
  draftId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canIssue: boolean;
  canManage: boolean;
  onAfterMutation: () => void;
}

type SendVariant = "PROFORMA" | "ESTADO_DE_PAGO";

export function DraftDetailSheet({
  draftId,
  open,
  onOpenChange,
  canIssue,
  canManage,
  onAfterMutation,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<SendVariant | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [confirmingIssue, setConfirmingIssue] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/finance/billing/drafts/${draftId}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.success) setDraft(j.data as DraftDetailItem);
        else {
          toast.error(j.error ?? "Error cargando borrador");
          setDraft(null);
        }
      })
      .catch(() => {
        if (alive) toast.error("Error de conexión");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [draftId]);

  async function refreshDetail() {
    const res = await fetch(`/api/finance/billing/drafts/${draftId}`).then((r) =>
      r.json(),
    );
    if (res.success) setDraft(res.data as DraftDetailItem);
  }

  async function handleSendDoc(variant: SendVariant) {
    setSending(variant);
    try {
      const res = await fetch(`/api/finance/billing/drafts/${draftId}/send-as`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error enviando");
        return;
      }
      toast.success(
        variant === "PROFORMA" ? "Proforma enviada" : "Estado de pago enviado",
      );
      await refreshDetail();
      onAfterMutation();
    } finally {
      setSending(null);
    }
  }

  async function handleIssue() {
    setIssuing(true);
    try {
      const res = await fetch(`/api/finance/billing/drafts/${draftId}/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error emitiendo");
        return;
      }
      toast.success("Borrador emitido al SII");
      onAfterMutation();
      onOpenChange(false);
    } finally {
      setIssuing(false);
      setConfirmingIssue(false);
    }
  }

  async function handleDuplicate() {
    const res = await fetch(`/api/finance/billing/drafts/${draftId}/duplicate`, {
      method: "POST",
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Borrador duplicado");
      onAfterMutation();
      onOpenChange(false);
    } else {
      toast.error(json.error ?? "Error duplicando");
    }
  }

  async function handleDelete() {
    const res = await fetch(`/api/finance/billing/drafts/${draftId}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (json.success) {
      toast.success("Borrador eliminado");
      onAfterMutation();
      onOpenChange(false);
    } else {
      toast.error(json.error ?? "Error eliminando");
    }
    setConfirmingDelete(false);
  }

  function handleEditFull() {
    router.push(`/finanzas/facturacion/emitir?draftId=${draftId}`);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="sm:max-w-2xl sm:mx-auto sm:rounded-t-2xl h-[92dvh] sm:h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden"
      >
        {loading || !draft ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-ds-text-3" />
          </div>
        ) : (
          <>
            <SheetHeader className="px-4 pt-4 pb-3 border-b border-ds-border-subtle text-left space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <SheetTitle className="text-base font-semibold text-ds-text-1 truncate">
                    {draft.receiverName ?? "Sin cliente"}
                  </SheetTitle>
                  {draft.receiverRut && (
                    <SheetDescription className="text-[12px] text-ds-text-3 font-mono">
                      {draft.receiverRut}
                    </SheetDescription>
                  )}
                  {(draft.installationName || draft.crmAccountName) && (
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-ds-text-3 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        {draft.installationName ?? draft.crmAccountName}
                        {draft.installationCommune && (
                          <span className="text-ds-text-4">
                            {" · "}
                            {draft.installationCommune}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Más acciones"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleEditFull}>
                        <FileEdit className="h-4 w-4 mr-2" />
                        Editar completo
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDuplicate}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setConfirmingDelete(true)}
                        className="text-status-danger-fg focus:text-status-danger-fg"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DocumentTag dteType={draft.dteType} />
                <span className="inline-flex items-center rounded-md border border-tint-violet-fg/30 bg-tint-violet/30 px-1.5 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] text-tint-violet-fg">
                  Borrador
                </span>
                <span className="font-mono text-[12px] text-ds-text-3 tabular-nums">
                  {format(new Date(draft.date), "dd MMM yyyy", { locale: es })}
                </span>
                <OcReferenceChip references={draft.additionalReferences} />
              </div>
              <div className="mt-2 space-y-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-xl font-semibold tabular-nums text-ds-text-1">
                    {fmtCLP.format(draft.netAmount)}
                  </span>
                  <span className="text-xs uppercase tracking-wider text-ds-text-3">neto</span>
                </div>
                <div className="flex items-baseline gap-3 text-xs text-ds-text-3 font-mono tabular-nums">
                  <span>IVA {fmtCLP.format(draft.taxAmount)}</span>
                  <span>·</span>
                  <span>Total c/IVA {fmtCLP.format(draft.totalAmount)}</span>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="cobranza" className="w-full">
                <TabsList className="w-full justify-start rounded-none border-b border-ds-border-subtle bg-ds-surface-1 px-4 h-12 sticky top-0 z-10">
                  <TabsTrigger value="cobranza">Cobranza</TabsTrigger>
                  <TabsTrigger value="lineas">
                    Líneas ({draft.lines.length})
                  </TabsTrigger>
                  <TabsTrigger value="referencias">
                    Referencias
                    {draft.additionalReferences?.length
                      ? ` (${draft.additionalReferences.length})`
                      : ""}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="cobranza" className="px-4 py-4 space-y-5">
                  <DocSection
                    variant="PROFORMA"
                    label="Proforma"
                    required={draft.requireProforma}
                    status={draft.proformaStatus}
                    sentAt={draft.proformaSentAt}
                    sentCount={draft.proformaSentCount}
                    lastRecipient={draft.proformaLastRecipient}
                    sending={sending === "PROFORMA"}
                    onSend={() => handleSendDoc("PROFORMA")}
                  />
                  <DocSection
                    variant="ESTADO_DE_PAGO"
                    label="Estado de pago"
                    required={draft.requireEstadoPago}
                    status={draft.estadoPagoStatus}
                    sentAt={draft.estadoPagoSentAt}
                    sentCount={draft.estadoPagoSentCount}
                    lastRecipient={draft.estadoPagoLastRecipient}
                    sending={sending === "ESTADO_DE_PAGO"}
                    onSend={() => handleSendDoc("ESTADO_DE_PAGO")}
                  />

                  {draft.emailLogs.length > 0 && (
                    <section>
                      <h4 className="text-[12px] uppercase tracking-[0.08em] font-mono text-ds-text-3 mb-2">
                        Historial
                      </h4>
                      <ul className="space-y-2">
                        {draft.emailLogs.map((log) => (
                          <li
                            key={log.id}
                            className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[12px] text-ds-text-3 tabular-nums">
                                {format(new Date(log.sentAt), "dd MMM HH:mm", {
                                  locale: es,
                                })}
                              </span>
                              <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                                {humanizeKind(log.kind)}
                              </span>
                            </div>
                            <p className="text-sm text-ds-text-1 mt-1 truncate">
                              → {log.to.join(", ")}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-[12px] mt-1.5 text-ds-text-3">
                              <EmailDeliveryDot
                                label="Entregada"
                                at={log.deliveredAt}
                              />
                              <EmailDeliveryDot
                                label="Vista"
                                at={log.openedAt}
                                icon={<Eye className="h-3 w-3" />}
                              />
                              {log.bouncedAt && (
                                <span className="inline-flex items-center gap-1 text-status-danger-fg">
                                  <AlertCircle className="h-3 w-3" />
                                  Bounce
                                </span>
                              )}
                              {log.errorMessage && (
                                <span
                                  className="text-status-danger-fg truncate"
                                  title={log.errorMessage}
                                >
                                  Error
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </TabsContent>

                <TabsContent value="lineas" className="px-4 py-4">
                  <ul className="divide-y divide-ds-border-subtle">
                    {draft.lines.map((l) => (
                      <li
                        key={l.id}
                        className="py-3 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-ds-text-1">{l.description}</p>
                          <p className="text-[12px] text-ds-text-3 font-mono tabular-nums">
                            {l.quantity} × {fmtCLP.format(l.unitPrice)}
                          </p>
                        </div>
                        <span className="font-mono text-sm tabular-nums text-ds-text-1 shrink-0">
                          {fmtCLP.format(l.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 space-y-1 text-sm">
                    <div className="flex justify-between text-ds-text-3">
                      <span>Subtotal neto</span>
                      <span className="font-mono tabular-nums">
                        {fmtCLP.format(draft.netAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-ds-text-3">
                      <span>IVA (19%)</span>
                      <span className="font-mono tabular-nums">
                        {fmtCLP.format(draft.taxAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-ds-text-1 font-semibold border-t border-ds-border-subtle pt-2 mt-2">
                      <span>Total con IVA</span>
                      <span className="font-mono tabular-nums">
                        {fmtCLP.format(draft.totalAmount)}
                      </span>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="referencias" className="px-4 py-4">
                  {!draft.additionalReferences ||
                  draft.additionalReferences.length === 0 ? (
                    <p className="text-sm text-ds-text-3">
                      Sin referencias adicionales.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {draft.additionalReferences.map((ref, i) => (
                        <li
                          key={`${ref.tipoDocRef}-${ref.folioRef}-${i}`}
                          className="rounded-md border border-ds-border-subtle bg-ds-surface-2 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3">
                              {humanizeRefType(ref.tipoDocRef)}
                            </span>
                            <span className="font-mono text-sm text-ds-text-1">
                              #{ref.folioRef}
                            </span>
                          </div>
                          {ref.razonRef && (
                            <p className="text-[12px] text-ds-text-2 mt-1">
                              {ref.razonRef}
                            </p>
                          )}
                          {ref.fchRef && (
                            <p className="text-[12px] text-ds-text-4 font-mono mt-0.5 tabular-nums">
                              {ref.fchRef}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <div
              className="border-t border-ds-border-subtle bg-ds-surface-1 px-4 py-3 flex gap-2"
              style={{
                paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
              }}
            >
              <Button
                variant="outline"
                onClick={handleEditFull}
                className="flex-1 h-11"
              >
                <FileEdit className="h-4 w-4 mr-1.5" />
                Editar completo
              </Button>
              {canIssue && (
                <Button
                  onClick={() => setConfirmingIssue(true)}
                  className="flex-1 h-11"
                >
                  <Send className="h-4 w-4 mr-1.5" />
                  Emitir SII
                </Button>
              )}
            </div>

            <ConfirmDialog
              open={confirmingIssue}
              onOpenChange={(o) => !issuing && setConfirmingIssue(o)}
              title="¿Emitir borrador al SII?"
              description={
                <>
                  Vas a emitir <strong>{draft.receiverName ?? "Sin cliente"}</strong>{" "}
                  por <strong>{fmtCLP.format(draft.totalAmount)}</strong>. Esta
                  acción asigna folio y no se puede deshacer (solo con NC).
                </>
              }
              confirmLabel="Emitir al SII"
              cancelLabel="Cancelar"
              variant="default"
              loading={issuing}
              loadingLabel="Emitiendo..."
              onConfirm={handleIssue}
            />
            <ConfirmDialog
              open={confirmingDelete}
              onOpenChange={setConfirmingDelete}
              title="¿Eliminar borrador?"
              description="Esta acción no se puede deshacer."
              confirmLabel="Eliminar"
              cancelLabel="Cancelar"
              variant="destructive"
              onConfirm={handleDelete}
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmailDeliveryDot({
  label,
  at,
  icon,
}: {
  label: string;
  at: string | null;
  icon?: ReactNode;
}) {
  if (!at) return null;
  return (
    <span className="inline-flex items-center gap-1 text-status-ok-fg">
      {icon ?? <CheckCircle2 className="h-3 w-3" />}
      {label} {format(new Date(at), "dd MMM", { locale: es })}
    </span>
  );
}

function humanizeKind(kind: string) {
  const map: Record<string, string> = {
    AUTO_PROFORMA: "Proforma auto",
    MANUAL_PROFORMA: "Proforma manual",
    AUTO_ESTADO_PAGO: "Estado pago auto",
    MANUAL_ESTADO_PAGO: "Estado pago manual",
    AUTO_RECEIVER: "DTE al cliente",
    AUTO_BACKOFFICE: "Backoffice",
    MANUAL_RESEND: "Reenvío manual",
    MANUAL_OVERRIDE_RECIPIENT: "Reenvío a otro",
    MANUAL_BACKOFFICE: "Backoffice manual",
  };
  return map[kind] ?? kind;
}

function humanizeRefType(t: string) {
  const map: Record<string, string> = {
    "801": "Orden de Compra",
    HES: "HES",
    "803": "Contrato",
    "802": "Nota de pedido",
    "804": "Resolución",
    "805": "Proceso ChileCompra",
  };
  return map[t] ?? `Tipo ${t}`;
}

interface DocSectionProps {
  variant: SendVariant;
  label: string;
  required: boolean;
  status: DraftProformaStatus;
  sentAt: string | null;
  sentCount: number;
  lastRecipient: string | null;
  sending: boolean;
  onSend: () => void;
}

function DocSection({
  variant,
  label,
  required,
  status,
  sentAt,
  sentCount,
  lastRecipient,
  sending,
  onSend,
}: DocSectionProps) {
  const wasSent = status !== "NONE";
  const statusLabel =
    status === "NONE" && required
      ? "Pendiente de enviar"
      : status === "NONE"
        ? "No requerida"
        : status === "SENT"
          ? `Enviada${sentCount > 1 ? ` (${sentCount}×)` : ""}`
          : status === "VIEWED"
            ? "Vista por cliente"
            : status === "APPROVED"
              ? "Aprobada"
              : "Rechazada";
  return (
    <section className="rounded-lg border border-ds-border-subtle bg-ds-surface-2 p-3">
      <div className="flex items-center gap-2">
        <DocStatusIcon
          variant={variant}
          required={required}
          status={status}
          sentAt={sentAt}
          sentCount={sentCount}
          lastRecipient={lastRecipient}
        />
        <span className="text-sm font-medium text-ds-text-1">{label}</span>
        <span className="ml-auto text-[12px] text-ds-text-3">{statusLabel}</span>
      </div>
      {wasSent && lastRecipient && (
        <p className="text-[12px] text-ds-text-3 mt-1.5">
          Último envío a <span className="font-mono">{lastRecipient}</span>
          {sentAt && (
            <>
              {" "}
              · {format(new Date(sentAt), "dd MMM HH:mm", { locale: es })}
            </>
          )}
        </p>
      )}
      {(required || wasSent) && (
        <Button
          variant={wasSent ? "outline" : "default"}
          size="sm"
          className="mt-3 w-full h-10"
          onClick={onSend}
          disabled={sending}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Mail className="h-4 w-4 mr-1.5" />
              {wasSent ? `Reenviar ${label.toLowerCase()}` : `Enviar ${label.toLowerCase()}`}
            </>
          )}
        </Button>
      )}
    </section>
  );
}
