"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Avatar } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";
import { AccountField } from "../nueva-visita/AccountField";
import { InstallationField } from "../nueva-visita/InstallationField";
import { useQuickCreateTask } from "../desktop/useQuickCreateTask";
import { ParticipantPicker } from "./ParticipantPicker";
import { useEventComposer, type ComposerType } from "./useEventComposer";
import { ComposerToggles } from "./ComposerToggles";

const TYPES: Array<{ id: ComposerType; label: string }> = [
  { id: "cliente", label: "Visita cliente" },
  { id: "tecnica", label: "Técnica" },
  { id: "supervision", label: "Supervisión" },
  { id: "reunion", label: "Reunión" },
  { id: "otra", label: "Otra" },
];

const DURATIONS = [30, 60, 90] as const;

type Props = {
  open: boolean;
  users: AgendaTeamMember[];
  prefillDate?: string | null;
  onClose: () => void;
  onCreated: () => void;
};

/** Composer fullscreen (spec §7). Pickers anclados a Chile vía dateAtChileSlot. */
export function EventComposer({ open, users, prefillDate, onClose, onCreated }: Props) {
  const { form, set, availability, conflicts, applySuggestion, saving, submit } =
    useEventComposer(open, prefillDate);
  const task = useQuickCreateTask();
  const [mode, setMode] = useState<"evento" | "tarea">("evento");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");

  // Prefill de la fecha del slot también en la pestaña Tarea.
  useEffect(() => {
    if (open && prefillDate) task.set.setDate(prefillDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillDate]);

  if (!open) return null;

  const usersById = new Map(users.map((u) => [u.id, u]));
  const conflictNames = conflicts
    .map((c) => `${usersById.get(c.userId)?.name ?? "—"} tiene ${c.label}`)
    .slice(0, 2);

  const addEmail = () => {
    const email = emailDraft.trim().toLowerCase();
    if (!email.includes("@") || form.externalEmails.includes(email)) return;
    set.setExternalEmails([...form.externalEmails, email]);
    setEmailDraft("");
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
      {/* Header con safe-area arriba: Cancelar/Guardar quedan bajo el notch y
          son tocables (antes se ocultaban tras la dynamic island). */}
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
              <input
                type="time"
                value={task.form.time}
                onChange={(e) => task.set.setTime(e.target.value)}
                aria-label="Hora (opcional)"
                className="h-11 w-28 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
              />
            </div>
            <p className="text-[12px] text-ds-text-4">Sin hora = todo el día</p>
          </section>
          <section className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              Responsable
            </p>
            <select
              value={task.form.assignedTo}
              onChange={(e) => task.set.setAssignedTo(e.target.value)}
              aria-label="Responsable"
              className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
            >
              <option value="">Yo (por defecto)</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
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

        <input
          value={form.title}
          onChange={(e) => set.setTitle(e.target.value)}
          placeholder="Título del evento"
          className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[14px] outline-none placeholder:text-ds-text-4"
        />

        <section className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Cuándo</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={form.date}
              onChange={(e) => set.setDate(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
            />
            {!form.allDay && (
              <input
                type="time"
                value={form.time}
                onChange={(e) => set.setTime(e.target.value)}
                className="h-11 w-28 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  set.setDurationMin(d);
                  set.setAllDay(false);
                }}
                className={cn(
                  "h-9 rounded-full px-3 font-mono text-[12px] ds-tap",
                  !form.allDay && form.durationMin === d
                    ? "bg-primary text-primary-foreground"
                    : "opai-glass-soft text-ds-text-2",
                )}
              >
                {d} min
              </button>
            ))}
            <button
              type="button"
              onClick={() => set.setAllDay(!form.allDay)}
              className={cn(
                "h-9 rounded-full px-3 text-[12px] ds-tap",
                form.allDay ? "bg-primary text-primary-foreground" : "opai-glass-soft text-ds-text-2",
              )}
            >
              Todo el día
            </button>
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
        </section>

        <section className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
            Participantes internos
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {form.participantIds.map((id) => {
              const user = usersById.get(id);
              const hasConflict = conflicts.some((c) => c.userId === id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set.setParticipantIds(form.participantIds.filter((p) => p !== id))}
                  className="opai-glass-soft flex h-9 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-[13px] text-ds-text-1 ds-tap"
                >
                  <Avatar name={user?.name ?? "?"} size="sm" className="h-6 w-6 text-[12px]" />
                  {user?.name ?? id}
                  {hasConflict && <span className="text-status-warn-fg">⚠</span>}
                  <X className="h-3 w-3 text-ds-text-4" />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex h-9 items-center gap-1 rounded-full border border-dashed border-ds-border-default px-3 text-[13px] text-ds-text-3 ds-tap"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
            Invitados externos
          </p>
          <div className="flex flex-wrap gap-1.5">
            {form.externalEmails.map((email) => (
              <button
                key={email}
                type="button"
                onClick={() => set.setExternalEmails(form.externalEmails.filter((e) => e !== email))}
                className="opai-glass-soft flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ds-text-1 ds-tap"
              >
                {email} <X className="h-3 w-3 text-ds-text-4" />
              </button>
            ))}
          </div>
          <input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
            onBlur={addEmail}
            placeholder="correo@cliente.cl"
            className="h-11 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] outline-none placeholder:text-ds-text-4"
          />
        </section>

        <section className="space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-4">Contexto</p>
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
          />
        </section>

        <textarea
          value={form.notes}
          onChange={(e) => set.setNotes(e.target.value)}
          placeholder="Notas…"
          rows={3}
          className="w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[13px] outline-none placeholder:text-ds-text-4"
        />

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

      <ParticipantPicker
        open={pickerOpen}
        users={users}
        selectedIds={form.participantIds}
        availability={availability}
        onToggle={(id) =>
          set.setParticipantIds(
            form.participantIds.includes(id)
              ? form.participantIds.filter((p) => p !== id)
              : [...form.participantIds, id],
          )
        }
        onApplySuggestion={applySuggestion}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
