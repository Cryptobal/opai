"use client";

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
          <span className="text-[13px] text-ds-text-2">{LABELS[key]}</span>
          <button
            type="button"
            role="switch"
            aria-checked={values[key]}
            aria-label={LABELS[key]}
            onClick={() => onToggle(key, !values[key])}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ds-tap ${
              values[key] ? "bg-primary" : "bg-ds-surface-3"
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
                values[key] ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
