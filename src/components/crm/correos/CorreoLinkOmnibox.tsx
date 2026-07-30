"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/opai-ds";
import {
  THREAD_LINK_TYPE_LABELS,
  type ThreadLinkEntityType,
} from "@/modules/crm/email/email-thread-links";

export type OmniboxCandidate = {
  id: string;
  entityType: string;
  label: string;
  sublabel: string | null;
  status: string | null;
  scope: "account" | "tenant" | "suggested";
  signal?: string | null;
  confidence?: "alta" | "media" | null;
};

type Props = {
  accountId: string | null;
  /** Tipos a buscar. Default: los 6 del buscador único (+ deal). */
  types?: string[];
  placeholder?: string;
  onPick: (c: OmniboxCandidate) => void;
  onCancel?: () => void;
  /** Opción destructiva al pie (p. ej. quitar cuenta del hilo). */
  onRemove?: () => void | Promise<void>;
  removeLabel?: string;
};

const DEFAULT_TYPES = [
  "account",
  "contact",
  "deal",
  "quote",
  "installation",
  "contract",
];

/**
 * Buscador único de vinculación (Copiloto v4): un campo, seis tipos,
 * grupos Sugerido / De esta cuenta / Resto del tenant.
 */
export function CorreoLinkOmnibox({
  accountId,
  types = DEFAULT_TYPES,
  placeholder = "Buscar cuenta, contacto, negocio…",
  onPick,
  onCancel,
  onRemove,
  removeLabel = "Quitar cuenta del hilo",
}: Props) {
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<OmniboxCandidate[]>([]);
  const [showTenant, setShowTenant] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setShowTenant(false);
    const timer = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({
        types: types.join(","),
        q,
      });
      if (accountId) params.set("accountId", accountId);
      fetch(`/api/crm/correos/link-search?${params}`)
        .then((r) => r.json())
        .then((d) => {
          const list = Array.isArray(d.candidates) ? d.candidates : [];
          setCandidates(
            list.map(
              (c: OmniboxCandidate & { entityType?: string }) => ({
                ...c,
                entityType: c.entityType ?? "unknown",
              }),
            ),
          );
        })
        .catch(() => setCandidates([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [q, accountId, types]);

  const suggested = candidates.filter((c) => c.scope === "suggested");
  const accountOnes = candidates.filter((c) => c.scope === "account");
  const tenantOnes = candidates.filter((c) => c.scope === "tenant");

  function typeLabel(t: string): string {
    if (t === "account") return "Cuenta";
    if (t === "contact") return "Contacto";
    if (t === "deal") return "Negocio";
    if (t in THREAD_LINK_TYPE_LABELS) {
      return THREAD_LINK_TYPE_LABELS[t as ThreadLinkEntityType];
    }
    return t;
  }

  return (
    <div className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-10 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-ds-body text-ds-text-1 sm:h-9"
        />
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-10 shrink-0 rounded-lg px-2 text-[12px] text-ds-text-3 ds-tap sm:h-9"
          >
            Cancelar
          </button>
        )}
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto">
        {loading && (
          <li className="px-2 py-1.5 text-[12px] text-ds-text-4">Buscando…</li>
        )}
        {suggested.length > 0 && (
          <>
            <li className="px-2 pt-1 text-[12px] font-medium text-ds-text-3">
              Sugerido para este correo
            </li>
            {suggested.map((c) => (
              <CandidateRow
                key={`${c.entityType}:${c.id}`}
                candidate={c}
                typeLabel={typeLabel(c.entityType)}
                muted={false}
                onPick={() => onPick(c)}
              />
            ))}
          </>
        )}
        {accountOnes.length > 0 && (
          <>
            <li className="px-2 pt-1 text-[12px] font-medium text-ds-text-3">
              De esta cuenta ({accountOnes.length})
            </li>
            {accountOnes.map((c) => (
              <CandidateRow
                key={`${c.entityType}:${c.id}`}
                candidate={c}
                typeLabel={typeLabel(c.entityType)}
                muted={false}
                onPick={() => onPick(c)}
              />
            ))}
          </>
        )}
        {tenantOnes.length > 0 && !showTenant && (
          <li className="px-2 pt-2">
            <button
              type="button"
              onClick={() => setShowTenant(true)}
              className="text-[12px] font-medium text-primary ds-tap"
            >
              Ver resto del tenant ({tenantOnes.length})
            </button>
          </li>
        )}
        {showTenant &&
          tenantOnes.map((c) => (
            <CandidateRow
              key={`${c.entityType}:${c.id}`}
              candidate={c}
              typeLabel={typeLabel(c.entityType)}
              muted
              onPick={() => onPick(c)}
            />
          ))}
        {!loading && candidates.length === 0 && (
          <li className="px-2 py-1.5 text-[12px] text-ds-text-4">Sin resultados</li>
        )}
      </ul>
      {onRemove && (
        <button
          type="button"
          onClick={() => void onRemove()}
          className="flex min-h-11 w-full items-center justify-center rounded-lg border border-status-danger-border bg-status-danger-soft px-2 text-ds-body font-medium text-status-danger-fg ds-tap sm:min-h-9"
        >
          {removeLabel}
        </button>
      )}
    </div>
  );
}

function CandidateRow({
  candidate,
  typeLabel,
  muted,
  onPick,
}: {
  candidate: OmniboxCandidate;
  typeLabel: string;
  muted: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-ds-body ds-tap hover:bg-ds-surface-2 sm:min-h-0 ${
          muted ? "text-ds-text-3 opacity-70" : "text-ds-text-2"
        }`}
      >
        <Tag variant="neutral" size="sm">
          {typeLabel}
        </Tag>
        <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
        {candidate.signal && (
          <span className="shrink-0 text-[12px] text-ds-text-4">{candidate.signal}</span>
        )}
        {candidate.sublabel && (
          <span className="shrink-0 text-[12px] text-ds-text-4">{candidate.sublabel}</span>
        )}
        {candidate.confidence && (
          <Tag variant={candidate.confidence === "alta" ? "ok" : "warn"} size="sm">
            {candidate.confidence}
          </Tag>
        )}
      </button>
    </li>
  );
}
