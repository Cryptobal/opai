"use client";

import { Switch } from "@/components/ui/switch";

type ToggleKey = "createEvent" | "inviteContacts" | "slackReminder";

const LABELS: Record<ToggleKey, string> = {
  createEvent: "Crear evento en Google Calendar del asignado",
  inviteContacts: "Invitar contactos por correo",
  slackReminder: "Recordatorio Slack el día anterior",
};

export function TogglesField({
  values,
  onToggle,
}: {
  values: Record<ToggleKey, boolean>;
  onToggle: (key: ToggleKey, value: boolean) => void;
}) {
  return (
    <ul className="space-y-1.5">
      {(Object.keys(LABELS) as ToggleKey[]).map((key) => (
        <li
          key={key}
          className="flex items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2"
        >
          <span className="text-ds-body text-ds-text-2">{LABELS[key]}</span>
          <Switch
            size="lg"
            checked={values[key]}
            onCheckedChange={(v) => onToggle(key, v)}
            aria-label={LABELS[key]}
          />
        </li>
      ))}
    </ul>
  );
}
