"use client";

/**
 * Split button "Enviar" + flecha (estilo Gmail) para programar envío:
 *  1) Flecha → menú "Programar envío" (abre hacia arriba).
 *  2) Modal con presets (mañana mañana/tarde, lunes mañana).
 *  3) "Elegir fecha y hora" → modal con Calendar DS + selects (sin nativos).
 */

import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, CalendarDays, ChevronDown, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/opai-ds";
import { todayInChile, ymdInChile } from "@/lib/dates-cl";
import { cn } from "@/lib/utils";
import {
  formatScheduleWhen,
  scheduleAtChileWallTime,
  scheduleSendPresets,
} from "./email-send-client";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function ymdFromPickerDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickerDateFromYmd(ymd: string): Date {
  return new Date(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
  );
}

function defaultCustomSlot(): { ymd: string; hour: number; minute: number } {
  const tomorrow = scheduleSendPresets()[0]?.date;
  if (tomorrow) {
    return { ymd: ymdInChile(tomorrow), hour: 8, minute: 0 };
  }
  return { ymd: todayInChile(), hour: 9, minute: 0 };
}

type Props = {
  busy: boolean;
  disabled: boolean;
  onSend: () => void;
  /** Presente en respuestas: menú "Enviar y archivar" (⌘/Ctrl+Enter). */
  onSendAndArchive?: () => void;
  sendShortcutHint?: string;
  sendAndArchiveShortcutHint?: string;
  onSchedule: (date: Date) => void;
  /** Incrementar para abrir el modal de presets (⋯ móvil → Programar envío). */
  openPresetsNonce?: number;
  /** Oculta el split Enviar (topbar móvil ya tiene Enviar). */
  hideSendButton?: boolean;
};

