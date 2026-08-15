"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InviteesField } from "@/components/agenda/evento/InviteesField";
import { formatDealDateShort } from "@/components/crm/deals/deals-helpers";
import { DEAL_AGENDA_CHANGED_EVENT } from "@/components/crm/deals/deal-agenda-events";
import { cn } from "@/lib/utils";

type DealMilestoneRow = {
  kind: string;
  chipLabel: string;
  eventId: string | null;
  date: string | null;
  assignedName: string | null;
  inviteeCount: number;
  syncStatus: string | null;
  htmlLink: string | null;
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string | null }>;
};

type TenantUser = { id: string; name: string; email?: string | null };

export function DealLicitacionMilestones({
  dealId,
  canEdit = true,
}: {
  dealId: string;
  canEdit?: boolean;
}) {
  const [rows, setRows] = useState<DealMilestoneRow[] | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [editing, setEditing] = useState<DealMilestoneRow | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [externalEmails, setExternalEmails] = useState<Array<{ email: string; name?: string }>>([]);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    fetch(`/api/crm/deals/${dealId}/milestones`)
      .then((r) => r.json())
      .then((j) => setRows(Array.isArray(j.milestones) ? j.milestones : []))
      .catch(() => setRows([]));
  }, [dealId]);

  useEffect(() => {
    reload();
  }, [reload]);

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
            .map((u) => ({ id: u.id, name: u.name, email: u.email ?? null })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  function openEditor(row: DealMilestoneRow) {
    setEditing(row);
    setDate(row.date);
    setParticipantIds(row.participantIds);
    setExternalEmails(row.externalEmails.map((e) => ({ email: e.email, name: e.name ?? undefined })));
  }

  async function save() {
    if (!editing || !date) {
      toast.error("Elige una fecha");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/crm/deals/${dealId}/milestones`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: editing.kind,
          date,
          participantIds,
          externalEmails,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar el hito");
        return;
      }
      toast.success(json.action === "actualizado" ? "Hito actualizado" : "Hito creado");
      if (Array.isArray(json.milestones)) setRows(json.milestones);
      else reload();
      setEditing(null);
      window.dispatchEvent(
        new CustomEvent(DEAL_AGENDA_CHANGED_EVENT, { detail: { dealId } }),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!rows) return null;

  return (
    <div className="space-y-2">
      <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-ds-text-3">Hitos</p>
      <div className="flex flex-wrap gap-1.5">
        {rows.map((row) => {
          const defined = Boolean(row.eventId && row.date);
          const short = formatDealDateShort(row.date);
          const gOk = row.syncStatus === "SYNCED" || Boolean(row.htmlLink);
          return (
            <button
              key={row.kind}
              type="button"
              disabled={!canEdit}
              onClick={() => openEditor(row)}
              className={cn(
                "inline-flex min-h-10 items-center gap-1 rounded-full border px-3 text-[12px] font-medium ds-tap transition",
                defined
                  ? "border-[rgba(var(--ds-glow-rgb),0.3)] bg-[var(--glass-fill-soft)] text-ds-text-1"
                  : "border-dashed border-white/[0.14] text-ds-text-3 hover:text-ds-text-2",
              )}
            >
              {defined ? (
                <>
                  <span>📍 {row.chipLabel}</span>
                  <span>· {short} ✓</span>
                  {row.assignedName ? <span>· {row.assignedName}</span> : null}
                  {gOk ? <span className="text-status-ok-fg">· G✓</span> : null}
                </>
              ) : (
                <span>❓ {row.chipLabel} · Definir +</span>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.chipLabel ?? "Hito"}</DialogTitle>
            <DialogDescription>
              Queda en la agenda del negocio e invita a Google Calendar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">Fecha</p>
              <DatePickerField
                value={date}
                onChange={setDate}
                aria-label="Fecha del hito"
              />
            </div>
            <InviteesField
              users={users}
              participantIds={participantIds}
              externalEmails={externalEmails}
              onChange={(next) => {
                setParticipantIds(next.participantIds);
                setExternalEmails(next.externalEmails);
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void save()} disabled={saving || !date}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
