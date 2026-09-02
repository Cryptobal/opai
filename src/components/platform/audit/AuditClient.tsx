"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Avatar, PageHero, PageToolbar, Tag } from "@/components/opai-ds";
import { Input } from "@/components/ui/input";
import { PlatformError } from "../PlatformError";
import { platformJson } from "../platform-fetch";
import { formatClDateTime } from "../format";
import { AUDIT_FAMILIES, AUDIT_FAMILY_LABEL, type AuditFamily } from "@/lib/platform/audit-family";

interface AuditEvent {
  id: string;
  createdAt: string;
  action: string;
  family: AuditFamily;
  familyLabel: string;
  familyVariant: "info" | "warn" | "ok" | "danger" | "brand" | "neutral";
  actorType: string;
  actorEmail: string | null;
  tenantId: string | null;
  before: unknown;
  after: unknown;
}

interface Actor {
  type: string;
  email: string;
  name: string;
}

export function AuditClient() {
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [family, setFamily] = useState("");
  const [range, setRange] = useState("30");
  const [tenantId, setTenantId] = useState("");
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [actors, setActors] = useState<Actor[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (append = false, next?: string | null) => {
      setError(null);
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (actor) p.set("actor", actor);
      if (family) p.set("family", family);
      if (tenantId) p.set("tenantId", tenantId);
      if (range) p.set("range", range);
      if (next) p.set("cursor", next);
      try {
        const json = await platformJson<{
          events: AuditEvent[];
          nextCursor: string | null;
          actors: Actor[];
          tenants: { id: string; name: string }[];
        }>(`/api/platform/audit?${p.toString()}`);
        setEvents((prev) => (append ? [...prev, ...json.events] : json.events));
        setCursor(json.nextCursor);
        setActors(json.actors);
        setTenants(json.tenants);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      }
    },
    [q, actor, family, tenantId, range],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="space-y-6 min-w-0">
      <PageHero icon={<ScrollText />} iconTone="teal" title="Auditoría" subtitle="Trazas de plataforma" />
      <PageToolbar
        search={
          <Input
            className="h-10 sm:h-9 w-full sm:w-72"
            placeholder="Buscar acción"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              <button type="button" className={`rounded-full px-3 py-1 text-[13px] ${!actor ? "bg-ds-surface-2" : ""}`} onClick={() => setActor("")}>
                Todos
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-[13px] ${actor === "system" ? "bg-ds-surface-2" : ""}`}
                onClick={() => setActor("system")}
              >
                Sistema
              </button>
              {actors.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[13px] ${actor === a.email ? "bg-ds-surface-2" : ""}`}
                  onClick={() => setActor(a.email)}
                >
                  <Avatar name={a.name} size="sm" />
                  {a.name}
                </button>
              ))}
            </div>
            <select className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]" value={family} onChange={(e) => setFamily(e.target.value)}>
              <option value="">Todas las acciones</option>
              {AUDIT_FAMILIES.map((f) => (
                <option key={f} value={f}>{AUDIT_FAMILY_LABEL[f]}</option>
              ))}
            </select>
            <select className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Todos los tenants</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select className="h-10 sm:h-9 rounded-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px]" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="7">Últimos 7 días</option>
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
            </select>
          </div>
        }
      />
      {error ? <PlatformError message={error} onRetry={() => void load()} /> : null}
      <ul className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="rounded-xl border border-ds-border-subtle bg-ds-surface-1">
            <button
              type="button"
              className="flex w-full min-h-11 items-center justify-between gap-3 px-3 py-2 text-left"
              onClick={() => setOpen(open === e.id ? null : e.id)}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px]">{e.action}</span>
                <span className="font-mono text-[12px] text-ds-text-3">
                  {e.actorEmail ?? "Sistema"} · {formatClDateTime(e.createdAt)}
                </span>
              </span>
              <Tag size="sm" variant={e.familyVariant}>{e.familyLabel}</Tag>
            </button>
            {open === e.id ? (
              <div className="grid gap-3 border-t border-ds-border-subtle p-3 md:grid-cols-2">
                <pre className="overflow-auto rounded-lg bg-ds-surface-2 p-3 font-mono text-[12px]">{JSON.stringify(e.before, null, 2)}</pre>
                <pre className="overflow-auto rounded-lg bg-ds-surface-2 p-3 font-mono text-[12px]">{JSON.stringify(e.after, null, 2)}</pre>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {cursor ? (
        <button type="button" className="h-10 rounded-md px-3 text-[13px] text-primary" onClick={() => void load(true, cursor)}>
          Cargar más
        </button>
      ) : null}
    </div>
  );
}
