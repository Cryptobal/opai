"use client";

import Link from "next/link";
import { Inbox, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AVAILABLE_MAILBOX_COLORS,
  MAX_MAILBOXES_PER_USER,
  type MailboxColorKey,
} from "@/modules/crm/email/mailbox-identity";
import { tintSoft } from "./mailbox-tints";

export type MailboxAccount = {
  id: string;
  email: string;
  color: string;
  displayLabel: string;
  isDefault: boolean;
  sortIndex: number;
  unread?: number;
};

type Props = {
  accounts: MailboxAccount[];
  activeAccountId: string | null;
  inboxUnreadTotal?: number;
  collapsed?: boolean;
  touchRows?: boolean;
  onScopeChange: (accountId: string | null) => void;
  onColorChange?: (accountId: string, color: string) => void;
  connectHref?: string;
};

export { tintBar, tintSoft } from "./mailbox-tints";

/** Selector de casillas Gmail (unificada + por cuenta) para riel y drawer. */
export function MailboxSwitcher({
  accounts, activeAccountId, inboxUnreadTotal = 0, collapsed = false, touchRows = false,
  onScopeChange, onColorChange, connectHref = "/api/crm/gmail/connect",
}: Props) {
  const sorted = [...accounts].sort((a, b) => a.sortIndex - b.sortIndex);
  const atLimit = sorted.length >= MAX_MAILBOXES_PER_USER;
  const lbl = collapsed ? "hidden truncate group-hover/rail:inline" : "truncate";
  const rowPad = collapsed
    ? "justify-center px-0 group-hover/rail:justify-start group-hover/rail:px-3"
    : "px-3";
  const rowH = touchRows ? "min-h-12" : "min-h-11";
  const row = (on: boolean) =>
    `mb-0.5 flex ${rowH} w-full items-center gap-2.5 rounded-xl text-left text-[13px] ds-tap ${rowPad} ${
      on ? "bg-primary/15 font-medium text-primary" : "text-ds-text-2 hover:bg-ds-surface-2"
    }`;
  const peek = collapsed ? "hidden group-hover/rail:inline" : "";

  return (
    <div className="mb-2 border-b border-ds-border-subtle pb-2">
      <button type="button" onClick={() => onScopeChange(null)} className={row(activeAccountId === null)} aria-pressed={activeAccountId === null}>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ds-surface-3 text-ds-text-3">
          <Inbox className="h-3.5 w-3.5" />
        </span>
        <span className={`${lbl} min-w-0 flex-1`}>Todas las casillas</span>
        {inboxUnreadTotal > 0 && (
          <span className={`rounded-full bg-status-danger px-1.5 text-[12px] font-medium text-primary-foreground ${peek}`}>
            {inboxUnreadTotal > 99 ? "99+" : inboxUnreadTotal}
          </span>
        )}
      </button>

      {sorted.map((a) => {
        const initials = (a.displayLabel || a.email).slice(0, 2).toUpperCase();
        const swatchCls = `inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[12px] font-semibold ${tintSoft(a.color)}`;
        return (
          <div key={a.id} className={`group/mb relative ${row(activeAccountId === a.id)}`}>
            {onColorChange ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label={`Color de ${a.email}`}
                    className={`inline-flex shrink-0 items-center justify-center rounded-md ds-tap ${collapsed ? "h-10 w-10" : "h-8 w-8"}`}>
                    <span className={swatchCls}>{initials}</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" side="right" className="w-auto border-ds-border-default bg-ds-surface-1 p-2">
                  <div className="grid grid-cols-3 gap-1.5" role="listbox" aria-label="Color de casilla">
                    {AVAILABLE_MAILBOX_COLORS.map((key: MailboxColorKey) => (
                      <button key={key} type="button" role="option" aria-selected={a.color === key} aria-label={key}
                        onClick={() => onColorChange(a.id, key)}
                        className={`h-10 w-10 rounded-lg ds-tap ${tintSoft(key)} ${
                          a.color === key ? "ring-2 ring-primary ring-offset-1 ring-offset-ds-surface-1" : ""
                        }`} />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <span className={swatchCls}>{initials}</span>
            )}
            <button type="button" onClick={() => onScopeChange(a.id)} className={`${lbl} min-w-0 flex-1 text-left`} aria-pressed={activeAccountId === a.id}>
              <span className="block truncate">{a.email}</span>
              <span className="block truncate text-[12px] font-normal text-ds-text-4">
                {a.isDefault ? "Casilla por defecto" : "Gmail"}
              </span>
            </button>
            {(a.unread ?? 0) > 0 && (
              <span className={`rounded-full bg-status-danger px-1.5 text-[12px] font-medium text-primary-foreground ${peek}`}>
                {(a.unread ?? 0) > 99 ? "99+" : a.unread}
              </span>
            )}
            {collapsed && (
              <button type="button" aria-label={a.email} onClick={() => onScopeChange(a.id)} className="absolute inset-0 group-hover/rail:hidden" />
            )}
          </div>
        );
      })}

      <div className={collapsed ? "hidden group-hover/rail:block" : ""}>
        {!atLimit && (
          <Link href={connectHref}
            className={`mt-0.5 flex ${rowH} w-full items-center gap-2.5 rounded-xl px-3 text-[13px] text-primary ds-tap hover:bg-ds-surface-2`}>
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">Conectar otra casilla</span>
          </Link>
        )}
        <p className="px-3 pt-1 text-[12px] text-ds-text-4">Máximo {MAX_MAILBOXES_PER_USER} casillas</p>
      </div>
    </div>
  );
}
