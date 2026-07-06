"use client";

import { CalendarClock, Pause, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * DealNextStepBanner — próximo seguimiento pendiente destacado arriba del centro
 * de la ficha. Solo presentación: los handlers (send-now / pause) llegan por props.
 */
export interface NextStepLog {
  id: string;
  sequence: number;
  status: string;
  scheduledAt: string;
  emailMessage?: { subject: string; toEmails: string[] } | null;
}

interface DealNextStepBannerProps {
  log: NextStepLog | null;
  onSendNow: (logId: string) => void;
  onPause: () => void;
  sendingLogId: string | null;
  pausing: boolean;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  const label = date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const overdue = date.getTime() <= Date.now();
  return overdue ? `${label} · vencido` : label;
}

export function DealNextStepBanner({
  log,
  onSendNow,
  onPause,
  sendingLogId,
  pausing,
}: DealNextStepBannerProps) {
  if (!log) return null;

  const isPaused = log.status === "paused";
  const overdue = new Date(log.scheduledAt).getTime() <= Date.now();
  const recipient = log.emailMessage?.toEmails?.[0];
  const subject = log.emailMessage?.subject;
  const isSending = sendingLogId === log.id;

  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4",
        overdue
          ? "border-status-warn-border bg-status-warn-soft"
          : "border-status-info-border bg-status-info-soft"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              overdue ? "bg-status-warn/15 text-status-warn-fg" : "bg-status-info/15 text-status-info-fg"
            )}
          >
            <CalendarClock className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ds-text-3">
              Próximo paso {isPaused && "· pausado"}
            </p>
            <p className="text-[13px] font-semibold leading-tight">
              Seguimiento S{log.sequence} · {formatWhen(log.scheduledAt)}
            </p>
            {(subject || recipient) && (
              <p className="mt-0.5 truncate text-[12px] text-ds-text-3">
                {[subject, recipient].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            onClick={() => onSendNow(log.id)}
            disabled={isSending}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5" />
            {isSending ? "Enviando…" : "Enviar ahora"}
          </Button>
          {!isPaused && (
            <Button
              size="sm"
              variant="outline"
              onClick={onPause}
              disabled={pausing}
              className="gap-1.5"
            >
              <Pause className="h-3.5 w-3.5" />
              Pausar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
