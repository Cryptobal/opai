"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, User as UserIcon, Briefcase } from "lucide-react";

export interface SelectedPerson {
  id: string;
  kind: "guardia" | "postulante";
  displayName: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  subtitle: string;
  lastAssessmentAt: string | null;
}

interface Props {
  onSelect: (person: SelectedPerson) => void;
  placeholder?: string;
}

export default function PersonSelector({ onSelect, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SelectedPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const tmr = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (tmr.current) clearTimeout(tmr.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    tmr.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/psych/persons/search?q=${encodeURIComponent(q)}&type=all`,
        );
        const j = await res.json();
        if (j.success) setResults(j.results);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (tmr.current) clearTimeout(tmr.current);
    };
  }, [q]);

  const guardias = results.filter((r) => r.kind === "guardia");
  const postulantes = results.filter((r) => r.kind === "postulante");

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder ?? "Buscar por nombre o RUT…"}
          className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
        />
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {open && q.trim().length >= 2 ? (
        <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-border bg-popover shadow-lg z-20 max-h-80 overflow-y-auto">
          {results.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No se encontraron personas.
            </p>
          ) : null}
          {postulantes.length > 0 ? (
            <Group title={`Postulantes (${postulantes.length})`}>
              {postulantes.map((p) => (
                <ResultRow key={p.id} item={p} onPick={onSelect} />
              ))}
            </Group>
          ) : null}
          {guardias.length > 0 ? (
            <Group title={`Guardias activos (${guardias.length})`}>
              {guardias.map((g) => (
                <ResultRow key={g.id} item={g} onPick={onSelect} />
              ))}
            </Group>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="px-4 pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  item,
  onPick,
}: {
  item: SelectedPerson;
  onPick: (p: SelectedPerson) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      className="w-full text-left px-4 py-2.5 hover:bg-accent flex items-start gap-2"
    >
      {item.kind === "guardia" ? (
        <UserIcon className="size-4 mt-0.5 text-muted-foreground" />
      ) : (
        <Briefcase className="size-4 mt-0.5 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {item.displayName}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {item.subtitle}
          {item.rut ? ` · ${item.rut}` : ""}
        </p>
      </div>
      {item.lastAssessmentAt ? (
        <span className="text-[10px] text-status-warn-fg dark:text-status-warn-fg shrink-0">
          Evaluado
        </span>
      ) : null}
    </button>
  );
}
