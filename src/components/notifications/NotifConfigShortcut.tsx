"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  className?: string;
  onClick?: () => void;
}

export function NotifConfigShortcut({ className, onClick }: Props) {
  return (
    <Button asChild variant="ghost" size="sm" className={className ?? "h-7 text-xs gap-1"}>
      <Link
        href="/opai/perfil/notificaciones"
        onClick={onClick}
        title="Configurar mis notificaciones"
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Configurar</span>
      </Link>
    </Button>
  );
}