export function ScheduleSendSplitButton({
  busy,
  disabled,
  onSend,
  onSendAndArchive,
  sendShortcutHint,
  sendAndArchiveShortcutHint,
  onSchedule,
  openPresetsNonce = 0,
  hideSendButton = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customYmd, setCustomYmd] = useState(() => defaultCustomSlot().ymd);
  const [customHour, setCustomHour] = useState(() => defaultCustomSlot().hour);
  const [customMinute, setCustomMinute] = useState(
    () => defaultCustomSlot().minute,
  );

  const presets = useMemo(() => scheduleSendPresets(), [presetsOpen]);
  const customDate = useMemo(
    () => scheduleAtChileWallTime(customYmd, customHour, customMinute),
    [customYmd, customHour, customMinute],
  );
  const customDateLabel = useMemo(
    () =>
      customDate.toLocaleDateString("es-CL", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "America/Santiago",
      }).replace(/\./g, ""),
    [customDate],
  );
  const customTimeLabel = `${String(customHour).padStart(2, "0")}:${String(customMinute).padStart(2, "0")}`;

  const openPresets = () => {
    setMenuOpen(false);
    setPresetsOpen(true);
  };

  useEffect(() => {
    if (openPresetsNonce > 0) openPresets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPresetsNonce]);

  const openCustom = () => {
    const slot = defaultCustomSlot();
    setCustomYmd(slot.ymd);
    setCustomHour(slot.hour);
    setCustomMinute(slot.minute);
    setPresetsOpen(false);
    setCustomOpen(true);
  };

  const confirmSchedule = (date: Date) => {
    if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() + 2 * 60_000) {
      toast.error("Elegí una fecha futura (mínimo 2 minutos)");
      return;
    }
    setPresetsOpen(false);
    setCustomOpen(false);
    onSchedule(date);
  };

  const selectClass =
    "h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 outline-none ds-tap " +
    "focus-visible:ring-1 focus-visible:ring-ring sm:h-9";

  return (
    <>
      {!hideSendButton && (
      <div
        className={cn(
          "inline-flex h-10 overflow-hidden rounded-full bg-primary text-primary-foreground sm:h-9",
          (busy || disabled) && "opacity-50",
        )}
      >
        <button
          type="button"
          onClick={onSend}
          disabled={busy || disabled}
          title={sendShortcutHint ? `Enviar (${sendShortcutHint})` : "Enviar"}
          className="inline-flex h-full items-center justify-center gap-1.5 px-4 text-[13px] font-medium ds-tap disabled:pointer-events-none"
        >
          {busy ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {busy ? "Enviando…" : "Enviar"}
        </button>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={busy || disabled}
              title="Más opciones de envío"
              aria-label="Más opciones de envío"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex h-full w-9 items-center justify-center border-l border-primary-foreground/25 ds-tap disabled:pointer-events-none"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-auto min-w-[220px] max-w-none rounded-xl border-ds-border-default bg-card p-1.5 shadow-lg"
          >
            {onSendAndArchive && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onSendAndArchive();
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
              >
                <span className="inline-flex items-center gap-2.5 font-medium">
                  <Archive className="h-4 w-4 shrink-0 text-primary" />
                  Enviar y archivar
                </span>
                {sendAndArchiveShortcutHint && (
                  <kbd className="shrink-0 font-mono text-[12px] text-ds-text-4">
                    {sendAndArchiveShortcutHint}
                  </kbd>
                )}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={openPresets}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
            >
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-medium">Programar envío</span>
            </button>
          </PopoverContent>
        </Popover>
      </div>
      )}

      <Dialog open={presetsOpen} onOpenChange={setPresetsOpen}>
        <DialogContent
          className="z-[70] gap-0 p-0 sm:max-w-[360px] sm:rounded-2xl"
          overlayClassName="z-[69]"
        >
          <DialogHeader className="space-y-1 px-5 pb-3 pt-5 pr-12">
            <DialogTitle className="font-display text-base">
              Programar envío
            </DialogTitle>
            <DialogDescription className="text-[13px] text-ds-text-3">
              Hora de Chile (America/Santiago)
            </DialogDescription>
          </DialogHeader>
          <div className="px-2 pb-2">
            {presets.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => confirmSchedule(preset.date)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left ds-tap hover:bg-ds-surface-2"
              >
                <span className="text-[13px] font-medium text-ds-text-1">
                  {preset.label}
                </span>
                <span className="shrink-0 text-[13px] text-ds-text-3">
                  {preset.whenLabel}
                </span>
              </button>
            ))}
            <div className="mx-3 my-1 border-t border-ds-border-subtle" />
            <button
              type="button"
              onClick={openCustom}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left text-[13px] font-medium text-ds-text-1 ds-tap hover:bg-ds-surface-2"
            >
              <CalendarDays className="h-4 w-4 text-ds-text-3" />
              Elegir fecha y hora
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent
          className="z-[70] gap-0 p-0 sm:max-w-[520px] sm:rounded-2xl"
          overlayClassName="z-[69]"
        >
          <DialogHeader className="space-y-1 px-5 pb-2 pt-5 pr-12">
            <DialogTitle className="font-display text-base">
              Elegir fecha y hora
            </DialogTitle>
            <DialogDescription className="text-[13px] text-ds-text-3">
              El correo se enviará a la hora de Chile
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-5 py-3 sm:grid-cols-[1fr_180px] sm:items-start">
            <div className="rounded-2xl border border-ds-border-default bg-ds-surface-1 p-1">
              <Calendar
                mode="single"
                selected={pickerDateFromYmd(customYmd)}
                onSelect={(d) => {
                  if (!d) return;
                  setCustomYmd(ymdFromPickerDate(d));
                }}
                disabled={(d) => ymdFromPickerDate(d) < todayInChile()}
                className="mx-auto"
              />
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <p className="mb-1.5 text-[12px] uppercase tracking-wide text-ds-text-4">
                  Fecha
                </p>
                <div className="flex h-10 items-center rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] text-ds-text-1 sm:h-9">
                  {customDateLabel}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] uppercase tracking-wide text-ds-text-4">
                  Hora
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="sr-only" htmlFor="schedule-hour">
                    Hora
                  </label>
                  <select
                    id="schedule-hour"
                    value={customHour}
                    onChange={(e) => setCustomHour(Number(e.target.value))}
                    className={selectClass}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {String(h).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="schedule-minute">
                    Minutos
                  </label>
                  <select
                    id="schedule-minute"
                    value={customMinute}
                    onChange={(e) => setCustomMinute(Number(e.target.value))}
                    className={selectClass}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {String(m).padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="mt-2 text-[12px] text-ds-text-3">
                  {formatScheduleWhen(customDate)} · {customTimeLabel}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-ds-border-subtle px-5 py-3 sm:space-x-0">
            <button
              type="button"
              onClick={() => setCustomOpen(false)}
              className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-[13px] text-primary ds-tap sm:h-9"
            >
              <X className="h-3.5 w-3.5 sm:hidden" />
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => confirmSchedule(customDate)}
              className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
            >
              Programar envío
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
