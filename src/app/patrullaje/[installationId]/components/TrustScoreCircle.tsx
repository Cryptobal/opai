"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  score: number;
  size?: number;
  breakdown?: Record<string, { score: number; weight: number; detail?: string }>;
}

export function TrustScoreCircle({ score, size = 160, breakdown }: Props) {
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animated / 100) * circumference;

  const color =
    score >= 80 ? "#22c55e" : score >= 60 ? "#3b82f6" : score < 40 ? "#ef4444" : "#f59e0b";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={8}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={8}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold" style={{ color }}>
            {animated}
          </span>
          <span className="text-[11px] text-white/40 mt-0.5">Trust Score</span>
        </div>
      </div>

      {breakdown && (
        <div className="w-full max-w-[240px] space-y-1.5">
          {Object.entries(breakdown).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-white/40 w-20 text-right capitalize">{key}</span>
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700",
                    val.score >= 80 ? "bg-emerald-500" : val.score >= 60 ? "bg-blue-500" : "bg-amber-500"
                  )}
                  style={{ width: `${val.score}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 w-6">{val.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
