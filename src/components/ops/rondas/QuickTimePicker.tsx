"use client";

import { useState, useRef, useEffect } from "react";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "15", "30", "45"];

interface QuickTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function QuickTimePicker({ value, onChange, label }: QuickTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedHour, setSelectedHour] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const currentHour = value.split(":")[0] ?? "21";
  const currentMinute = value.split(":")[1] ?? "00";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedHour(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleHourClick = (h: string) => {
    setSelectedHour(h);
  };

  const handleMinuteClick = (m: string) => {
    const h = selectedHour ?? currentHour;
    onChange(`${h}:${m}`);
    setOpen(false);
    setSelectedHour(null);
  };

  return (
    <div className="relative space-y-0.5" ref={ref}>
      {label && (
        <label className="text-[11px] text-muted-foreground block">{label}</label>
      )}
      <button
        type="button"
        onClick={() => { setOpen(!open); setSelectedHour(null); }}
        className="flex h-9 w-full items-center justify-between rounded border border-border bg-background px-3 text-sm hover:border-primary/40 transition-colors"
      >
        <span>{value}</span>
        <svg className="h-3.5 w-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[320px] rounded-xl border border-[#1e293b] bg-[#111827] p-3 shadow-xl">
          {!selectedHour && (
            <>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">Hora</p>
              <div className="grid grid-cols-6 gap-1">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => handleHourClick(h)}
                    className={[
                      "rounded-lg py-1.5 text-xs font-medium transition-colors",
                      h === currentHour
                        ? "bg-[#2dd4bf]/20 text-[#2dd4bf] border border-[#2dd4bf]/30"
                        : "text-[#94a3b8] hover:bg-white/5 hover:text-[#f1f5f9]",
                    ].join(" ")}
                  >
                    {h}:00
                  </button>
                ))}
              </div>
            </>
          )}

          {selectedHour && (
            <>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedHour(null)}
                  className="text-[11px] text-[#64748b] hover:text-[#f1f5f9]"
                >
                  &larr; Volver
                </button>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">
                  {selectedHour}:__
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMinuteClick(m)}
                    className={[
                      "rounded-lg py-3 text-sm font-semibold transition-colors",
                      selectedHour === currentHour && m === currentMinute
                        ? "bg-[#2dd4bf]/20 text-[#2dd4bf] border border-[#2dd4bf]/30"
                        : "bg-white/5 text-[#94a3b8] hover:bg-[#2dd4bf]/10 hover:text-[#2dd4bf]",
                    ].join(" ")}
                  >
                    {selectedHour}:{m}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
