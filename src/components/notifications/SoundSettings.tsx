"use client";

import { useState, useCallback } from "react";
import { Volume2, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  SOUND_OPTIONS,
  getSoundPrefs,
  setSoundPref,
  type SoundCategory,
} from "@/lib/notification-sounds";

function SoundSelect({
  label,
  category,
  value,
  onChange,
}: {
  label: string;
  category: SoundCategory;
  value: string;
  onChange: (category: SoundCategory, id: string) => void;
}) {
  const preview = useCallback(
    (file: string) => {
      if (!file) return;
      try {
        const audio = new Audio(file);
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch {}
    },
    [],
  );

  const selected = SOUND_OPTIONS.find((o) => o.id === value) ?? SOUND_OPTIONS[0];

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-zinc-400">{label}</label>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => onChange(category, e.target.value)}
          className="flex-1 h-8 rounded-md border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
        >
          {SOUND_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        {selected.file && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-zinc-400 hover:text-teal-400"
            onClick={() => preview(selected.file)}
            title="Previsualizar sonido"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function SoundSettingsButton() {
  const [prefs, setPrefs] = useState(getSoundPrefs);

  const handleChange = useCallback((category: SoundCategory, id: string) => {
    setSoundPref(category, id);
    setPrefs((prev) => ({ ...prev, [category]: id }));
  }, []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          title="Configurar sonidos"
        >
          <Volume2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="text-sm">Sonidos de notificacion</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <SoundSelect
            label="Mensaje de chat"
            category="chat"
            value={prefs.chat}
            onChange={handleChange}
          />
          <SoundSelect
            label="Notificacion del sistema"
            category="system"
            value={prefs.system}
            onChange={handleChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
