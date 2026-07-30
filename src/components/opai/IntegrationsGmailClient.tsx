/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GmailAccountsManager } from "./GmailAccountsManager";

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
  const ago = mins == null ? "recién" : mins < 1 ? "hace instantes" : `hace ${mins} min`;
  return `Al día · ${s.totalThreads} hilos · última sync ${ago}`;
}

export function IntegrationsGmailClient({
  connected,
  initialSync,
}: {
  connected: boolean;
  initialSync?: GmailSyncSummary | null;
}) {
  const [loading, setLoading] = useState(false);
  const [sync, setSync] = useState<GmailSyncSummary | null>(initialSync ?? null);
  const [passResult, setPassResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncEmails = async () => {
    setLoading(true);
    setPassResult(null);
    setError(null);
    try {
      const response = await fetch("/api/crm/gmail/sync?max=50", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error al sincronizar");
      setSync({
        backfillDone: Boolean(payload.backfillDone),
        totalThreads: Number(payload.totalThreads ?? 0),
        lastSyncAt: payload.lastSyncAt ?? new Date().toISOString(),
      });
      const n = Number(payload.syncedCount ?? payload.count ?? 0);
      setPassResult(n > 0 ? `+${n} nuevos` : "Sin hilos nuevos en esta pasada");
    } catch (err) {
      console.error(err);
      setError("No se pudo sincronizar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Gmail</CardTitle>
          <CardDescription>Conecta tu cuenta para enviar y registrar correos.</CardDescription>
        </div>
        <Badge variant={connected ? "success" : "destructive"}>
          {connected ? "Conectado" : "Desconectado"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {connected ? (
          <>
            <p className="text-ds-text-3">
              {sync
                ? statusLabel(sync)
                : "Tu cuenta Gmail está conectada. El histórico avanza solo vía cron."}
            </p>
            {sync && sync.canModify === false && (
              <p className="rounded-lg border border-status-warn-border bg-status-warn-soft px-2.5 py-2 text-ds-body text-status-warn-fg">
                Reconectá Gmail para habilitar archivar y eliminar{" "}
                <a href="/api/crm/gmail/connect" className="font-medium underline underline-offset-2">
                  Reconectar
                </a>
              </p>
            )}
            {passResult && <p className="text-ds-body text-status-ok-fg">{passResult}</p>}
            {error && <p className="text-ds-body text-status-danger-fg">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <a href="/api/crm/gmail/connect">Reconectar Gmail</a>
              </Button>
              <Button variant="outline" size="sm" onClick={syncEmails} disabled={loading}>
                {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Sincronizar ahora
              </Button>
              <Button asChild variant="link" size="sm" className="h-10 px-0 sm:h-9">
                <Link href="/crm/correos">Ver bandeja →</Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <a href="/api/crm/gmail/connect">Conectar Gmail</a>
            </Button>
            <span className="text-[12px] text-ds-text-4">
              Requiere permisos Gmail send + readonly.
            </span>
          </div>
        )}
        <GmailAccountsManager />
      </CardContent>
    </Card>
  );
}
