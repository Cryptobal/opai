"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { InviteesField } from "@/components/agenda/evento/InviteesField";
import { EventAddressField } from "@/components/agenda/evento/EventAddressField";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

const PREDEFINED_KINDS = [
  "consultas",
  "visita_tecnica",
  "entrega_bases",
  "entrega",
] as const;

type PredefinedKind = (typeof PREDEFINED_KINDS)[number];

const MILESTONE_LABELS: Record<PredefinedKind, string> = {
  consultas: "Plazo consultas",
  visita_tecnica: "Visita técnica",
  entrega_bases: "Entrega de bases",
  entrega: "Entrega de oferta",
};

const ADDRESS_PLACEHOLDERS: Partial<Record<PlanMilestone["kind"], string>> = {
  visita_tecnica: "Dirección de la visita técnica…",
};

type TenantUser = { id: string; name: string; email?: string | null };

type InstallationLocationHint = {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  mapsUrl?: string | null;
};

type Props = {
  milestones: PlanMilestone[];
  onChange: (milestones: PlanMilestone[]) => void;
  /** Dirección de la 1ª instalación del plan — sugerencia / “usar”. */
  installationLocation?: InstallationLocationHint | null;
};

function newMilestoneId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ms-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureMilestoneId(m: PlanMilestone): PlanMilestone {
  return m.id ? m : { ...m, id: newMilestoneId() };
}

const defaultMilestone = (
  kind: PlanMilestone["kind"],
  partial?: Partial<PlanMilestone>,
): PlanMilestone => ({
  id: newMilestoneId(),
  kind,
  date: "",
  time: "09:00",
  durationMin: 60,
  allDay: false,
  participantIds: [],
  externalEmails: [],
  enabled: true,
  address: null,
  lat: null,
  lng: null,
  mapsUrl: null,
  ...partial,
});

function displayRows(milestones: PlanMilestone[]): PlanMilestone[] {
  const normalized = milestones.map(ensureMilestoneId);
  const predefined = PREDEFINED_KINDS.map((kind) => {
    const found = normalized.find((m) => m.kind === kind);
    return found ?? defaultMilestone(kind);
  });
  const otros = normalized.filter((m) => m.kind === "otro");
  return [...predefined, ...otros];
}

function rowKey(m: PlanMilestone): string {
  return m.kind !== "otro" ? m.kind : m.id;
}

function rowTitle(m: PlanMilestone): string {
  if (m.kind === "otro") {
    return m.title?.trim() || m.label?.trim() || "Evento";
  }
  return MILESTONE_LABELS[m.kind];
}

