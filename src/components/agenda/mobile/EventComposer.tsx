"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";
import { AccountField } from "../nueva-visita/AccountField";
import { InstallationField } from "../nueva-visita/InstallationField";
import { useQuickCreateTask } from "../desktop/useQuickCreateTask";
import { TaskTimePicker } from "../TaskTimePicker";
import { TaskAssigneePicker } from "../TaskAssigneePicker";
import {
  EventoFormFields,
  type EventoFormValue,
} from "../evento/EventoFormFields";
import { useEventComposer, type ComposerType } from "./useEventComposer";
import { ComposerToggles } from "./ComposerToggles";

const TYPES: Array<{ id: ComposerType; label: string }> = [
  { id: "cliente", label: "Visita cliente" },
  { id: "supervision", label: "Supervisión" },
  { id: "reunion", label: "Reunión" },
  { id: "otra", label: "Otra" },
];

const DURATIONS = [30, 60, 90] as const;

type Props = {
  open: boolean;
  users: AgendaTeamMember[];
  prefillDate?: string | null;
  dealId?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

/** Composer fullscreen (spec §7). Pickers anclados a Chile vía dateAtChileSlot. */
export function EventComposer({
  open,
  users,
  prefillDate,
  dealId,
  onClose,
  onCreated,
}: Props) {
  const { form, set, availability, conflicts, applySuggestion, saving, submit } =
    useEventComposer(open, prefillDate, dealId);
  const task = useQuickCreateTask();
  const [mode, setMode] = useState<"evento" | "tarea">("evento");

  useEffect(() => {
    if (open && prefillDate) task.set.setDate(prefillDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillDate]);

  if (!open) return null;

  const tenantUsers = users.map((u) => ({ id: u.id, name: u.name, email: u.email }));
  const usersById = new Map(users.map((u) => [u.id, u]));
  const conflictNames = conflicts
    .map((c) => `${usersById.get(c.userId)?.name ?? "—"} tiene ${c.label}`)
    .slice(0, 2);

  const eventoValue: EventoFormValue = {
    title: form.title,
    label: form.label,
    date: form.date,
    endDate: form.endDate || form.date,
    time: form.time,
    durationMin: form.durationMin,
    allDay: form.allDay,
    address: form.customAddress || null,
    lat: form.lat,
    lng: form.lng,
    notes: form.notes,
    assignedUserId: "",
    participantIds: form.participantIds,
    externalEmails: form.externalEmails.map((email) => ({ email })),
    syncGoogle: form.syncGoogle,
    notifyOpai: form.notifyOpai,
    slackReminderPrevDay: form.slackReminder,
    accountId: form.account?.id ?? null,
    installationId: form.installationId || null,
    dealId: dealId ?? null,
  };

  const applyEventoPatch = (patch: Partial<EventoFormValue>) => {
    if (patch.title !== undefined) set.setTitle(patch.title);
    if (patch.label !== undefined) set.setLabel(patch.label);
    if (patch.date !== undefined) {
      set.setDate(patch.date);
      if (!patch.endDate && form.endDate < patch.date) set.setEndDate(patch.date);
    }
    if (patch.endDate !== undefined) set.setEndDate(patch.endDate);
    if (patch.time !== undefined) set.setTime(patch.time);
    if (patch.durationMin !== undefined) set.setDurationMin(patch.durationMin);
    if (patch.allDay !== undefined) {
      set.setAllDay(patch.allDay);
      if (patch.allDay && (!form.endDate || form.endDate < form.date)) {
        set.setEndDate(form.date);
      }
    }
    if (patch.notes !== undefined) set.setNotes(patch.notes);
    if (patch.participantIds !== undefined) set.setParticipantIds(patch.participantIds);
    if (patch.externalEmails !== undefined) {
      set.setExternalEmails(patch.externalEmails.map((e) => e.email));
    }
    if (patch.syncGoogle !== undefined) set.setSyncGoogle(patch.syncGoogle);
    if (patch.notifyOpai !== undefined) set.setNotifyOpai(patch.notifyOpai);
    if (patch.slackReminderPrevDay !== undefined) set.setSlackReminder(patch.slackReminderPrevDay);
    if (patch.address !== undefined) set.setCustomAddress(patch.address ?? "");
    if (patch.lat !== undefined) set.setLat(patch.lat);
    if (patch.lng !== undefined) set.setLng(patch.lng);
    if (patch.accountId !== undefined) {
      if (patch.accountId === null) {
        set.setAccount(null);
        set.setInstallationId("");
      }
    }
    if (patch.installationId !== undefined) set.setInstallationId(patch.installationId ?? "");
  };

  const currentSaving = mode === "evento" ? saving : task.saving;

  const save = async () => {
    if (mode === "tarea") {
      if (await task.submit()) {
        onCreated();
        onClose();
      }
      return;
    }
    if (await submit()) {
      onCreated();
      onClose();
    }
  };

  return (
    <div className="opai-glass-strong ds-page-enter fixed inset-0 z-50 flex flex-col rounded-none lg:hidden">
      <header
        className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ds-text-3 ds-tap"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-0.5 rounded-full bg-ds-surface-2 p-0.5">
          {(["evento", "tarea"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "h-9 rounded-full px-4 text-[13px] font-medium capitalize transition-colors ds-tap",
                mode === m
                  ? "bg-ds-surface-1 text-ds-text-1 shadow-ds-xs"
                  : "text-ds-text-3",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={currentSaving}
          onClick={() => void save()}
          className="h-11 rounded-xl px-2 text-[13px] font-semibold text-primary ds-tap disabled:opacity-50"
        >
          Guardar
        </button>
      </header>

      {mode === "tarea" ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <input
            value={task.form.title}
            onChange={(e) => task.set.setTitle(e.target.value)}
            placeholder="Título de la tarea"
            className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[14px] outline-none placeholder:text-ds-text-4"
          />
          <section className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Vencimiento
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={task.form.date}
                onChange={(e) => task.set.setDate(e.target.value)}
                aria-label="Fecha de vencimiento"
                className="h-11 min-w-0 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
              />
              <TaskTimePicker value={task.form.time} onChange={task.set.setTime} />
            </div>
            <p className="text-[12px] text-ds-text-4">Sin hora = todo el día</p>
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Responsables
            </p>
            <TaskAssigneePicker
              users={users}
              value={task.form.assigneeIds}
              onChange={task.set.setAssigneeIds}
            />
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Cuenta
            </p>
            <AccountField
              value={task.form.account}
              onSelect={(a) => task.set.setAccount(a)}
              onClear={() => task.set.setAccount(null)}
            />
          </section>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => set.setType(t.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full px-3 text-[13px] font-medium ds-tap",
                  form.type === t.id
                    ? "bg-primary text-primary-foreground"
                    : "opai-glass-soft text-ds-text-2",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {conflictNames.length > 0 && (
            <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2 text-[13px] text-status-warn-fg">
              ⚠ Conflicto: {conflictNames.join(" · ")}
              {availability?.suggestions[0] && (
                <button
                  type="button"
                  onClick={() => applySuggestion(availability.suggestions[0].start)}
                  className="ml-1 font-medium underline underline-offset-2 ds-tap"
                >
                  Buscar otro horario
                </button>
              )}
            </div>
          )}

          <EventoFormFields
            value={eventoValue}
            onChange={applyEventoPatch}
            users={tenantUsers}
            density="compact"
            showAssignee={false}
            showToggles={false}
          />

          <section className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Contexto
            </p>
            <AccountField
              value={form.account}
              onSelect={(a) => set.setAccount(a)}
              onClear={() => {
                set.setAccount(null);
                set.setInstallationId("");
              }}
            />
            <InstallationField
              accountId={form.account?.id ?? null}
              value={form.installationId}
              onChange={set.setInstallationId}
              allowCustom
              customAddress={form.customAddress}
              onCustomAddress={set.setCustomAddress}
              onCustomCoords={(la, ln) => {
                set.setLat(la);
                set.setLng(ln);
              }}
            />
          </section>

          <ComposerToggles
            syncGoogle={form.syncGoogle}
            notifyOpai={form.notifyOpai}
            slackReminder={form.slackReminder}
            onSyncGoogle={set.setSyncGoogle}
            onNotifyOpai={set.setNotifyOpai}
            onSlackReminder={set.setSlackReminder}
          />
        </div>
      )}

      <div
        className="shrink-0 border-t border-ds-border-subtle px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <button
          type="button"
          disabled={currentSaving}
          onClick={() => void save()}
          className="h-11 w-full rounded-xl bg-primary text-[14px] font-semibold text-primary-foreground ds-tap disabled:opacity-60"
        >
          {currentSaving
            ? "Guardando…"
            : mode === "tarea"
              ? "Guardar tarea"
              : "Guardar evento"}
        </button>
      </div>
    </div>
  );
}
