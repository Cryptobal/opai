"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { mapsHref, type InstallationOption } from "./types";

const INPUT =
  "h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 px-3 text-[13px] sm:h-9";

export function InstallationField({
  accountId,
  value,
  onChange,
  allowCustom,
  customAddress,
  onCustomAddress,
}: {
  accountId: string | null;
  value: string;
  onChange: (id: string) => void;
  allowCustom: boolean;
  customAddress: string;
  onCustomAddress: (v: string) => void;
}) {
  const [list, setList] = useState<InstallationOption[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!accountId) {
      setList([]);
      return;
    }
    const mine = ++seq.current;
    fetch(`/api/crm/installations?accountId=${accountId}`)
      .then((r) => r.json())
      .then((j) => {
        if (mine === seq.current) setList(j.data ?? []);
      })
      .catch(() => undefined);
  }, [accountId]);

  const selected = list.find((i) => i.id === value) ?? null;

  return (
    <div className="space-y-1.5">
      <select
        className={INPUT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!accountId}
      >
        <option value="">{accountId ? "Instalación…" : "Elegí una cuenta primero"}</option>
        {list.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>

      {selected && (
        <div className="flex items-start justify-between gap-2 rounded-xl border border-ds-border-subtle bg-ds-surface-1 px-3 py-2">
          <p className="min-w-0 text-[12px] text-ds-text-3">
            {[selected.address, selected.commune].filter(Boolean).join(", ") || "Sin dirección"}
          </p>
          {mapsHref(selected) && (
            <a
              href={mapsHref(selected)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-[12px] text-primary ds-tap"
            >
              <MapPin className="h-3.5 w-3.5" /> Maps
            </a>
          )}
        </div>
      )}

      {allowCustom && !value && (
        <input
          className={INPUT}
          placeholder="O dirección libre (para visitas sin instalación)"
          value={customAddress}
          onChange={(e) => onCustomAddress(e.target.value)}
        />
      )}
    </div>
  );
}
