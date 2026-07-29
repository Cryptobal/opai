"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
import { GoogleTeamList, type GoogleTeamRow } from "@/components/configuracion/google-workspace/GoogleTeamList";
import { CalendarColorPopover } from "@/components/agenda/CalendarColorPopover";
import { paletteFgBg } from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";
import { CalendarPrefsList } from "./CalendarPrefsList";

type CalendarAccount = {
  id: string;
  googleEmail: string;
  isDefault: boolean;
  color: string | null;
  calendarId: string;
  status: string;
  sortIndex: number;
};

type Status = {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
  prefs: Record<string, boolean>;
  accounts: CalendarAccount[];
  team: GoogleTeamRow[];
  multiAccount?: {
    enabled?: boolean;
    canConnect?: boolean;
    maxAccounts?: number;
  };
};

const CONNECT_HREF = "/api/integrations/google-calendar/oauth/start?return=/opai/configuracion/integraciones/google-calendar";
const ADD_HREF = `${CONNECT_HREF}&add=1`;

export function GoogleCalendarConfigClient() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/google-calendar/status");
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

  async function patchAccount(accountId: string, body: Record<string, unknown>) {
    await fetch("/api/integrations/google-calendar/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, ...body }),
    });
    await load();
  }

  async function patchAccountColor(accountId: string, color: string) {
    await fetch("/api/calendar/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, color }),
    });
    await load();
  }

  async function disconnect(accountId: string) {
    await fetch("/api/integrations/google-calendar/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const accounts = [...(data?.accounts ?? [])].sort((a, b) => a.sortIndex - b.sortIndex);
  const connected = accounts.length > 0;
  const canConnect = data?.multiAccount?.canConnect === true;
  const maxAccounts = data?.multiAccount?.maxAccounts ?? 1;
  const prefs = data?.prefs ?? {};

  return (
    <div className="ds-page-enter space-y-6">
      <OAuthResultBanner
        param="cal"
        startHref={CONNECT_HREF}
        onConnected={load}
      />

      <Surface elevation={1} padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-ds-text-1">
                Cuentas de Google Calendar
              </p>
              <p className="text-[13px] text-ds-text-3">
                {connected
                  ? maxAccounts > 1
                    ? `${accounts.length} de ${maxAccounts} cuentas conectadas`
                    : accounts.length === 1
                      ? accounts[0]!.googleEmail
                      : `${accounts.length} cuentas conectadas`
                  : "Conectá tu Google Calendar para sync de visitas"}
              </p>
            </div>
          </div>
          <Tag variant={connected ? "ok" : "neutral"} size="sm">
            {connected ? "Conectado" : "Sin conectar"}
          </Tag>
        </div>

        {!connected ? (
          <Button asChild className="h-10 sm:h-9">
            <a href={CONNECT_HREF}>
              <CalendarDays className="mr-1.5 h-4 w-4" /> Conectar Calendar
            </a>
          </Button>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const color = account.color ?? "teal";
              const initials = account.googleEmail.slice(0, 2).toUpperCase();
              return (
                <div
                  key={account.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-2/50 px-3 py-2.5"
                >
                  <CalendarColorPopover
                    color={color}
                    onChange={(key) => void patchAccountColor(account.id, key)}
                  >
                    <button
                      type="button"
                      aria-label={`Color de ${account.googleEmail}`}
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold ds-tap",
                        paletteFgBg(color),
                      )}
                    >
                      {initials}
                    </button>
                  </CalendarColorPopover>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ds-text-1">
                      {account.googleEmail}
                    </p>
                    <p className="font-mono text-[12px] text-ds-text-4">
                      {account.isDefault ? "Cuenta por defecto · " : ""}
                      {account.calendarId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!account.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 sm:h-9"
                        onClick={() => void patchAccount(account.id, { isDefault: true })}
                      >
                        Hacer default
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 sm:h-9"
                      onClick={() => void disconnect(account.id)}
                    >
                      Desconectar
                    </Button>
                  </div>
                </div>
              );
            })}

            {canConnect && (
              <>
                <Link
                  href={ADD_HREF}
                  className="flex h-10 items-center gap-2 rounded-xl px-2 text-[13px] text-primary ds-tap hover:bg-ds-surface-2"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  Conectar otra cuenta
                </Link>
                <p className="text-[12px] text-ds-text-4">
                  Máximo {maxAccounts} cuentas por usuario
                </p>
              </>
            )}
          </div>
        )}
      </Surface>

      {connected && (
        <CalendarPrefsList
          prefs={prefs}
          onToggle={(key, value) => void patchAccount(accounts[0]!.id, { prefs: { [key]: value } })}
        />
      )}

      <GoogleTeamList
        team={data?.team ?? []}
        hint="Quién tiene Calendar conectado — Invitar envía mail con links a Gmail, Drive y Calendar"
      />
    </div>
  );
}
