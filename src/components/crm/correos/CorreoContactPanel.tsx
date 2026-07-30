"use client";

/**
 * Ficha del contacto principal del hilo: cargo, teléfono, empresa,
 * deals abiertos y últimas conversaciones. Lee de CorreoWorkContext.
 */

import Link from "next/link";
import { Briefcase, Building2, Mail, Phone } from "lucide-react";
import { Spinner, Tag } from "@/components/opai-ds";
import { useCorreoWork } from "./CorreoWorkContext";

export function CorreoContactPanel({ threadId: _threadId }: { threadId: string }) {
  const { contactContext } = useCorreoWork();

  if (contactContext.loading && !contactContext.data) {
    return <Spinner className="mx-auto" />;
  }

  const contact = contactContext.data?.contact;
  if (!contact) {
    return (
      <p className="text-[12px] text-ds-text-4">
        Sin contacto principal. Agregá contactos abajo o asociá una cuenta.
      </p>
    );
  }

  const openDeals = contactContext.data?.openDeals ?? [];
  const recentThreads = contactContext.data?.recentThreads ?? [];

  return (
    <div className="space-y-2" aria-label={`Contacto ${contact.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/crm/contacts/${contact.id}`}
          className="text-ds-body font-semibold text-ds-text-1 underline-offset-2 hover:underline"
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
          <a
            href={`tel:${contact.phone}`}
            className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
          >
            <Phone className="h-3.5 w-3.5" /> {contact.phone}
          </a>
        )}
        {contact.email && (
          <span className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5" /> {contact.email}
          </span>
        )}
      </div>
      {openDeals.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {openDeals.map((deal) => (
            <Link key={deal.id} href={`/crm/deals/${deal.id}`}>
              <Tag variant="info" size="sm">
                {deal.title}
              </Tag>
            </Link>
          ))}
        </div>
      )}
      {recentThreads.length > 0 && (
        <div className="space-y-1">
          <p className="text-[12px] font-medium text-ds-text-3">Últimas conversaciones</p>
          <ul className="space-y-0.5">
            {recentThreads.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/crm/correos?thread=${t.id}`}
                  className="block truncate text-ds-body text-ds-text-2 underline-offset-2 hover:underline"
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
    </div>
  );
}
