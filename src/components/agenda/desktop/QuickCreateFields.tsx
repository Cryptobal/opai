"use client";

import { cn } from "@/lib/utils";
import type { AgendaTeamMember } from "../agenda-calendar.types";
import { AccountField } from "../nueva-visita/AccountField";
import { InstallationField } from "../nueva-visita/InstallationField";
import type { useEventComposer, ComposerType } from "../mobile/useEventComposer";
import type { useQuickCreateTask } from "./useQuickCreateTask";
import { QuickCreateParticipants } from "./QuickCreateParticipants";
import { TaskTimePicker } from "../TaskTimePicker";
import { TaskAssigneePicker } from "../TaskAssigneePicker";

const EVENT_TYPES: Array<{ id: ComposerType; label: string }> = [
  { id: "cliente", label: "Cliente" },
  { id: "tecnica", label: "Técnica" },
  { id: "supervision", label: "Supervisión" },
  { id: "reunion", label: "Reunión" },
];

const DURATIONS = [30, 60, 90] as const;
const INPUT =
  "h-9 rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1";
const ROW_LABEL = "w-24 shrink-0 pt-2 text-[12px] font-medium text-ds-text-4";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <p className={ROW_LABEL}>{label}</p>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Cuerpo Evento del quick-create: filas de alto estable (spec §9). */
export function QuickCreateEventFields({
  composer,
  users,
}: {
  composer: ReturnType<typeof useEventComposer>;
  users: AgendaTeamMember[];
}) {
  const { form, set, availability, conflicts, applySuggestion } = composer;
  const conflictNames = conflicts
    .map((c) => users.find((u) => u.id === c.userId)?.name ?? "—")
    .slice(0, 2);

  return (
    <div className="space-y-3">
      <Row label="Tipo">
        <div className="flex h-9 items-center gap-1.5">
          {EVENT_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => set.setType(t.id)}
              className={cn(
                "h-8 rounded-full px-3 text-[12px] font-medium transition-colors ds-tap",
                form.type === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-ds-surface-2 text-ds-text-2 hover:text-ds-text-1",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Row>

      <Row label="Cuándo">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            value={form.date}
            onChange={(e) => set.setDate(e.target.value)}
            aria-label="Fecha"
            className={cn(INPUT, "w-36")}
          />
          <input
            type="time"
            value={form.time}
            onChange={(e) => set.setTime(e.target.value)}
            aria-label="Hora"
            className={cn(INPUT, "w-24")}
          />
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                set.setDurationMin(d);
                set.setAllDay(false);
              }}
              className={cn(
                "h-8 rounded-full px-2.5 font-mono text-[12px] ds-tap",
                !form.allDay && form.durationMin === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-ds-surface-2 text-ds-text-2",
              )}
            >
              {d}m
            </button>
          ))}
        </div>
        {conflictNames.length > 0 && (
          <div className="mt-1.5 rounded-lg border border-status-warn-border bg-status-warn-soft px-2.5 py-1.5 text-[12px] text-status-warn-fg">
            ⚠ Conflicto de horario: {conflictNames.join(", ")}
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
      </Row>

      <Row label="Participantes">
        <QuickCreateParticipants
          users={users}
          accountId={form.account?.id ?? null}
          participantIds={form.participantIds}
          externalEmails={form.externalEmails}
          conflictUserIds={new Set(conflicts.map((c) => c.userId))}
          onParticipantIds={set.setParticipantIds}
          onExternalEmails={set.setExternalEmails}
        />
      </Row>

      <Row label="Cuenta">
        <div className="space-y-2">
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
        </div>
      </Row>
    </div>
  );
}

/** Cuerpo Tarea del quick-create: vencimiento, responsable y cuenta opcional. */
export function QuickCreateTaskFields({
  task,
  users,
}: {
  task: ReturnType<typeof useQuickCreateTask>;
  users: AgendaTeamMember[];
}) {
  const { form, set } = task;
  return (
    <div className="space-y-3">
      <Row label="Vence">
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={form.date}
            onChange={(e) => set.setDate(e.target.value)}
            aria-label="Fecha de vencimiento"
            className={cn(INPUT, "w-36")}
          />
          <TaskTimePicker value={form.time} onChange={set.setTime} />
        </div>
      </Row>

      <Row label="Responsables">
        <TaskAssigneePicker users={users} value={form.assigneeIds} onChange={set.setAssigneeIds} />
      </Row>

      <Row label="Cuenta">
        <AccountField
          value={form.account}
          onSelect={(a) => set.setAccount(a)}
          onClear={() => set.setAccount(null)}
        />
      </Row>
    </div>
  );
}
