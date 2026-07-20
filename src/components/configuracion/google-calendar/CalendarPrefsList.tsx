"use client";

import { SectionHeader, Surface } from "@/components/opai-ds";

const PREF_LABELS: Record<string, string> = {
  inviteContacts: "Invitar contactos al evento",
  slackReminderPrevDay: "Recordatorio Slack día anterior",
  licitacionesAllDay: "Licitaciones como día completo",
  digestMonday: "Digest semanal (lunes)",
};

export function CalendarPrefsList({
  prefs,
  onToggle,
}: {
  prefs: Record<string, boolean>;
  onToggle: (key: string, value: boolean) => void;
}) {
  return (
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
              onClick={() => onToggle(key, !prefs[key])}
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
  );
}
