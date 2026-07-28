"use client";

import { useEffect, useState } from "react";
import { Tag } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import {
  THREAD_LINK_ENTITY_TYPES,
  THREAD_LINK_TYPE_LABELS,
  type ThreadLinkEntityType,
} from "@/modules/crm/email/email-thread-links";

type Candidate = {
  id: string;
  label: string;
  sublabel: string | null;
  status: string | null;
  scope: "account" | "tenant";
};

type Props = {
  accountId: string | null;
  onPick: (entityType: string, entityId: string, scope?: "account" | "tenant") => void;
};

const TYPE_OPTIONS = THREAD_LINK_ENTITY_TYPES.map((key) => ({
  value: key,
  label: THREAD_LINK_TYPE_LABELS[key],
}));

/**
 * Selector de tipo + búsqueda. «De esta cuenta» expandido;
 * «Resto del tenant» detrás de acción explícita.
 */
export function CorreoLinkPicker({ accountId, onPick }: Props) {
  const [type, setType] = useState<ThreadLinkEntityType>("installation");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [accountScopeApplies, setAccountScopeApplies] = useState(false);
  const [showTenant, setShowTenant] = useState(false);

  useEffect(() => {
    setShowTenant(false);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ type, q });
      if (accountId) params.set("accountId", accountId);
      fetch(`/api/crm/correos/link-search?${params}`)
        .then((r) => r.json())
        .then((d) => {
          setCandidates(Array.isArray(d.candidates) ? d.candidates : []);
          setAccountScopeApplies(Boolean(d.accountScopeApplies));
        })
        .catch(() => {
          setCandidates([]);
          setAccountScopeApplies(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [type, q, accountId]);

  const accountCandidates = candidates.filter((c) => c.scope === "account");
  const tenantCandidates = candidates.filter((c) => c.scope === "tenant");

  return (
    <div className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2">
      <div className="flex gap-2">
        <SimpleSelect
          value={type}
          onValueChange={(v) => {
            setType(v as ThreadLinkEntityType);
            setQ("");
          }}
          className="h-10 w-[9.5rem] sm:h-9"
          aria-label="Tipo de entidad"
          options={TYPE_OPTIONS}
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar…"
          className="h-10 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"
        />
      </div>
      {!accountScopeApplies ? (
        <ul className="max-h-44 space-y-0.5 overflow-y-auto">
          {candidates.map((c) => (
            <CandidateRow
              key={c.id}
              candidate={c}
              muted={false}
              onPick={() => onPick(type, c.id, c.scope)}
            />
          ))}
          {candidates.length === 0 && (
            <li className="px-2 py-1.5 text-[12px] text-ds-text-4">Sin resultados</li>
          )}
        </ul>
      ) : (
        <ul className="max-h-52 space-y-0.5 overflow-y-auto">
          {accountCandidates.length > 0 && (
            <>
              <li className="px-2 pt-1 text-[12px] font-medium text-ds-text-3">
                De esta cuenta ({accountCandidates.length})
              </li>
              {accountCandidates.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  muted={false}
                  onPick={() => onPick(type, c.id, c.scope)}
                />
              ))}
            </>
          )}
          {tenantCandidates.length > 0 && !showTenant && (
            <li className="px-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTenant(true)}
                className="text-[12px] font-medium text-primary ds-tap"
              >
                Ver resto del tenant ({tenantCandidates.length})
              </button>
            </li>
          )}
          {showTenant && tenantCandidates.length > 0 && (
            <>
              <li className="px-2 pt-2 text-[12px] font-medium text-ds-text-4">
                Resto del tenant ({tenantCandidates.length})
              </li>
              {tenantCandidates.map((c) => (
                <CandidateRow
                  key={c.id}
                  candidate={c}
                  muted
                  onPick={() => onPick(type, c.id, c.scope)}
                />
              ))}
            </>
          )}
          {accountCandidates.length === 0 && tenantCandidates.length === 0 && (
            <li className="px-2 py-1.5 text-[12px] text-ds-text-4">Sin resultados</li>
          )}
        </ul>
      )}
    </div>
  );
}

function CandidateRow({
  candidate,
  muted,
  onPick,
}: {
  candidate: Candidate;
  muted: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ds-tap hover:bg-ds-surface-2 sm:min-h-0 ${
          muted ? "text-ds-text-3 opacity-70" : "text-ds-text-2"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{candidate.label}</span>
        {candidate.sublabel && (
          <span className="shrink-0 text-[12px] text-ds-text-4">{candidate.sublabel}</span>
        )}
        {candidate.status && <Tag variant="info" size="sm">{String(candidate.status)}</Tag>}
      </button>
    </li>
  );
}
