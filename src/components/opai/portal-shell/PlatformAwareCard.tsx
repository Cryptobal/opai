"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { usePlatform } from "@/hooks/usePlatform";

interface PlatformAwareCardProps {
  children: ReactNode;
  className?: string;
  /** Estilo: elevated (destaca) o flat (normal) */
  tone?: "elevated" | "flat";
}

export function PlatformAwareCard({ children, className, tone = "flat" }: PlatformAwareCardProps) {
  const platform = usePlatform();
  const isIOS = platform === "ios";

  return (
    <div
      className={cn(
        "rounded-3xl p-5",
        isIOS ? "opai-liquid-glass" : "opai-m3e-card",
        tone === "elevated" && !isIOS && "shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}
