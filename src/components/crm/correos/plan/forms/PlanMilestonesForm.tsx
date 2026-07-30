"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/opai-ds";
import type { PlanMilestone } from "@/modules/crm/email/email-to-crm-structure.types";

const MILESTONE_KINDS: PlanMilestone["kind"][] = [
  "consultas",
  "visita_tecnica",
  "entrega",
];

const MILESTONE_LABELS: Record<PlanMilestone["kind"], string> = {
  consultas: "Plazo consultas",
  visita_tecnica: "Visita técnica",
  entrega: "Entrega de oferta",
};

type TenantUser = { id: string; name: string; email?: string | null };

type Props = {
  milestones: PlanMilestone[];
  onChange: (milestones: PlanMilestone[]) => void;
};

const defaultMilestone = (kind: PlanMilestone["kind"]): PlanMilestone => ({
  kind,
  date: "",
  time: "09:00",
  durationMin: 60,
  allDay: false,
  participantIds: [],
  externalEmails: [],
  enabled: true,
});

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function PlanMilestonesForm({ milestones, onChange }: Props) {
  const [users, setUsers] = useState<TenantUser[]>([]);

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

  function get(kind: PlanMilestone["kind"]): PlanMilestone {
    return milestones.find((m) => m.kind === kind) ?? defaultMilestone(kind);
  }

  function update(kind: PlanMilestone["kind"], partial: Partial<PlanMilestone>) {
    const existing = milestones.find((m) => m.kind === kind);
    if (existing) {
      onChange(milestones.map((m) => (m.kind === kind ? { ...m, ...partial } : m)));
    } else {
      onChange([...milestones, { ...defaultMilestone(kind), ...partial }]);
    }
  }

  return (
    <div className="space-y-4">
      {MILESTONE_KINDS.map((kind) => {
        const m = get(kind);
        const allDay = m.allDay === true;
        return (
          <div key={kind} className="space-y-2 rounded-lg border border-ds-border-subtle p-2.5">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`ms-${kind}-enabled`}
                checked={m.enabled !== false}
                onCheckedChange={(v) => update(kind, { enabled: Boolean(v) })}
                className="h-5 w-5"
              />
              <Label
                htmlFor={`ms-${kind}-enabled`}
                className="cursor-pointer text-[13px] font-medium text-ds-text-1"
              >
                {MILESTONE_LABELS[kind]}
              </Label>
            </div>
            {m.enabled !== false && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <SmallField
                      id={`ms-${kind}-date`}
                      label="Fecha"
                      type="date"
                      value={m.date}
                      onChange={(v) => update(kind, { date: v, fromDocument: false })}
                    />
                    {m.fromDocument && m.date ? (
                      <p className="text-[12px] text-ds-text-3">
                        propuesto desde el documento
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-end pb-0.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`ms-${kind}-allday`}
                        checked={allDay}
                        onCheckedChange={(v) => update(kind, { allDay: Boolean(v) })}
                        className="h-5 w-5"
                      />
                      <Label
                        htmlFor={`ms-${kind}-allday`}
                        className="cursor-pointer text-[13px] text-ds-text-2"
                      >
                        Todo el día
                      </Label>
                    </div>
                  </div>
                  {!allDay && (
                    <>
                      <SmallField
                        id={`ms-${kind}-time`}
                        label="Hora"
                        type="time"
                        value={m.time}
                        onChange={(v) => update(kind, { time: v })}
                      />
                      <SmallField
                        id={`ms-${kind}-dur`}
                        label="Duración (min)"
                        type="number"
                        value={String(m.durationMin)}
                        onChange={(v) =>
                          update(kind, { durationMin: v ? Number(v) : 60 })
                        }
                      />
                    </>
                  )}
                </div>
                <MilestoneInviteesField
                  kind={kind}
                  users={users}
                  participantIds={m.participantIds}
                  externalEmails={m.externalEmails}
                  onChange={(next) => update(kind, next)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MilestoneInviteesField({
  kind,
  users,
  participantIds,
  externalEmails,
  onChange,
}: {
  kind: PlanMilestone["kind"];
  users: TenantUser[];
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
  onChange: (
    next: Pick<PlanMilestone, "participantIds" | "externalEmails">,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const selectedUsers = participantIds
    .map((id) => byId.get(id))
    .filter((u): u is TenantUser => Boolean(u));

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.filter((u) => !participantIds.includes(u.id)).slice(0, 6);
    return users
      .filter((u) => !participantIds.includes(u.id))
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [users, participantIds, query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const addUser = (id: string) => {
    if (participantIds.includes(id)) return;
    onChange({
      participantIds: [...participantIds, id],
      externalEmails,
    });
    setQuery("");
    setOpen(false);
  };

  const removeUser = (id: string) => {
    onChange({
      participantIds: participantIds.filter((p) => p !== id),
      externalEmails,
    });
  };

  const addExternal = (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!isEmailLike(email)) return false;
    if (externalEmails.some((e) => e.email.toLowerCase() === email)) {
      setQuery("");
      return true;
    }
    const tenantMatch = users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (tenantMatch) {
      addUser(tenantMatch.id);
      return true;
    }
    onChange({
      participantIds,
      externalEmails: [...externalEmails, { email }],
    });
    setQuery("");
    setOpen(false);
    return true;
  };

  const removeExternal = (email: string) => {
    onChange({
      participantIds,
      externalEmails: externalEmails.filter((e) => e.email !== email),
    });
  };

  return (
    <div ref={ref} className="relative space-y-1">
      <Label htmlFor={`ms-${kind}-invitees`} className="text-[12px] text-ds-text-3">
        Invitados (equipo o externos)
      </Label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-ds-border-default bg-ds-surface-1 p-1.5">
        {selectedUsers.map((u) => (
          <span
            key={u.id}
            className="flex items-center gap-1 rounded-full bg-ds-surface-2 py-0.5 pl-0.5 pr-1.5 text-[12px] text-ds-text-1"
          >
            <Avatar name={u.name} size="sm" variant="brand" />
            <span className="max-w-[120px] truncate">{u.name}</span>
            <button
              type="button"
              onClick={() => removeUser(u.id)}
              aria-label={`Quitar ${u.name}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {externalEmails.map((e) => (
          <span
            key={e.email}
            className="flex items-center gap-1 rounded-full bg-ds-surface-2 px-2 py-0.5 text-[12px] text-ds-text-1"
          >
            <span className="max-w-[160px] truncate">{e.email}</span>
            <button
              type="button"
              onClick={() => removeExternal(e.email)}
              aria-label={`Quitar ${e.email}`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-ds-text-4 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={`ms-${kind}-invitees`}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              const raw = query.replace(/,$/, "").trim();
              if (suggestions[0] && !isEmailLike(raw)) {
                addUser(suggestions[0].id);
                return;
              }
              addExternal(raw);
            } else if (
              e.key === "Backspace" &&
              !query &&
              (externalEmails.length > 0 || participantIds.length > 0)
            ) {
              if (externalEmails.length > 0) {
                removeExternal(externalEmails[externalEmails.length - 1].email);
              } else {
                removeUser(participantIds[participantIds.length - 1]);
              }
            }
          }}
          onBlur={() => {
            // Permitir click en sugerencias antes de cerrar/commit.
            window.setTimeout(() => {
              const raw = query.trim();
              if (raw && isEmailLike(raw)) addExternal(raw);
            }, 120);
          }}
          placeholder="Buscar usuario o email…"
          className="h-8 min-w-[140px] flex-1 bg-transparent px-1.5 text-[13px] text-ds-text-1 outline-none placeholder:text-ds-text-4"
        />
      </div>
      {open && (suggestions.length > 0 || isEmailLike(query.trim())) && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 p-1.5 shadow-ds-lg">
          <div className="max-h-56 overflow-y-auto">
            {suggestions.map((u) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addUser(u.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2"
              >
                <Avatar name={u.name} size="sm" variant="brand" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.email && (
                  <span className="truncate text-[12px] text-ds-text-4">{u.email}</span>
                )}
              </button>
            ))}
            {isEmailLike(query.trim()) &&
              !users.some(
                (u) => (u.email ?? "").toLowerCase() === query.trim().toLowerCase(),
              ) &&
              !externalEmails.some(
                (e) => e.email.toLowerCase() === query.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addExternal(query)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ds-text-1 hover:bg-ds-surface-2"
                >
                  Agregar externo{" "}
                  <span className="font-medium text-ds-text-2">{query.trim()}</span>
                </button>
              )}
          </div>
        </div>
      )}
      <p className="text-[12px] text-ds-text-4">
        Elige gente del tenant o escribe un email externo y Enter.
      </p>
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
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 text-[13px] sm:h-9"
      />
    </div>
  );
}
