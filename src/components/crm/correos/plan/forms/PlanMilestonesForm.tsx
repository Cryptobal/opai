"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

type Props = {
  milestones: PlanMilestone[];
  onChange: (milestones: PlanMilestone[]) => void;
};

const defaultMilestone = (kind: PlanMilestone["kind"]): PlanMilestone => ({
  kind,
  date: "",
  time: "09:00",
  durationMin: 60,
  participantIds: [],
  externalEmails: [],
  enabled: true,
});

export function PlanMilestonesForm({ milestones, onChange }: Props) {
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
              <div className="grid grid-cols-2 gap-2 pt-1">
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
                  onChange={(v) => update(kind, { durationMin: v ? Number(v) : 60 })}
                />
                <SmallField
                  id={`ms-${kind}-ext`}
                  label="Emails externos"
                  placeholder="a@b.cl, c@d.cl"
                  value={m.externalEmails.map((e) => e.email).join(", ")}
                  onChange={(v) =>
                    update(kind, {
                      externalEmails: v
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((email) => ({ email })),
                    })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
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
