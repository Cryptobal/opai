"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatform } from "@/hooks/usePlatform";

interface PlatformAwareFabProps {
  icon: LucideIcon;
  label?: string;
  onClick: () => void;
  className?: string;
  /** Posición absoluta del FAB. Default: bottom-right sobre el nav */
  position?: { bottom?: number; right?: number };
}

export function PlatformAwareFab({
  icon: Icon,
  label,
  onClick,
  className,
  position = { bottom: 92, right: 20 },
}: PlatformAwareFabProps) {
  const platform = usePlatform();
  const isIOS = platform === "ios";

  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed z-50 rounded-full flex items-center gap-2 font-display font-bold text-white active:scale-95 transition-transform",
        isIOS ? "opai-liquid-glass-fab" : "opai-m3e-fab",
        className,
      )}
      style={{
        bottom: position.bottom,
        right: position.right,
        padding: label ? (isIOS ? "14px 20px" : "16px 22px") : "16px",
        fontSize: "14px",
      }}
      aria-label={label ?? "Acción rápida"}
    >
      <Icon size={20} strokeWidth={2.5} />
      {label && <span>{label}</span>}
    </button>
  );
}
