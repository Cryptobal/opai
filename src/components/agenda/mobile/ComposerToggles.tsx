"use client";

import { cn } from "@/lib/utils";

type Props = {
  syncGoogle: boolean;
  notifyOpai: boolean;
  slackReminder: boolean;
  onSyncGoogle: (v: boolean) => void;
  onNotifyOpai: (v: boolean) => void;
  onSlackReminder: (v: boolean) => void;
};

/** Toggles del composer (spec §7). Meet queda deshabilitado ("próximamente"). */
export function ComposerToggles({
  syncGoogle,
  notifyOpai,
  slackReminder,
  onSyncGoogle,
  onNotifyOpai,
  onSlackReminder,
}: Props) {
  return (
    <section className="space-y-1.5">
      <ToggleRow label="Google Calendar" checked={syncGoogle} onChange={onSyncGoogle} />
      <ToggleRow label="Notificación OPAI" checked={notifyOpai} onChange={onNotifyOpai} />
      <ToggleRow label="Recordatorio Slack" checked={slackReminder} onChange={onSlackReminder} />
      <div className="flex h-11 items-center justify-between rounded-xl px-1 opacity-50">
        <span className="text-[13px] text-ds-text-2">Google Meet</span>
        <span className="text-[12px] text-ds-text-4" title="próximamente">
          próximamente
        </span>
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-full items-center justify-between rounded-xl px-1 ds-tap"
    >
      <span className="text-[13px] text-ds-text-1">{label}</span>
      <span
        className={cn(
          "flex h-6 w-10 items-center rounded-full p-0.5 transition-colors",
          checked ? "bg-primary" : "bg-ds-surface-3",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-ds-surface-1 shadow-ds-xs transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
