"use client";

import type { ReactNode } from "react";
import {
  Building2,
  FileText,
  MessageSquare,
  Search,
  Sparkles,
  TicketPlus,
  UserPlus,
  UserRoundCheck,
  Wallet,
} from "lucide-react";
import { canEdit, type RolePermissions } from "@/lib/permissions";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import {
  resolveCorreoAiCommands,
  type CorreoAiCommand,
  type CorreoAiCommandId,
} from "@/modules/crm/email/correo-ai-commands";
import type { CorreoMenuItem } from "./CorreoContextMenu";

const ICONS: Record<string, ReactNode> = {
  Sparkles: <Sparkles className="h-4 w-4" />,
  Building2: <Building2 className="h-4 w-4" />,
  UserPlus: <UserPlus className="h-4 w-4" />,
  TicketPlus: <TicketPlus className="h-4 w-4" />,
  UserRoundCheck: <UserRoundCheck className="h-4 w-4" />,
  Wallet: <Wallet className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
  Search: <Search className="h-4 w-4" />,
  MessageSquare: <MessageSquare className="h-4 w-4" />,
};

export type CorreoAiHandlers = {
  onCommand: (commandId: CorreoAiCommandId, thread: CorreoThreadDTO) => void;
};

function toMenuItem(
  cmd: CorreoAiCommand,
  thread: CorreoThreadDTO,
  onCommand: CorreoAiHandlers["onCommand"],
  extra?: Partial<CorreoMenuItem>,
): CorreoMenuItem {
  return {
    icon: ICONS[cmd.icon] ?? <Sparkles className="h-4 w-4" />,
    label: cmd.label,
    onClick: () => onCommand(cmd.id, thread),
    ...extra,
  };
}

/**
 * Ítems planos del submenú ✦ Copiloto (sin header propio).
 * Vacío si el usuario no tiene capability `copiloto_correos`.
 * `primary` + divisor + `more` cuando hay ambas secciones.
 */
export function buildAiMenuItems(
  thread: CorreoThreadDTO,
  perms: RolePermissions,
  handlers: CorreoAiHandlers,
): CorreoMenuItem[] {
  const canEditCorreos = canEdit(perms, "productividad", "correos");
  const { primary, more } = resolveCorreoAiCommands(perms, {
    canEditCorreos,
  });
  if (primary.length === 0 && more.length === 0) return [];

  const items: CorreoMenuItem[] = [];
  for (const cmd of primary) {
    items.push(toMenuItem(cmd, thread, handlers.onCommand));
  }
  if (more.length > 0) {
    more.forEach((cmd, idx) => {
      items.push(
        toMenuItem(cmd, thread, handlers.onCommand, idx === 0 ? { divider: true } : undefined),
      );
    });
  }
  return items;
}
