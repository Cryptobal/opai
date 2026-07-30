"use client";

import { paletteFgBg } from "@/lib/design/calendar-palette";
import { cn } from "@/lib/utils";
import { AgendaCalendarSourceRow } from "./AgendaCalendarSourceRow";

/** Espejo client-safe de CalendarSource (el módulo server importa Prisma). */
export type CalendarSource = {
  sourceKey: string;
  kind: "opai" | "google";
  accountId: string | null;
  accountEmail: string | null;
  name: string;
  color: string;
  hidden: boolean;
  isCreateTarget: boolean;
};

const CAL_CONNECT_HREF =
  "/api/integrations/google-calendar/oauth/start?return=/opai/agenda";

type Props = {
  sources: CalendarSource[];
  onToggle: (sourceKey: string) => void;
  onColorChange: (sourceKey: string, color: string) => void;
  onSetCreateTarget?: (sourceKey: string) => void;
  counts: Record<string, number>;
  /**
   * Superficie multicuenta (flag o escape). Sin ella, lista plana de
   * calendarios Google sin encabezado de email de cuenta.
   */
  multiEnabled?: boolean;
};

/** Lista de calendarios del rail: OPAI + cuentas Google. */
export function AgendaCalendarList({
  sources,
  onToggle,
  onColorChange,
  onSetCreateTarget,
  counts,
  multiEnabled = false,
}: Props) {
  const opai = sources.filter((s) => s.kind === "opai");
  const google = sources.filter((s) => s.kind === "google");
  const byAccount = new Map<string, CalendarSource[]>();
  for (const s of google) {
    const email = s.accountEmail ?? "Google";
    byAccount.set(email, [...(byAccount.get(email) ?? []), s]);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <p className="px-1.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          OPAI
        </p>
        {opai.map((s) => (
          <AgendaCalendarSourceRow
            key={s.sourceKey}
            source={s}
            count={counts[s.sourceKey] ?? 0}
            onToggle={onToggle}
            onColorChange={onColorChange}
          />
        ))}
      </div>

      <div className="space-y-2">
        <p className="px-1.5 pb-1 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          Google
        </p>
        {google.length === 0 ? (
          <a
            href={CAL_CONNECT_HREF}
            className="flex h-8 items-center rounded-lg px-1.5 text-ds-body text-primary underline-offset-2 hover:underline ds-tap"
          >
            Conectar Google Calendar
          </a>
        ) : multiEnabled ? (
          [...byAccount.entries()].map(([email, accountSources]) => {
            const visible = accountSources.filter((s) => !s.hidden).length;
            return (
              <div key={email} className="space-y-0.5">
                <div className="flex items-center gap-2 px-1.5 pb-0.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      paletteFgBg(accountSources[0]?.color ?? "teal"),
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ds-text-3">
                    {email}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] text-ds-text-4">
                    {visible}/{accountSources.length}
                  </span>
                </div>
                {accountSources.map((s) => (
                  <AgendaCalendarSourceRow
                    key={s.sourceKey}
                    source={s}
                    count={counts[s.sourceKey] ?? 0}
                    onToggle={onToggle}
                    onColorChange={onColorChange}
                    onSetCreateTarget={onSetCreateTarget}
                  />
                ))}
              </div>
            );
          })
        ) : (
          <div className="space-y-0.5">
            {google.map((s) => (
              <AgendaCalendarSourceRow
                key={s.sourceKey}
                source={s}
                count={counts[s.sourceKey] ?? 0}
                onToggle={onToggle}
                onColorChange={onColorChange}
                onSetCreateTarget={onSetCreateTarget}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
