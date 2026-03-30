"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CountdownTimerProps {
  targetDate: Date | string;
  onExpired?: () => void;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  label?: string;
  expiredLabel?: string;
  className?: string;
}

export function CountdownTimer({
  targetDate,
  onExpired,
  size = "md",
  showLabel = false,
  label = "Próxima oleada en",
  expiredLabel = "Escalando...",
  className,
}: CountdownTimerProps) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
    return Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
  });

  useEffect(() => {
    const target = typeof targetDate === "string" ? new Date(targetDate) : targetDate;
    const calcRemaining = () => Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));

    setSecondsLeft(calcRemaining());

    const interval = setInterval(() => {
      const remaining = calcRemaining();
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate, onExpired]);

  if (secondsLeft <= 0) {
    return (
      <span className={cn(
        "font-mono text-muted-foreground animate-pulse",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-2xl font-bold",
        className,
      )}>
        {expiredLabel}
      </span>
    );
  }

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;

  const display = secondsLeft >= 600
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;

  const urgencyColor = secondsLeft > 300
    ? "text-emerald-400"
    : secondsLeft > 60
    ? "text-amber-400"
    : "text-red-400 animate-pulse";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {showLabel && (
        <span className={cn(
          "text-muted-foreground",
          size === "sm" && "text-xs",
          size === "md" && "text-xs",
          size === "lg" && "text-sm",
        )}>
          {label}
        </span>
      )}
      <span className={cn(
        "font-mono font-semibold tabular-nums",
        urgencyColor,
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        size === "lg" && "text-2xl",
      )}>
        ⏱ {display}
      </span>
    </div>
  );
}