export function PlanMilestonesForm({
  milestones,
  onChange,
  installationLocation,
}: Props) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const rows = useMemo(() => displayRows(milestones), [milestones]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const list: TenantUser[] = Array.isArray(j?.data?.users) ? j.data.users : [];
        setUsers(
          list
            .filter((u) => u?.id && u?.name)
            .map((u) => ({
              id: u.id,
              name: u.name,
              email: u.email ?? null,
            })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function updateRow(row: PlanMilestone, partial: Partial<PlanMilestone>) {
    const normalized = milestones.map(ensureMilestoneId);
    const idx = normalized.findIndex(
      (m) => (row.kind !== "otro" && m.kind === row.kind) || m.id === row.id,
    );
    if (idx >= 0) {
      onChange(
        normalized.map((m, i) => (i === idx ? { ...m, ...partial } : m)),
      );
      return;
    }
    onChange([...normalized, { ...ensureMilestoneId(row), ...partial }]);
  }

  function removeRow(row: PlanMilestone) {
    if (row.kind !== "otro") return;
    const normalized = milestones.map(ensureMilestoneId);
    onChange(normalized.filter((m) => m.id !== row.id));
  }

  function addEvent() {
    const normalized = milestones.map(ensureMilestoneId);
    onChange([
      ...normalized,
      defaultMilestone("otro", {
        title: "",
        label: "",
      }),
    ]);
  }

  return (
    <div className="space-y-4">
      {rows.map((m) => {
        const allDay = m.allDay === true;
        const key = rowKey(m);
        return (
          <div
            key={key}
            className="space-y-2 rounded-lg border border-ds-border-subtle p-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Checkbox
                  id={`ms-${key}-enabled`}
                  checked={m.enabled !== false}
                  onCheckedChange={(v) => updateRow(m, { enabled: Boolean(v) })}
                  className="h-5 w-5"
                />
                <div className="min-w-0">
                  <Label
                    htmlFor={`ms-${key}-enabled`}
                    className="cursor-pointer text-[13px] font-medium text-ds-text-1"
                  >
                    {rowTitle(m)}
                  </Label>
                  {(m.participantIds.length > 0 || m.externalEmails.length > 0) && (
                    <p className="truncate text-[12px] text-ds-text-3">
                      Invitados:{" "}
                      {[
                        ...m.participantIds.map(
                          (id) => users.find((u) => u.id === id)?.name ?? "Usuario",
                        ),
                        ...m.externalEmails.map((e) => e.name || e.email),
                      ].join(", ")}
                    </p>
                  )}
                </div>
              </div>
              {m.kind === "otro" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(m)}
                  aria-label="Quitar evento"
                  className="h-10 w-10 shrink-0 text-ds-text-3 hover:text-status-danger-fg sm:h-9 sm:w-9"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            {m.enabled !== false && (
              <div className="space-y-2 pt-1">
                {m.kind === "otro" && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SmallField
                      id={`ms-${key}-title`}
                      label="Título"
                      value={m.title ?? ""}
                      onChange={(v) => updateRow(m, { title: v })}
                      placeholder="Nombre del evento"
                    />
                    <SmallField
                      id={`ms-${key}-label`}
                      label="Etiqueta"
                      value={m.label ?? ""}
                      onChange={(v) => updateRow(m, { label: v })}
                      placeholder="Ej. Reunión"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <SmallField
                      id={`ms-${key}-date`}
                      label="Fecha"
                      type="date"
                      value={m.date}
                      onChange={(v) => updateRow(m, { date: v, fromDocument: false })}
                    />
                    {m.fromDocument && m.date ? (
                      <p className="text-[12px] text-ds-text-3">
                        propuesto desde el documento
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-end pb-0.5">
                    <div className="flex min-h-11 items-center gap-2 sm:min-h-0">
                      <Checkbox
                        id={`ms-${key}-allday`}
                        checked={allDay}
                        onCheckedChange={(v) => updateRow(m, { allDay: Boolean(v) })}
                        className="h-5 w-5"
                      />
                      <Label
                        htmlFor={`ms-${key}-allday`}
                        className="cursor-pointer text-[13px] text-ds-text-2"
                      >
                        Todo el día
                      </Label>
                    </div>
                  </div>
                  {!allDay && (
                    <>
                      <SmallField
                        id={`ms-${key}-time`}
                        label="Hora"
                        type="time"
                        value={m.time}
                        onChange={(v) => updateRow(m, { time: v })}
                      />
                      <SmallField
                        id={`ms-${key}-dur`}
                        label="Duración (min)"
                        type="number"
                        value={String(m.durationMin)}
                        onChange={(v) =>
                          updateRow(m, { durationMin: v ? Number(v) : 60 })
                        }
                      />
                    </>
                  )}
                </div>
                <EventAddressField
                  address={m.address}
                  lat={m.lat}
                  lng={m.lng}
                  mapsUrl={m.mapsUrl}
                  installationLocation={installationLocation}
                  placeholder={
                    ADDRESS_PLACEHOLDERS[m.kind] ?? "Dirección del evento…"
                  }
                  onChange={(next) => updateRow(m, next)}
                />
                <InviteesField
                  id={`ms-${key}-invitees`}
                  users={users}
                  participantIds={m.participantIds}
                  externalEmails={m.externalEmails}
                  onChange={(next) => updateRow(m, next)}
                />
              </div>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={addEvent}
        className="h-10 w-full gap-2 text-[13px] sm:h-9"
      >
        <Plus className="h-4 w-4" />
        Agregar evento
      </Button>
    </div>
  );
}

function SmallField({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-[12px] text-ds-text-3">
        {label}
      </Label>
      {type === "date" ? (
        <DatePickerField
          id={id}
          value={value || null}
          onChange={(ymd) => onChange(ymd ?? "")}
          aria-label={label}
          placeholder={placeholder}
          clearable
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 text-[13px] sm:h-9"
        />
      )}
    </div>
  );
}
