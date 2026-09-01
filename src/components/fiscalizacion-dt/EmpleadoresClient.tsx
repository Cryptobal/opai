"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalFrame } from "./PortalFrame";

type Item = { id: string; name: string; legalName: string; rut: string };

export function EmpleadoresClient({ version }: { version: string }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/fiscalizacion-dt/sesion")
      .then((r) => r.json())
      .then((json) => {
        if (!json.session) {
          router.replace("/fiscalizacion-dt");
          return;
        }
        setEmail(json.session.email);
      });
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/fiscalizacion-dt/empleadores?q=${encodeURIComponent(q)}`)
        .then(async (r) => {
          if (r.status === 401) {
            router.replace("/fiscalizacion-dt");
            return;
          }
          const json = await r.json();
          setItems(json.data ?? []);
        })
        .catch(() => setError("No se pudo cargar el listado"))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, router]);

  const grouped = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const letter = (item.legalName || item.name).charAt(0).toUpperCase() || "#";
      const list = map.get(letter) ?? [];
      list.push(item);
      map.set(letter, list);
    }
    return [...map.entries()];
  }, [items]);

  async function seleccionar(id: string) {
    setSelecting(id);
    setError(null);
    const res = await fetch(`/api/fiscalizacion-dt/empleadores/${id}/seleccionar`, { method: "POST" });
    const json = await res.json();
    setSelecting(null);
    if (!res.ok) {
      setError(json.error || "No se pudo seleccionar el empleador");
      return;
    }
    router.push(`/fiscalizacion-dt/${id}/reportes`);
  }

  return (
    <PortalFrame version={version} email={email}>
      <div className="space-y-6 ds-page-enter">
        <h1 className="font-display text-xl font-semibold">Selección de empleador</h1>
        <section className="rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
          <label htmlFor="buscar" className="text-[13px]">
            Buscar por nombre o RUT
          </label>
          <input
            id="buscar"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-ds-border-default bg-ds-surface-1 px-3 text-[13px]"
            placeholder="Razón social o RUT (con o sin puntos)"
          />
        </section>
        <section className="rounded-xl border border-ds-border-default bg-ds-surface-2 p-4">
          <h2 className="mb-3 text-[13px] font-medium">Empleadores usuarios</h2>
          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? <p className="text-[13px] text-ds-text-3">Cargando…</p> : null}
            {!loading && items.length === 0 ? (
              <p className="text-[13px] text-ds-text-3">No hay empleadores que coincidan.</p>
            ) : null}
            <ul className="ds-list-cascade space-y-4">
              {grouped.map(([letter, list]) => (
                <li key={letter}>
                  <p className="mb-1 text-[12px] font-semibold text-ds-text-3">{letter}</p>
                  <ul className="space-y-1">
                    {list.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={selecting === item.id}
                          onClick={() => seleccionar(item.id)}
                          className="ds-tap flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-[13px] hover:bg-ds-surface-3"
                        >
                          <span>{item.legalName}</span>
                          <span className="font-mono text-[12px] text-ds-text-3">{item.rut}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {error ? <p className="text-[13px] text-status-danger-fg">{error}</p> : null}
      </div>
    </PortalFrame>
  );
}
