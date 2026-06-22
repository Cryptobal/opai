"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, AlertTriangle, RefreshCw, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/opai-ds";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface PendingSendsData {
  total: number;
  proformaPendingCount: number;
  estadoPagoPendingCount: number;
  withoutRecipientsCount: number;
  drafts: Array<{
    id: string;
    receiverName: string | null;
    proformaPending: boolean;
    estadoPagoPending: boolean;
    proformaHasRecipients: boolean;
    estadoPagoHasRecipients: boolean;
  }>;
}

interface Props {
  onAfterRetry?: () => void;
}

export function PendingSendsBanner({ onAfterRetry }: Props) {
  const [data, setData] = useState<PendingSendsData | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/finance/billing/drafts/pending-sends");
      const json = await res.json();
      if (json.success) setData(json.data as PendingSendsData);
    } catch {
      // silent — el banner es secundario, no debe romper la página
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || data.total === 0) return null;

  const handleRetryAll = async () => {
    setRetrying(true);
    try {
      const draftIds = data.drafts.map((d) => d.id);
      const res = await fetch(
        "/api/finance/billing/drafts/bulk-retry-send",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftIds }),
        },
      );
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error ?? "Error reintentando");
        return;
      }
      const { okCount, failCount, backfillCount } = json.data as {
        okCount: number;
        failCount: number;
        backfillCount: number;
      };
      if (failCount === 0) {
        toast.success(
          `${okCount} envíos completados${
            backfillCount > 0
              ? ` (${backfillCount} con backfill desde plantilla)`
              : ""
          }`,
        );
      } else {
        toast.warning(
          `${okCount} OK · ${failCount} fallidos — revisá detalle por borrador`,
        );
      }
      await load();
      onAfterRetry?.();
    } finally {
      setRetrying(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <Surface
        elevation={1}
        padding="sm"
        className="border border-status-warn-border bg-status-warn-soft/40"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-status-warn-fg shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ds-text-1">
              {data.total} borrador{data.total > 1 ? "es" : ""} con envío pendiente
            </p>
            <p className="text-xs text-ds-text-3 mt-0.5">
              {data.proformaPendingCount} proforma
              {data.proformaPendingCount !== 1 ? "s" : ""}
              {" · "}
              {data.estadoPagoPendingCount} estado
              {data.estadoPagoPendingCount !== 1 ? "s" : ""} de pago
              {data.withoutRecipientsCount > 0 && (
                <>
                  {" · "}
                  <span className="text-status-danger-fg inline-flex items-center gap-0.5">
                    <UserX className="h-3 w-3" />
                    {data.withoutRecipientsCount} sin destinatarios
                  </span>
                </>
              )}
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={retrying}
            className="h-9 shrink-0"
          >
            {retrying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Reintentar
              </>
            )}
          </Button>
        </div>
      </Surface>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`¿Reintentar ${data.total} envíos pendientes?`}
        description={
          <>
            Se reenviará solo lo configurado en cada borrador: proforma si la
            plantilla lo tenía activo, estado de pago si lo tenía activo (no
            ambos a todos).
            {data.withoutRecipientsCount > 0 && (
              <>
                {" "}
                <strong>{data.withoutRecipientsCount}</strong> no tienen
                destinatarios: el sistema intentará usar los contactos de la
                plantilla origen si fueron agregados después del cron.
              </>
            )}
          </>
        }
        confirmLabel="Reintentar todos"
        cancelLabel="Cancelar"
        variant="default"
        loading={retrying}
        loadingLabel="Reintentando..."
        onConfirm={handleRetryAll}
      />
    </>
  );
}
