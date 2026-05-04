"use client";

import {
  MoreVertical,
  VolumeX,
  Settings2,
  CircleCheckBig,
  Circle,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuickMute } from "@/lib/notifications/use-quick-mute";
import { getUnifiedType } from "@/lib/notifications/catalog";

interface Props {
  notificationId: string;
  type: string;
  read: boolean;
  onToggleRead: (read: boolean) => void;
  onDelete: () => void;
  onMuted?: () => void;
}

export function NotificationItemMenu({
  type,
  read,
  onToggleRead,
  onDelete,
  onMuted,
}: Props) {
  const { muteType, muting } = useQuickMute();
  const def = getUnifiedType(type);
  const label = def?.label ?? type;

  const handleMute = async () => {
    const ok = await muteType(type, label);
    if (ok) onMuted?.();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Más acciones"
          className="rounded p-1 text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onToggleRead(!read)}>
          {read ? (
            <>
              <Circle className="h-4 w-4 mr-2" /> Marcar como no leída
            </>
          ) : (
            <>
              <CircleCheckBig className="h-4 w-4 mr-2" /> Marcar como leída
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleMute} disabled={muting}>
          <VolumeX className="h-4 w-4 mr-2" />
          Silenciar &ldquo;{label}&rdquo;
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/opai/perfil/notificaciones?type=${encodeURIComponent(type)}`}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar este tipo
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
