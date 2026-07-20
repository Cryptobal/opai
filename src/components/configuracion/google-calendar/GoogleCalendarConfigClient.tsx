"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { SectionHeader, Surface, Tag, Spinner } from "@/components/opai-ds";

type TeamRow = { userId: string; name: string; email: string; connected: boolean };

type Status = {
  connected: boolean;
  googleEmail: string | null;
  calendarId: string;
  prefs: Record<string, boolean>;
  team: TeamRow[];
};

const PREF_LABELS: Record<string, string> = {
  inviteContacts: "Invitar contactos al evento",
  slackReminderPrevDay: "Recordatorio Slack día anterior",
  licitacionesAllDay: "Licitaciones como día completo",
  digestMonday: "Digest semanal (lunes)",
};

export function GoogleCalendarConfigClient() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

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

  function copyInviteLink() {
    const url = `${window.location.origin}/api/integrations/google-calendar/oauth/start`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
            <a
              href="/api/integrations/google-calendar/oauth/start"
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
            >
              Conectar Calendar
            </a>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void patch({ createDedicated: true })}
                className="inline-flex h-10 items-center rounded-xl border border-ds-border-default px-4 text-[13px] text-ds-text-2 ds-tap sm:h-9"
              >
                Usar “Opai · Visitas”
              </button>
              <button
                type="button"
                onClick={() => void patch({ calendarId: "primary" })}
                className="inline-flex h-10 items-center rounded-xl border border-ds-border-default px-4 text-[13px] text-ds-text-2 ds-tap sm:h-9"
              >
                Usar primary
              </button>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="inline-flex h-10 items-center rounded-xl border border-ds-border-default px-4 text-[13px] text-ds-text-2 ds-tap sm:h-9"
              >
                Desconectar
              </button>
            </>
          )}
        </div>
        {connected && (
          <p className="font-mono text-[12px] text-ds-text-4">calendarId: {data?.calendarId}</p>
        )}
      </Surface>

      {connected && (
        <Surface elevation={1} padding="md" className="space-y-3">
          <SectionHeader title="Preferencias" hint="Se guardan en tu cuenta Calendar" />
          <ul className="space-y-2">
            {Object.entries(PREF_LABELS).map(([key, label]) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2.5"
              >
                <span className="text-[13px] text-ds-text-2">{label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(prefs[key])}
                  onClick={() => void patch({ prefs: { [key]: !prefs[key] } })}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ds-tap ${
                    prefs[key] ? "bg-primary" : "bg-ds-surface-3"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                      prefs[key] ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </Surface>
      )}

      {(data?.team?.length ?? 0) > 0 && (
        <Surface elevation={1} padding="md" className="space-y-3">
          <SectionHeader title="Equipo" hint="Quién tiene Calendar conectado" />
          <ul className="divide-y divide-ds-border-subtle rounded-xl border border-ds-border-subtle">
            {data!.team.map((u) => (
              <li key={u.userId} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ds-text-1">{u.name}</p>
                  <p className="truncate text-[12px] text-ds-text-4">{u.email}</p>
                </div>
                {u.connected ? (
                  <Tag variant="ok" size="sm">Conectado</Tag>
                ) : (
                  <button
                    type="button"
                    onClick={copyInviteLink}
                    className="h-10 rounded-xl border border-ds-border-default px-3 text-[12px] text-ds-text-2 ds-tap sm:h-9"
                  >
                    {copied ? "Link copiado" : "Invitar"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Surface>
      )}
    </div>
  );
}
