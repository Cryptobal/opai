"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Surface, Tag } from "@/components/opai-ds";
import { recipientProgressKind, type SignerProgressKind } from "@/lib/docs/laborales/tracking-progress";

export type TrackingItem = {
  id: string;
  campaignId: string;
  guardiaId: string;
  status: string;
  error: string | null;
  documentId: string | null;
  snapshot: { name?: string; installationName?: string } | null;
  updatedAt: string;
  documentTitle: string | null;
  signingMode: string;
  recipients: Array<{ id: string; name: string; status: string; declineReason: string | null; signingOrder: number }>;
};

const KIND_LABEL: Record<SignerProgressKind, string> = {
  signed: "✓",
  declined: "✕",
  pending: "pendiente",
  waiting: "en espera",
};

export function TrackingItemsTable({
  items,
  onRemind,
}: {
  items: TrackingItem[];
  onRemind: (recipientId: string) => void;
}) {
  return (
    <Surface elevation={1} padding="none" className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="text-left text-ds-text-3">
          <tr>
            <th className="px-3 py-2">Guardia</th>
            <th className="px-3 py-2 hidden sm:table-cell">Documento</th>
            <th className="px-3 py-2">Instalación</th>
            <th className="px-3 py-2">Estado</th>
            <th className="px-3 py-2">Firmantes</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const snap = item.snapshot ?? {};
            const sequential = item.signingMode !== "parallel";
            return (
              <tr key={item.id} className="border-t border-ds-border-subtle">
                <td className="px-3 py-2">{snap.name ?? item.guardiaId}</td>
                <td className="px-3 py-2 hidden sm:table-cell text-ds-text-2">{item.documentTitle ?? "—"}</td>
                <td className="px-3 py-2">{snap.installationName ?? "—"}</td>
                <td className="px-3 py-2">
                  <Tag size="sm" variant={item.status === "sent" ? "ok" : item.status === "error" ? "danger" : "warn"}>
                    {item.status === "skipped" ? item.error ?? "No enviado" : item.status}
                  </Tag>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {item.recipients.map((r) => {
                      const kind = recipientProgressKind(r, item.recipients, sequential);
                      const declined = kind === "declined" && r.declineReason ? ` ${r.declineReason}` : "";
                      return (
                        <Tag key={r.id} size="sm" variant={kind === "signed" ? "ok" : kind === "declined" ? "danger" : "neutral"}>
                          {r.name} {KIND_LABEL[kind]}{declined}
                        </Tag>
                      );
                    })}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {item.status === "skipped" && (item.error ?? "").includes("sin contacto") ? (
                    <Button asChild variant="outline" className="min-h-11 sm:min-h-9" size="sm">
                      <Link href={`/personas/guardias/${item.guardiaId}`}>Registrar contacto</Link>
                    </Button>
                  ) : (
                    item.recipients
                      .filter((r) => recipientProgressKind(r, item.recipients, sequential) === "pending")
                      .map((r) => (
                        <Button key={r.id} variant="ghost" className="min-h-11 sm:min-h-9" size="sm" onClick={() => onRemind(r.id)}>
                          Recordar
                        </Button>
                      ))
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Surface>
  );
}
