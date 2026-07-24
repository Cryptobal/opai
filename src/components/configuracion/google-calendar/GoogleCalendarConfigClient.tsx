"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";
import { Button } from "@/components/ui/button";
import { OAuthResultBanner } from "@/components/configuracion/OAuthResultBanner";
import { GoogleTeamList, type GoogleTeamRow } from "@/components/configuracion/google-workspace/GoogleTeamList";
import { CalendarPrefsList } from "./CalendarPrefsList";

type Status = {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
  prefs: Record<string, boolean>;
  team: GoogleTeamRow[];
};

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

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/integrations/google-calendar/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  }

  async function disconnect() {
    await fetch("/api/integrations/google-calendar/disconnect", { method: "POST" });
    await load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const connected = Boolean(data?.connected);
  const prefs = data?.prefs ?? {};

  return (
    <div className="ds-page-enter space-y-6">
      <OAuthResultBanner
        param="cal"
        startHref="/api/integrations/google-calendar/oauth/start"
        onConnected={load}
      />
      <Surface elevation={1} padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/20">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-base font-semibold text-ds-text-1">Mi calendario</p>
              <p className="text-[13px] text-ds-text-3">
                {connected ? data?.googleEmail : "Conectá tu Google Calendar para sync de visitas"}
              </p>
            </div>
          </div>
          <Tag variant={connected ? "ok" : "neutral"} size="sm">
            {connected ? "Conectado" : "Sin conectar"}
          </Tag>
        </div>
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <Button asChild className="h-10 sm:h-9">
              <a href="/api/integrations/google-calendar/oauth/start">
                <CalendarDays className="mr-1.5 h-4 w-4" /> Conectar Calendar
              </a>
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                onClick={() => void patch({ createDedicated: true })}
              >
                Usar “Opai · Visitas”
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                onClick={() => void patch({ calendarId: "primary" })}
              >
                Usar primary
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-9"
                onClick={() => void disconnect()}
              >
                Desconectar
              </Button>
            </>
          )}
        </div>
        {connected && (
          <p className="font-mono text-[12px] text-ds-text-4">calendarId: {data?.calendarId}</p>
        )}
      </Surface>

      {connected && (
        <CalendarPrefsList prefs={prefs} onToggle={(key, value) => void patch({ prefs: { [key]: value } })} />
      )}

      <GoogleTeamList
        team={data?.team ?? []}
        hint="Quién tiene Calendar conectado — Invitar envía mail con links a Gmail, Drive y Calendar"
      />
    </div>
  );
}
