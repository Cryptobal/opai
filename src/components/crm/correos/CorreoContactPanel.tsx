"use client";

/**
 * Panel de contacto del lector (P11, PR-14): ficha del contacto asociado
 * (cargo, teléfono, empresa, deals abiertos) + últimas 5 conversaciones de
 * ese contacto con deep-link (?thread=). Navegable por teclado (links y
 * botones nativos). Se oculta si el hilo no tiene contacto asociado.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Building2, Contact, Mail, Phone } from "lucide-react";
import { Tag } from "@/components/opai-ds";

type ContactContext = {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    roleTitle: string | null;
    accountId: string | null;
    accountName: string | null;
  } | null;
  openDeals?: Array<{ id: string; title: string }>;
  recentThreads?: Array<{ id: string; subject: string; lastMessageAt: string | null }>;
};

export function CorreoContactPanel({ threadId }: { threadId: string }) {
  const [data, setData] = useState<ContactContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/correos/${threadId}/contact-context`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  if (!data?.contact) return null;
  const { contact } = data;

  return (
    <section
      aria-label={`Contacto ${contact.name}`}
      className="space-y-2 rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-3"
    >
      <div className="flex items-center gap-2">
        <Contact className="h-4 w-4 text-tint-violet-fg" />
        <Link
          href={`/crm/contacts/${contact.id}`}
          className="text-[13px] font-semibold text-ds-text-1 underline-offset-2 hover:underline"
        >
          {contact.name}
        </Link>
        {contact.roleTitle && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-3">
            <Briefcase className="h-3.5 w-3.5" /> {contact.roleTitle}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ds-text-3">
        {contact.accountName && contact.accountId && (
          <Link
            href={`/crm/accounts/${contact.accountId}`}
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <Building2 className="h-3.5 w-3.5" /> {contact.accountName}
          </Link>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
            <Phone className="h-3.5 w-3.5" /> {contact.phone}
          </a>
        )}
        {contact.email && (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" /> {contact.email}
          </span>
        )}
      </div>
      {(data.openDeals?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {data.openDeals!.map((deal) => (
            <Link key={deal.id} href={`/crm/deals/${deal.id}`}>
              <Tag variant="info" size="sm">{deal.title}</Tag>
            </Link>
          ))}
        </div>
      )}
      {(data.recentThreads?.length ?? 0) > 0 && (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-ds-text-3">Últimas conversaciones</p>
          <ul className="space-y-0.5">
            {data.recentThreads!.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/crm/correos?thread=${t.id}`}
                  className="block truncate text-[13px] text-ds-text-2 underline-offset-2 hover:underline"
                >
                  {t.subject || "(sin asunto)"}
                  {t.lastMessageAt && (
                    <span className="ml-1.5 text-[12px] text-ds-text-4">
                      {new Date(t.lastMessageAt).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
