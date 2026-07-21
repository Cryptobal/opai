"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { VISIT_TYPES } from "./nueva-visita/types";
import { AccountField } from "./nueva-visita/AccountField";
import { InstallationField } from "./nueva-visita/InstallationField";
import { ContactsField } from "./nueva-visita/ContactsField";
import { ScheduleFields } from "./nueva-visita/ScheduleFields";
import { TogglesField } from "./nueva-visita/TogglesField";
import { useNuevaVisita } from "./nueva-visita/useNuevaVisita";

const INPUT =
  "h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId?: string | null;
  accountId?: string | null;
  installationId?: string | null;
  onCreated?: () => void;
};

export function NuevaVisitaModal(props: Props) {
  const { open, onOpenChange } = props;
  const { form, set, team, saving, error, tecnicaBlocked, canSubmit, submit } =
    useNuevaVisita(props);
  const showExtras = form.type !== "tecnica";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva visita</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {VISIT_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => set("type", t.id)}
                className={`h-10 rounded-full px-3 text-[12px] ds-tap sm:h-9 ${
                  form.type === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-ds-surface-2 text-ds-text-2"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <AccountField
            value={form.account}
            onSelect={(a) => {
              set("account", a);
              set("installationId", "");
              set("contactIds", []);
            }}
            onClear={() => {
              set("account", null);
              set("installationId", "");
              set("contactIds", []);
            }}
          />

          <InstallationField
            accountId={form.account?.id ?? null}
            value={form.installationId}
            onChange={(id) => set("installationId", id)}
            allowCustom={form.type === "otra" || form.type === "cliente"}
            customAddress={form.customAddress}
            onCustomAddress={(v) => set("customAddress", v)}
            onCustomCoords={(lat, lng) => {
              set("lat", lat);
              set("lng", lng);
            }}
          />

          {tecnicaBlocked && (
            <p className="text-[12px] text-status-warn-fg">
              La visita técnica requiere cuenta e instalación.
            </p>
          )}

          <input
            className={INPUT}
            placeholder="Título (opcional)"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />

          <ScheduleFields
            date={form.date}
            time={form.time}
            durationMin={form.durationMin}
            onDate={(v) => set("date", v)}
            onTime={(v) => set("time", v)}
            onDuration={(v) => set("durationMin", v)}
          />

          <select
            className={INPUT}
            value={form.assignedUserId}
            onChange={(e) => set("assignedUserId", e.target.value)}
          >
            <option value="">Asignado…</option>
            {team.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name} {u.connected ? "· Calendar ✓" : "· sin Calendar"}
              </option>
            ))}
          </select>

          {showExtras && (
            <ContactsField
              accountId={form.account?.id ?? null}
              selected={form.contactIds}
              onChange={(ids) => set("contactIds", ids)}
            />
          )}

          <textarea
            className="min-h-[64px] w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 py-2 text-[13px]"
            placeholder="Notas"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />

          {showExtras && (
            <TogglesField
              values={{
                createEvent: form.createEvent,
                inviteContacts: form.inviteContacts,
                slackReminder: form.slackReminder,
              }}
              onToggle={(key, value) => set(key, value)}
            />
          )}

          {error && <p className="text-[12px] text-status-danger-fg">{error}</p>}

          <Button className="w-full" disabled={saving || !canSubmit} onClick={() => void submit()}>
            {saving ? "Agendando…" : "Agendar visita"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
