"use client";

import { useCallback, useEffect, useState } from "react";
import { toZonedTime } from "date-fns-tz";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/opai-ds";
import { CHILE_TZ } from "@/lib/dates-cl";
import {
  EventoFormFields,
  type EventoFormValue,
  type TenantUser,
} from "./EventoFormFields";
import { ContactsField } from "../nueva-visita/ContactsField";
import { canSubmitVisitaForm } from "../nueva-visita/visita-form-utils";

function localParts(iso: string): { date: string; time: string } {
  const d = toZonedTime(new Date(iso), CHILE_TZ);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

const emptyValue = (): EventoFormValue => ({
  title: "",
  label: "",
  date: "",
  time: "",
  durationMin: 60,
  allDay: false,
  address: null,
  lat: null,
  lng: null,
  notes: "",
  assignedUserId: "",
  participantIds: [],
  externalEmails: [],
  contactIds: [],
  syncGoogle: true,
  notifyOpai: true,
  slackReminderPrevDay: true,
  accountId: null,
  installationId: null,
  dealId: null,
});

type Props = {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

/** Dialog de edición unificada para eventos agenda_visita (GET/PATCH calendar/events). */
export function EditEventDialog({ eventId, open, onOpenChange, onSaved }: Props) {
  const [value, setValue] = useState<EventoFormValue>(emptyValue);
  const [eventType, setEventType] = useState("otra");
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const patch = useCallback((next: Partial<EventoFormValue>) => {
    setValue((v) => ({ ...v, ...next }));
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch("/api/crm/users")
      .then((r) => r.json())
      .then((json) =>
        setUsers(
          (json.data?.users ?? []).map((u: { id: string; name: string; email?: string }) => ({
            id: u.id,
            name: u.name,
            email: u.email,
          })),
        ),
      )
      .catch(() => setUsers([]));
  }, [open]);

  useEffect(() => {
    if (!open || !eventId) {
      setValue(emptyValue());
      setEventType("otra");
      return;
    }
    setLoading(true);
    fetch(`/api/calendar/events/${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.visita) return;
        const v = data.visita;
        const parts = localParts(v.startAt);
        const durationMin = Math.max(
          15,
          Math.round(
            (new Date(v.endAt).getTime() - new Date(v.startAt).getTime()) / 60_000,
          ),
        );
        const contactIds = Array.isArray(v.contactIds)
          ? (v.contactIds as string[])
          : [];
        setEventType(v.type ?? "otra");
        setValue({
          title: v.title ?? "",
          label: v.label ?? "",
          date: parts.date,
          time: v.allDay ? "" : parts.time,
          durationMin,
          allDay: v.allDay === true,
          address: v.customAddress ?? v.installation?.address ?? null,
          lat: v.lat ?? v.installation?.lat ?? null,
          lng: v.lng ?? v.installation?.lng ?? null,
          notes: v.notes ?? "",
          assignedUserId: v.assignedUserId ?? "",
          participantIds: (data.v2?.participants ?? []).map(
            (p: { userId: string }) => p.userId,
          ),
          externalEmails: (data.v2?.externals ?? []).map(
            (e: { email: string; name?: string | null }) => ({
              email: e.email,
              name: e.name ?? undefined,
            }),
          ),
          contactIds,
          syncGoogle: true,
          notifyOpai: true,
          slackReminderPrevDay: true,
          accountId: v.account?.id ?? v.accountId ?? null,
          accountName: v.account?.name ?? null,
          installationId: v.installationId ?? null,
          dealId: v.dealId ?? null,
        });
      })
      .catch(() => toast.error("No se pudo cargar el evento"))
      .finally(() => setLoading(false));
  }, [open, eventId]);

  const canSave = canSubmitVisitaForm({
    date: value.date,
    time: value.time,
    allDay: value.allDay,
    loading,
  });

  const save = async () => {
    if (!eventId || !canSave) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: eventType,
          title: value.title || value.label || "Evento",
          label: value.label || null,
          date: value.date,
          time: value.time || "09:00",
          allDay: value.allDay,
          durationMin: value.durationMin,
          notes: value.notes || null,
          accountId: value.accountId,
          installationId: value.installationId,
          customAddress: value.installationId ? null : value.address,
          address: value.installationId ? null : value.address,
          lat: value.installationId ? null : value.lat,
          lng: value.installationId ? null : value.lng,
          dealId: value.dealId,
          assignedUserId: value.assignedUserId,
          participantIds: value.participantIds,
          externalEmails: value.externalEmails,
          contactIds: value.contactIds?.length ? value.contactIds : null,
          syncGoogle: value.syncGoogle,
          notifyOpai: value.notifyOpai,
          slackReminderPrevDay: value.slackReminderPrevDay,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar el evento");
        return;
      }
      toast.success("Evento actualizado");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">Editar evento</DialogTitle>
        </DialogHeader>
        <div className="max-h-[min(70vh,640px)] min-w-0 w-full space-y-3 overflow-y-auto pr-1 -mr-1">
          {loading ? (
            <Spinner className="mx-auto py-8" />
          ) : (
            <>
              <EventoFormFields
                value={value}
                onChange={patch}
                users={users}
                density="default"
                showContextPickers
                installationLocation={
                  value.installationId
                    ? {
                        address: value.address,
                        lat: value.lat,
                        lng: value.lng,
                      }
                    : null
                }
              />
              {value.accountId && (
                <ContactsField
                  accountId={value.accountId}
                  selected={value.contactIds ?? []}
                  onChange={(ids) => patch({ contactIds: ids })}
                />
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-ds-border-default pt-3">
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={saving || loading || !canSave} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
