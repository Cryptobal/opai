"use client";

import { SectionHeader, Surface } from "@/components/opai-ds";
import { Switch } from "@/components/ui/switch";

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
            <Switch
              size="lg"
              checked={Boolean(prefs[key])}
              onCheckedChange={(v) => onToggle(key, v)}
              aria-label={label}
            />
          </li>
        ))}
      </ul>
    </Surface>
  );
}
