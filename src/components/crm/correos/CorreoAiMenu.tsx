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
import { canEdit, hasCapability, type RolePermissions } from "@/lib/permissions";
import type { CorreoThreadDTO } from "@/modules/crm/email/correos.types";
import type { RadarCapability } from "@/modules/crm/email/radar-types";
import {
  radarVerticalLabel,
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

const RADAR_CAPS: RadarCapability[] = [
  "radar_comercial",
  "radar_operaciones",
  "radar_rrhh",
  "radar_finanzas",
];

export type CorreoAiHandlers = {
  onCommand: (commandId: CorreoAiCommandId, thread: CorreoThreadDTO) => void;
};

function capsFromPerms(perms: RolePermissions): Set<RadarCapability> {
  const set = new Set<RadarCapability>();
  for (const c of RADAR_CAPS) {
    if (hasCapability(perms, c)) set.add(c);
  }
  return set;
}

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
 * Construye los ítems del grupo ✦ Acciones IA ordenados por vertical del Radar.
 * Vacío si el usuario no tiene ninguna capability de radar.
 */
export function buildAiMenuItems(
  thread: CorreoThreadDTO,
  perms: RolePermissions,
  handlers: CorreoAiHandlers,
): CorreoMenuItem[] {
  const caps = capsFromPerms(perms);
  const canEditCorreos = canEdit(perms, "productividad", "correos");
  const { primary, more } = resolveCorreoAiCommands(thread.aiVertical, caps, {
    canEditCorreos,
  });
  if (primary.length === 0 && more.length === 0) return [];

  const items: CorreoMenuItem[] = [
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: "Acciones IA",
      onClick: () => {},
      header: "✦ Acciones IA",
      headerPill: `Radar: ${radarVerticalLabel(thread.aiVertical)}`,
    },
  ];

  for (const cmd of primary) {
    items.push(toMenuItem(cmd, thread, handlers.onCommand));
  }

  if (more.length > 0) {
    items.push({
      icon: <Sparkles className="h-4 w-4" />,
      label: "Más acciones IA",
      onClick: () => {},
      sectionLabel: "Más acciones IA",
    });
    for (const cmd of more) {
      items.push(toMenuItem(cmd, thread, handlers.onCommand));
    }
  }

  return items;
}

export { capsFromPerms };
