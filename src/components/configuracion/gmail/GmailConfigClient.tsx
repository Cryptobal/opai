/* eslint-disable @typescript-eslint/no-misused-promises */
"use client";

import { useCallback, useEffect, useState } from "react";
import { Spinner } from "@/components/opai-ds";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
import { GmailAccountsManager } from "@/components/opai/GmailAccountsManager";
import { GoogleTeamList, type GoogleTeamRow } from "@/components/configuracion/google-workspace/GoogleTeamList";
import {
  GmailConnectionCard,
  type GmailSyncSummary,
} from "./GmailConnectionCard";

type Status = {
  connected: boolean;
  googleEmail: string | null;
  sync: GmailSyncSummary | null;
  team: GoogleTeamRow[];
};

const CONNECT_HREF =
  "/api/crm/gmail/connect?return=/opai/configuracion/integraciones/gmail";

export function GmailConfigClient() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [passResult, setPassResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/gmail/status");
      if (!res.ok) throw new Error("fail");
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const syncEmails = async () => {
    setSyncing(true);
    setPassResult(null);
    setError(null);
    try {
      const response = await fetch("/api/crm/gmail/sync?max=50", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Error al sincronizar");
      setData((prev) =>
        prev
          ? {
              ...prev,
              sync: {
                backfillDone: Boolean(payload.backfillDone),
                totalThreads: Number(payload.totalThreads ?? 0),
                lastSyncAt: payload.lastSyncAt ?? new Date().toISOString(),
                canModify: prev.sync?.canModify,
              },
            }
          : prev,
      );
      const n = Number(payload.syncedCount ?? payload.count ?? 0);
      setPassResult(n > 0 ? `+${n} nuevos` : "Sin hilos nuevos en esta pasada");
    } catch {
      setError("No se pudo sincronizar.");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const connected = Boolean(data?.connected);

  return (
    <div className="ds-page-enter space-y-6">
      <OAuthResultBanner
        param="gmail"
        startHref={CONNECT_HREF}
        onConnected={load}
      />
      <GmailConnectionCard
        connected={connected}
        googleEmail={data?.googleEmail ?? null}
        sync={data?.sync ?? null}
        loading={syncing}
        passResult={passResult}
        error={error}
        onSync={() => void syncEmails()}
      />
      <GoogleTeamList
        team={data?.team ?? []}
        hint="Quién tiene Gmail conectado — Invitar envía mail con links a Gmail, Drive y Calendar"
      />
      <GmailAccountsManager alwaysShow />
    </div>
  );
}
