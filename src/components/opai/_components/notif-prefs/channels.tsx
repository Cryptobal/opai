"use client";

import { Bell, Mail, Monitor, Slack, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { expandCatalogDefaults, type ChannelPrefs } from "@/lib/notifications/channel-types";
import type { UnifiedNotificationType } from "@/lib/notifications/catalog";

export type Channel = keyof ChannelPrefs;

/** Columnas de canal en orden, con su icono. `slackOnly` solo si hay workspace. */
export const CHANNEL_COLS: { key: Channel; icon: ReactNode; label: string; slackOnly?: boolean }[] = [
  { key: "bell", icon: <Bell className="h-3.5 w-3.5" />, label: "Campana" },
  { key: "email", icon: <Mail className="h-3.5 w-3.5" />, label: "Email" },
  { key: "pushDesktop", icon: <Monitor className="h-3.5 w-3.5" />, label: "Push escritorio" },
  { key: "pushMobile", icon: <Smartphone className="h-3.5 w-3.5" />, label: "Push móvil" },
  { key: "slack", icon: <Slack className="h-3.5 w-3.5" />, label: "Slack", slackOnly: true },
];

/**
 * ¿El tipo ofrece este canal? bell/email/push según default del catálogo; slack
 * solo si el usuario tiene vínculo (opt-in personal).
 */
export function supportsChannel(
  t: UnifiedNotificationType,
  channel: Channel,
  slackLinked: boolean,
): boolean {
  if (channel === "slack") return slackLinked;
  const def = expandCatalogDefaults(t.defaults.admin ?? {});
  return def[channel] !== undefined;
}

export type ColumnState = "all" | "some" | "none";

/** Estado tri-state de una columna en un módulo (todas / algunas / ninguna). */
export function columnState(
  moduleTypes: UnifiedNotificationType[],
  prefs: Record<string, ChannelPrefs>,
  channel: Channel,
  slackLinked: boolean,
): ColumnState {
  const supported = moduleTypes.filter((t) => supportsChannel(t, channel, slackLinked));
  if (supported.length === 0) return "none";
  const on = supported.filter((t) => prefs[t.key]?.[channel] ?? false).length;
  return on === 0 ? "none" : on === supported.length ? "all" : "some";
}

/** Fila de encabezados de columna clickeables (toggle tri-state por módulo). */
export function ColumnHeaderRow(props: {
  cols: typeof CHANNEL_COLS;
  moduleTypes: UnifiedNotificationType[];
  prefs: Record<string, ChannelPrefs>;
  slackLinked: boolean;
  onToggleColumn: (channel: Channel) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5 bg-muted/10">
      <div className="flex-1 min-w-0 text-[11px] text-ds-text-4">Activar/desactivar columna →</div>
      <div className="flex items-center gap-1.5 shrink-0">
        {props.cols.map((c) => {
          const enabled = c.key !== "slack" || props.slackLinked;
          const state = columnState(props.moduleTypes, props.prefs, c.key, props.slackLinked);
          return (
            <button
              key={c.key}
              type="button"
              disabled={!enabled}
              onClick={() => props.onToggleColumn(c.key)}
              title={enabled ? `${c.label}: activar/desactivar en todo el módulo` : "Vincula tu Slack para usar este canal"}
              aria-label={`Alternar ${c.label} en todo el módulo`}
              className={
                "flex items-center justify-center w-7 h-7 rounded-md border transition-colors " +
                (!enabled
                  ? "opacity-30 cursor-not-allowed "
                  : state === "all"
                    ? "bg-primary text-primary-foreground border-primary "
                    : state === "some"
                      ? "border-primary text-primary bg-primary/10 "
                      : "border-border bg-background text-muted-foreground hover:bg-muted ")
              }
            >
              {c.icon}
            </button>
          );
        })}
      </div>
    </div>
  );
}
