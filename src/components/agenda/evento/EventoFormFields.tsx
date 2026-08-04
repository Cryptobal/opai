"use client";

import type { JSX } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "@/components/opai-ds";
import { AccountField } from "@/components/agenda/nueva-visita/AccountField";
import { InstallationField } from "@/components/agenda/nueva-visita/InstallationField";
import type { AccountOption } from "@/components/agenda/nueva-visita/types";
import { EventAddressField } from "./EventAddressField";
import { InviteesField, type TenantUser } from "./InviteesField";

export const EVENT_LABEL_SUGGESTIONS = [
  "Consultas",
  "Visita técnica",
  "Entrega de oferta",
  "Entrega de bases",
  "Reunión",
  "Visita a cliente",
  "Supervisión",
] as const;

export type EventoFormValue = {
  title: string;
  label: string;
  date: string;
  time: string;
  durationMin: number;
  allDay: boolean;
  address: string | null;
  lat: number | null;
  lng: number | null;
  mapsUrl?: string | null;
  notes: string;
  assignedUserId: string;
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
  contactIds?: string[];
  syncGoogle: boolean;
  notifyOpai: boolean;
  slackReminderPrevDay: boolean;
  accountId?: string | null;
  installationId?: string | null;
  dealId?: string | null;
};

const DURATIONS = [30, 60, 90, 120] as const;

export function EventoFormFields({
  value,
  onChange,
  users,
  density = "default",
  installationLocation,
  showContextPickers = false,
  showToggles = true,
  showAssignee = true,
}: {
  value: EventoFormValue;
  onChange: (patch: Partial<EventoFormValue>) => void;
  users: TenantUser[];
  density?: "default" | "compact";
  installationLocation?: {
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    mapsUrl?: string | null;
  } | null;
  showContextPickers?: boolean;
  showToggles?: boolean;
  showAssignee?: boolean;
}): JSX.Element {
  const compact = density === "compact";
  const spaceY = compact ? "space-y-2" : "space-y-3";
  const account: AccountOption | null = value.accountId
    ? { id: value.accountId, name: value.accountId, rut: null }
    : null;

  return (
    <div className={spaceY}>
      <div className="space-y-1">
        <Label htmlFor="evento-title" className="text-[12px] text-ds-text-3">
          Título
        </Label>
        <Input
          id="evento-title"
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Nombre del evento"
          className="h-10 text-[13px] sm:h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-[12px] text-ds-text-3">Etiqueta</Label>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_LABEL_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange({ label: suggestion })}
              className="ds-tap"
            >
              <Tag
                variant={value.label === suggestion ? "brand" : "neutral"}
                size="sm"
              >
                {suggestion}
              </Tag>
            </button>
          ))}
        </div>
        <Input
          id="evento-label"
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Otra etiqueta…"
          className="h-10 text-[13px] sm:h-9"
        />
      </div>

      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-2")}>
        <div className="space-y-1">
          <Label htmlFor="evento-date" className="text-[12px] text-ds-text-3">
            Fecha
          </Label>
          <Input
            id="evento-date"
            type="date"
            value={value.date}
            onChange={(e) => onChange({ date: e.target.value })}
            className="h-10 text-[13px] sm:h-9"
          />
        </div>
        <div className="flex items-end pb-0.5">
          <div className="flex min-h-11 items-center gap-2 sm:min-h-0">
            <Checkbox
              id="evento-allday"
              checked={value.allDay}
              onCheckedChange={(v) => onChange({ allDay: Boolean(v) })}
              className="h-5 w-5"
            />
            <Label
              htmlFor="evento-allday"
              className="cursor-pointer text-[13px] text-ds-text-2"
            >
              Todo el día
            </Label>
          </div>
        </div>
        {!value.allDay && (
          <>
            <div className="space-y-1">
              <Label htmlFor="evento-time" className="text-[12px] text-ds-text-3">
                Hora
              </Label>
              <Input
                id="evento-time"
                type="time"
                value={value.time}
                onChange={(e) => onChange({ time: e.target.value })}
                className="h-10 text-[13px] sm:h-9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="evento-duration" className="text-[12px] text-ds-text-3">
                Duración
              </Label>
              <select
                id="evento-duration"
                value={value.durationMin}
                onChange={(e) => onChange({ durationMin: Number(e.target.value) })}
                className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9"
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      <EventAddressField
        address={value.address}
        lat={value.lat}
        lng={value.lng}
        mapsUrl={value.mapsUrl}
        installationLocation={installationLocation}
        onChange={(next) => onChange(next)}
      />

      <InviteesField
        id="evento-invitees"
        users={users}
        participantIds={value.participantIds}
        externalEmails={value.externalEmails}
        onChange={(next) => onChange(next)}
      />

      <div className="space-y-1">
        <Label htmlFor="evento-notes" className="text-[12px] text-ds-text-3">
          Notas
        </Label>
        <textarea
          id="evento-notes"
          value={value.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          rows={compact ? 2 : 3}
          placeholder="Detalle opcional…"
          className="w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4"
        />
      </div>

      {showAssignee && (
        <div className="space-y-1">
          <Label htmlFor="evento-assignee" className="text-[12px] text-ds-text-3">
            Asignado
          </Label>
          <select
            id="evento-assignee"
            value={value.assignedUserId}
            onChange={(e) => onChange({ assignedUserId: e.target.value })}
            className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9"
          >
            <option value="">Yo (por defecto)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {showContextPickers && (
        <div className="space-y-2">
          <AccountField
            value={account}
            onSelect={(a) =>
              onChange({
                accountId: a.id,
                installationId: null,
              })
            }
            onClear={() =>
              onChange({
                accountId: null,
                installationId: null,
              })
            }
          />
          <InstallationField
            accountId={value.accountId ?? null}
            value={value.installationId ?? ""}
            onChange={(installationId) => onChange({ installationId: installationId || null })}
            allowCustom
            customAddress={value.address ?? ""}
            onCustomAddress={(address) => onChange({ address: address || null })}
          />
        </div>
      )}

      {showToggles && (
        <ul className="space-y-1.5">
          <ToggleRow
            id="evento-sync-google"
            label="Sincronizar con Google Calendar"
            checked={value.syncGoogle}
            onChange={(syncGoogle) => onChange({ syncGoogle })}
          />
          <ToggleRow
            id="evento-notify-opai"
            label="Notificación OPAI"
            checked={value.notifyOpai}
            onChange={(notifyOpai) => onChange({ notifyOpai })}
          />
          <ToggleRow
            id="evento-slack-reminder"
            label="Recordatorio Slack el día anterior"
            checked={value.slackReminderPrevDay}
            onChange={(slackReminderPrevDay) => onChange({ slackReminderPrevDay })}
          />
        </ul>
      )}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2 sm:min-h-0">
      <Label htmlFor={id} className="cursor-pointer text-[13px] text-ds-text-2">
        {label}
      </Label>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(Boolean(v))}
        className="h-5 w-5"
      />
    </li>
  );
}

export type { TenantUser };
