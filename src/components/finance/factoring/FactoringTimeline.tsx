"use client";

import {
  Ban,
  Check,
  CircleDollarSign,
  CircleHelp,
  FileCheck,
  HandCoins,
  Send,
} from "lucide-react";
import type { FinanceFactoringStatus } from "@prisma/client";
import { IconBubble } from "@/components/opai-ds";

interface TimelineProps {
  status: FinanceFactoringStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  fundedAt: string | null;
  collectedAt: string | null;
  closedAt: string | null;
}

interface Step {
  key: string;
  label: string;
  icon: typeof Send;
  date: string | null;
  done: boolean;
  current: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function FactoringTimeline(props: TimelineProps) {
  if (props.status === "CANCELLED") {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg bg-status-danger-soft border border-status-danger-border">
        <IconBubble icon={Ban} variant="danger" size="md" />
        <div>
          <div className="font-medium text-status-danger-fg">Operación cancelada</div>
          <div className="text-xs text-ds-text-3">
            Esta operación quedó fuera del lifecycle activo.
          </div>
        </div>
      </div>
    );
  }

  const order: FinanceFactoringStatus[] = [
    "SUBMITTED",
    "APPROVED",
    "FUNDED",
    "COLLECTED",
    "CLOSED",
  ];
  const currentIdx = order.indexOf(props.status);

  const steps: Step[] = [
    {
      key: "SUBMITTED",
      label: "Cedida (AEC enviado al SII)",
      icon: Send,
      date: props.submittedAt,
      done: currentIdx >= 0,
      current: props.status === "SUBMITTED",
    },
    {
      key: "APPROVED",
      label: "Aprobada por SII",
      icon: FileCheck,
      date: props.approvedAt,
      done: currentIdx >= 1,
      current: props.status === "APPROVED",
    },
    {
      key: "FUNDED",
      label: "Anticipo girado",
      icon: HandCoins,
      date: props.fundedAt,
      done: currentIdx >= 2,
      current: props.status === "FUNDED",
    },
    {
      key: "COLLECTED",
      label: "Cliente pagó al factoring",
      icon: CircleDollarSign,
      date: props.collectedAt,
      done: currentIdx >= 3,
      current: props.status === "COLLECTED",
    },
    {
      key: "CLOSED",
      label: "Retención liberada",
      icon: Check,
      date: props.closedAt,
      done: currentIdx >= 4,
      current: props.status === "CLOSED",
    },
  ];

  return (
    <ol className="space-y-3">
      {steps.map((s) => {
        const variant = s.done
          ? s.current
            ? "info"
            : "ok"
          : "neutral";
        return (
          <li key={s.key} className="flex items-center gap-3">
            <IconBubble icon={s.done ? s.icon : CircleHelp} variant={variant} size="sm" />
            <div className="flex-1 min-w-0">
              <div
                className={
                  s.done
                    ? "text-sm font-medium text-ds-text-1"
                    : "text-sm text-ds-text-3"
                }
              >
                {s.label}
              </div>
              <div className="text-xs text-ds-text-3 font-mono">
                {formatDate(s.date)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
