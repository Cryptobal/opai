'use client';

import { DatePickerField } from "@/components/ui/date-picker";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  PlayCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirm-service';
import { EmptyState, IconBubble, Tag } from '@/components/opai-ds';
import { cn } from '@/lib/utils';
import type { UpcomingProject } from '../_lib/hub-types';
import { formatCLP } from '../_lib/hub-utils';

interface Props {
  projects: UpcomingProject[];
  canEdit?: boolean;
}

function parseDateOnly(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T12:00:00`);
}

function formatStartDate(iso: string): string {
  const d = parseDateOnly(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysUntil(iso: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = parseDateOnly(iso);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function HubUpcomingProjects({ projects, canEdit = false }: Props) {
  const router = useRouter();
  const [dates, setDates] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      projects.map((project) => [
        project.id,
        project.serviceStartDate.slice(0, 10),
      ]),
    ),
  );
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setDates(
      Object.fromEntries(
        projects.map((project) => [
          project.id,
          project.serviceStartDate.slice(0, 10),
        ]),
      ),
    );
  }, [projects]);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Sin servicios por iniciar"
        description="Los negocios adjudicados con fecha de inicio aparecerán aquí."
        compact
      />
    );
  }

  async function saveDate(project: UpcomingProject) {
    const nextDate = dates[project.id];
    if (!nextDate) {
      toast.error('Selecciona una fecha de inicio');
      return;
    }
    setBusy(`date:${project.id}`);
    try {
      const response = await fetch(`/api/crm/deals/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceStartDate: nextDate }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo actualizar la fecha');
      }
      toast.success('Fecha de inicio actualizada');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo actualizar la fecha',
      );
    } finally {
      setBusy(null);
    }
  }

  async function markStarted(project: UpcomingProject) {
    const confirmed = await confirmDialog({
      description: `¿Marcar "${project.title}" como servicio iniciado? Esta acción moverá el negocio a cierre ganado y activará su operación vinculada.`,
    });
    if (!confirmed) return;

    setBusy(`start:${project.id}`);
    try {
      const selectedDate =
        dates[project.id] || project.serviceStartDate.slice(0, 10);
      if (selectedDate !== project.serviceStartDate.slice(0, 10)) {
        const dateResponse = await fetch(`/api/crm/deals/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceStartDate: selectedDate }),
        });
        const datePayload = await dateResponse.json().catch(() => ({}));
        if (!dateResponse.ok) {
          throw new Error(
            datePayload.error || 'No se pudo actualizar la fecha de inicio',
          );
        }
      }

      const response = await fetch(
        `/api/hub/upcoming-projects/${project.id}/start`,
        { method: 'POST' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'No se pudo iniciar el servicio');
      }
      toast.success('Servicio marcado como iniciado');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo iniciar el servicio',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-ds-md border border-ds-border-subtle bg-ds-surface-2">
      <div className="flex items-center gap-3 border-b border-ds-border-subtle px-3 py-3">
        <IconBubble icon={CalendarClock} variant="info" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ds-text-1">
            Servicios por iniciar
          </p>
          <p className="text-[12px] text-ds-text-3">
            Ajusta la fecha o activa la operación.
          </p>
        </div>
        <Tag variant="info" size="sm">
          {projects.length}
        </Tag>
      </div>

      <ul className="ds-list-cascade divide-y divide-ds-border-subtle">
        {projects.map((p) => {
          const selectedDate = dates[p.id] || p.serviceStartDate.slice(0, 10);
          const days = daysUntil(selectedDate);
          const isPast = days < 0;
          const isToday = days === 0;
          const isSoon = days > 0 && days <= 7;
          const savingDate = busy === `date:${p.id}`;
          const starting = busy === `start:${p.id}`;

          return (
            <li key={p.id} className="space-y-3 px-3 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <IconBubble
                  icon={isPast ? CalendarClock : CalendarCheck}
                  variant={isPast ? 'danger' : isSoon || isToday ? 'warn' : 'ok'}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/crm/deals/${p.id}`}
                    className="group inline-flex max-w-full items-center gap-1.5 text-[13px] font-semibold text-ds-text-1 hover:text-primary"
                  >
                    <span className="truncate">{p.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <p className="truncate text-[12px] text-ds-text-3">
                    {p.accountName}
                    {p.contactName && ` · ${p.contactName}`}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ds-text-4">
                    <span className="font-mono">{formatCLP(p.amountClp)}</span>
                    {p.totalGuards > 0 ? (
                      <span>{p.totalGuards} guardias</span>
                    ) : null}
                    <span
                      className={cn(
                        'font-medium',
                        isPast
                          ? 'text-status-danger-fg'
                          : isToday || isSoon
                            ? 'text-status-warn-fg'
                            : 'text-ds-text-3',
                      )}
                    >
                      {isPast
                        ? `${Math.abs(days)} día${Math.abs(days) !== 1 ? 's' : ''} atrasado`
                        : isToday
                          ? 'Inicia hoy'
                          : `Inicia en ${days} día${days !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-[12px] font-medium text-ds-text-3">
                    Fecha de inicio
                  </span>
                  {canEdit ? (
                    <DatePickerField value={selectedDate || null} onChange={(ymd) =>
                        setDates((current) => ({
                          ...current,
                          [p.id]: (ymd ?? ""),
                        }))} disabled={Boolean(busy)} triggerClassName={"min-h-11 w-full rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-3 font-mono text-[13px] text-ds-text-1 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary sm:min-h-9"} />
                  ) : (
                    <span className="flex min-h-11 items-center font-mono text-[13px] text-ds-text-1 sm:min-h-9">
                      {formatStartDate(p.serviceStartDate)}
                    </span>
                  )}
                </label>

                {canEdit ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void saveDate(p)}
                      disabled={
                        Boolean(busy) ||
                        selectedDate === p.serviceStartDate.slice(0, 10)
                      }
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-ds-border-default px-4 text-[13px] font-semibold text-ds-text-2 transition-colors hover:border-ds-border-strong hover:text-ds-text-1 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-9"
                    >
                      {savingDate ? 'Guardando…' : 'Guardar fecha'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void markStarted(p)}
                      disabled={Boolean(busy)}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
                    >
                      <PlayCircle className="h-4 w-4" />
                      {starting ? 'Iniciando…' : 'Marcar iniciado'}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
