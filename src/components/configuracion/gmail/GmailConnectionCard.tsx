"use client";

import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { Surface, Tag } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";

export type GmailSyncSummary = {
  backfillDone: boolean;
  totalThreads: number;
  lastSyncAt: string | null;
  canModify?: boolean;
};

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 60_000);
}

function statusLabel(s: GmailSyncSummary): string {
  if (!s.backfillDone) {
    return `Sincronizando histórico en segundo plano (corre cada 10 min) · ${s.totalThreads} hilos hasta ahora`;
  }
  const mins = minutesAgo(s.lastSyncAt);
  const ago =
    mins == null ? "recién" : mins < 1 ? "hace instantes" : `hace ${mins} min`;
  return `Al día · ${s.totalThreads} hilos · última sync ${ago}`;
}

const CONNECT_HREF =
  "/api/crm/gmail/connect?return=/opai/configuracion/integraciones/gmail";

type Props = {
  connected: boolean;
  googleEmail: string | null;
  sync: GmailSyncSummary | null;
  loading: boolean;
  passResult: string | null;
  error: string | null;
  onSync: () => void;
};

export function GmailConnectionCard({
  connected,
  googleEmail,
  sync,
  loading,
  passResult,
  error,
  onSync,
}: Props) {
  return (
    <Surface elevation={1} padding="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-ds-text-1">
              Mi Gmail
            </p>
            <p className="text-ds-body text-ds-text-3">
              {connected
                ? googleEmail
                : "Conectá tu cuenta para enviar y registrar correos"}
            </p>
          </div>
        </div>
        <Tag variant={connected ? "ok" : "neutral"} size="sm">
          {connected ? "Conectado" : "Sin conectar"}
        </Tag>
      </div>

      {connected ? (
        <>
          <p className="text-ds-body text-ds-text-3">
            {sync
              ? statusLabel(sync)
              : "Tu cuenta Gmail está conectada. El histórico avanza solo vía cron."}
          </p>
          <p className="rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-ds-body text-ds-text-2">
            Tras enviar un correo podés <span className="font-medium text-ds-text-1">Deshacer</span> durante{" "}
            <span className="font-medium text-ds-text-1">10 segundos</span> (estilo Gmail). El tiempo de las acciones de bandeja se configura en Correos → Gestos de deslizar.
          </p>
          {sync && sync.canModify === false && (
            <p className="rounded-lg border border-status-warn-border bg-status-warn-soft px-2.5 py-2 text-ds-body text-status-warn-fg">
              Reconectá Gmail para habilitar archivar y eliminar{" "}
              <a
                href={CONNECT_HREF}
                className="font-medium underline underline-offset-2"
              >
                Reconectar
              </a>
            </p>
          )}
          {passResult && (
            <p className="text-ds-body text-status-ok-fg">{passResult}</p>
          )}
          {error && (
            <p className="text-ds-body text-status-danger-fg">{error}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="secondary" size="sm" className="h-10 sm:h-9">
              <a href={CONNECT_HREF}>Reconectar Gmail</a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 sm:h-9"
              onClick={onSync}
              disabled={loading}
            >
              {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Sincronizar ahora
            </Button>
            <Button asChild variant="link" size="sm" className="h-10 px-0 sm:h-9">
              <Link href="/crm/correos">Ver bandeja →</Link>
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild className="h-10 sm:h-9">
            <a href={CONNECT_HREF}>
              <Mail className="mr-1.5 h-4 w-4" /> Conectar Gmail
            </a>
          </Button>
          <span className="text-[12px] text-ds-text-4">
            Requiere permisos Gmail send + readonly.
          </span>
        </div>
      )}
    </Surface>
  );
}
