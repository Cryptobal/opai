"use client";

/**
 * Vista agregada de solo lectura del «Incluye» por instalación. La edición vive
 * en el tab de cada instalación (link directo).
 */

import { useEffect, useState } from "react";
import { Check, ListChecks } from "lucide-react";
import { Surface, Skeleton } from "@/components/opai-ds";
import type { BundleDetail } from "@/components/cpq/bundle/useBundle";

type IncludesByQuote = Record<string, string[]>;

export function IncluyeAgregadoSection({
  bundle,
  onOpenInstall,
}: {
  bundle: BundleDetail;
  onOpenInstall: (quoteId: string) => void;
}) {
  const [items, setItems] = useState<IncludesByQuote | null>(null);
  const quoteIdsKey = bundle.quotes.map((m) => m.quoteId).join(",");

  useEffect(() => {
    let cancelled = false;
    const quoteIds = quoteIdsKey ? quoteIdsKey.split(",") : [];
    if (quoteIds.length === 0) {
      setItems({});
      return;
    }
    void Promise.all(
      quoteIds.map(async (qid) => {
        try {
          const res = await fetch(`/api/cpq/quotes/${qid}/includes`);
          if (!res.ok) return [qid, [] as string[]] as const;
          const json = await res.json();
          const list = Array.isArray(json?.data) ? json.data : [];
          return [
            qid,
            list
              .filter((i: { showInPdf?: boolean }) => i.showInPdf !== false)
              .map((i: { text: string }) => i.text),
          ] as const;
        } catch {
          return [qid, [] as string[]] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setItems(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [quoteIdsKey]);

  return (
    <Surface elevation={1} padding="md" className="space-y-3" id="sec-incluye-bundle">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-ds-text-3" />
        <h2 className="font-display text-base text-foreground">Incluye</h2>
        <span className="text-[12px] text-ds-text-3">por instalación</span>
      </div>

      {items === null ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {bundle.quotes.map((m) => {
            const list = items[m.quoteId] ?? [];
            return (
              <div
                key={m.quoteId}
                className="rounded-lg border border-ds-border-subtle p-3"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] font-medium text-foreground">
                    {m.quote.installation?.name || m.quote.code}
                  </p>
                  <button
                    type="button"
                    className="shrink-0 text-[12px] text-primary hover:underline min-h-[32px]"
                    onClick={() => onOpenInstall(m.quoteId)}
                  >
                    Editar →
                  </button>
                </div>
                {list.length === 0 ? (
                  <p className="text-[12px] text-ds-text-3">Sin ítems incluidos.</p>
                ) : (
                  <ul className="space-y-1">
                    {list.map((text, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[13px] text-ds-text-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-ok-fg" />
                        <span className="min-w-0">{text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Surface>
  );
}
