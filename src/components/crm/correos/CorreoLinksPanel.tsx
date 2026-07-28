"use client";

/**
 * Panel operacional del hilo: entidades vinculadas, picker con alcance por
 * cuenta (De esta cuenta / Resto del tenant) y sugerencias IA.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Link2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Spinner, Tag } from "@/components/opai-ds";
import { SimpleSelect } from "@/components/ui/simple-select";
import { confirmDialog } from "@/components/ui/confirm-service";

const TYPE_LABELS: Record<string, string> = {
  installation: "Instalación",
  quote: "Cotización",
  contract: "Contrato",
  guardia: "Guardia",
  postulante: "Postulante",
  proveedor: "Proveedor",
  factura: "Factura",
  incidente: "Incidente",
};

type ResolvedLink = {
  id: string;
  entityType: string;
  entityId: string;
  linkedVia: string;
  label: string;
  status: string | null;
  href: string | null;
};

type Candidate = {
  id: string;
  label: string;
  sublabel: string | null;
  status: string | null;
  scope: "account" | "tenant";
};

type Suggestion = { entityType: string; entityId: string; label: string; motivo: string };

export function CorreoLinksPanel({
  threadId,
  accountId = null,
}: {
  threadId: string;
  /** Cuenta del hilo: acota el picker en dos grupos. */
  accountId?: string | null;
}) {
  const [links, setLinks] = useState<ResolvedLink[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("installation");
  const [q, setQ] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [accountScopeApplies, setAccountScopeApplies] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/crm/correos/${threadId}/links`)
      .then((r) => r.json())
      .then((d) => setLinks(Array.isArray(d.links) ? d.links : []))
      .catch(() => setLinks([]));
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!adding) return;
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
  }, [adding, type, q, accountId]);

  async function createLink(
    entityType: string,
    entityId: string,
    linkedVia?: string,
    scope?: "account" | "tenant",
  ) {
    if (accountScopeApplies && scope === "tenant") {
      const ok = await confirmDialog({
        title: "Vincular fuera de la cuenta",
        description:
          "Esta entidad no pertenece a la cuenta del hilo. ¿Confirmás el vínculo de todos modos?",
        confirmLabel: "Vincular igual",
        cancelLabel: "Cancelar",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/crm/correos/${threadId}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId, linkedVia }),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      toast.error(data.error || "No se pudo vincular");
      return;
    }
    toast.success("Vinculado");
    setAdding(false);
    setQ("");
    setSuggestions((prev) => prev?.filter((s) => s.entityId !== entityId) ?? null);
    load();
  }

  async function removeLink(linkId: string) {
    await fetch(`/api/crm/correos/${threadId}/links?linkId=${linkId}`, { method: "DELETE" }).catch(
      () => {},
    );
    load();
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/crm/correos/${threadId}/links/suggest`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        suggestions?: Suggestion[];
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(data.error || "No se pudieron sugerir vínculos");
        return;
      }
      if (data.note) toast.message(data.note);
      setSuggestions(data.suggestions ?? []);
      if ((data.suggestions ?? []).length === 0 && !data.note) {
        toast.message("La IA no encontró entidades referidas en este correo");
      }
    } finally {
      setSuggesting(false);
    }
  }

  const accountCandidates = candidates.filter((c) => c.scope === "account");
  const tenantCandidates = candidates.filter((c) => c.scope === "tenant");

  return (
    <section
      aria-label="Entidades vinculadas"
      className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3"
    >
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-tint-violet-fg" />
        <p className="text-[13px] font-semibold text-ds-text-1">Vinculado a</p>
        {accountId ? (
          <Tag variant="brand" size="sm">
            Alcance: cuenta
          </Tag>
        ) : (
          <Tag variant="neutral" size="sm">
            Sin cuenta — todo el tenant
          </Tag>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void suggest()}
            disabled={suggesting}
            className="inline-flex h-10 items-center gap-1 rounded-lg bg-tint-violet px-2 text-[12px] font-medium text-tint-violet-fg ds-tap disabled:opacity-50 sm:h-8"
          >
            {suggesting ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            Sugerir
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            aria-label="Vincular entidad"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-ds-border-default px-2 text-[12px] ds-tap"
          >
            <Plus className="h-3.5 w-3.5" /> Vincular
          </button>
        </div>
      </div>

      {links === null ? (
        <Spinner className="mx-auto" />
      ) : links.length === 0 ? (
        <p className="text-[12px] text-ds-text-4">
          Sin vínculos. Vinculá una instalación, cotización, contrato o factura.
        </p>
      ) : (
        <ul className="space-y-1">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2">
              <Tag variant="neutral" size="sm">
                {TYPE_LABELS[link.entityType] ?? link.entityType}
              </Tag>
              {link.href ? (
                <Link
                  href={link.href}
                  className="min-w-0 flex-1 truncate text-[13px] text-ds-text-2 underline-offset-2 hover:underline"
                >
                  {link.label}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-2">
                  {link.label}
                </span>
              )}
              {link.status && <Tag variant="info" size="sm">{link.status}</Tag>}
              {link.linkedVia !== "manual" && (
                <Tag variant="brand" size="sm">
                  {link.linkedVia === "ai" ? "IA" : "regla"}
                </Tag>
              )}
              <button
                type="button"
                aria-label={`Quitar vínculo ${link.label}`}
                onClick={() => void removeLink(link.id)}
                className="text-ds-text-4 ds-tap hover:text-status-danger-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions !== null && suggestions.length > 0 && (
        <div className="space-y-1 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2">
          <p className="text-[12px] font-medium text-ds-text-3">
            Sugerencias de la IA (confirmá para vincular)
          </p>
          {suggestions.map((s) => (
            <div key={`${s.entityType}:${s.entityId}`} className="flex items-center gap-2">
              <Tag variant="neutral" size="sm">
                {TYPE_LABELS[s.entityType] ?? s.entityType}
              </Tag>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ds-text-2" title={s.motivo}>
                {s.label}
              </span>
              <button
                type="button"
                onClick={() => void createLink(s.entityType, s.entityId, "ai")}
                className="h-8 rounded-lg bg-primary px-2 text-[12px] font-medium text-primary-foreground ds-tap"
              >
                Vincular
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-2 rounded-lg border border-ds-border-subtle bg-ds-surface-1 p-2">
          <div className="flex gap-2">
            <SimpleSelect
              value={type}
              onValueChange={(v) => {
                setType(v);
                setQ("");
              }}
              className="h-10 w-[9.5rem] sm:h-9"
              aria-label="Tipo de entidad"
              options={Object.entries(TYPE_LABELS).map(([key, label]) => ({
                value: key,
                label,
              }))}
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar…"
              className="h-10 min-w-0 flex-1 rounded-lg border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:h-9"
            />
          </div>
          <CandidateList
            accountScopeApplies={accountScopeApplies}
            accountCandidates={accountCandidates}
            tenantCandidates={tenantCandidates}
            flatCandidates={candidates}
            onPick={(c) => void createLink(type, c.id, undefined, c.scope)}
          />
        </div>
      )}
    </section>
  );
}

function CandidateList({
  accountScopeApplies,
  accountCandidates,
  tenantCandidates,
  flatCandidates,
  onPick,
}: {
  accountScopeApplies: boolean;
  accountCandidates: Candidate[];
  tenantCandidates: Candidate[];
  flatCandidates: Candidate[];
  onPick: (c: Candidate) => void;
}) {
  if (!accountScopeApplies) {
    return (
      <ul className="max-h-44 space-y-0.5 overflow-y-auto">
        {flatCandidates.map((c) => (
          <CandidateRow key={c.id} candidate={c} muted={false} onPick={onPick} />
        ))}
        {flatCandidates.length === 0 && (
          <li className="px-2 py-1.5 text-[12px] text-ds-text-4">Sin resultados</li>
        )}
      </ul>
    );
  }

  return (
    <ul className="max-h-52 space-y-0.5 overflow-y-auto">
      {accountCandidates.length > 0 && (
        <>
          <li className="px-2 pt-1 text-[12px] font-medium text-ds-text-3">
            De esta cuenta ({accountCandidates.length})
          </li>
          {accountCandidates.map((c) => (
            <CandidateRow key={c.id} candidate={c} muted={false} onPick={onPick} />
          ))}
        </>
      )}
      {tenantCandidates.length > 0 && (
        <>
          <li className="px-2 pt-2 text-[12px] font-medium text-ds-text-4">
            Resto del tenant ({tenantCandidates.length})
          </li>
          {tenantCandidates.map((c) => (
            <CandidateRow key={c.id} candidate={c} muted onPick={onPick} />
          ))}
        </>
      )}
      {accountCandidates.length === 0 && tenantCandidates.length === 0 && (
        <li className="px-2 py-1.5 text-[12px] text-ds-text-4">Sin resultados</li>
      )}
    </ul>
  );
}

function CandidateRow({
  candidate,
  muted,
  onPick,
}: {
  candidate: Candidate;
  muted: boolean;
  onPick: (c: Candidate) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(candidate)}
        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ds-tap hover:bg-ds-surface-2 ${
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
