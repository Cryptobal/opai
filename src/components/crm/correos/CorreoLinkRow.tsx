"use client";

import Link from "next/link";
import { Eye, EyeOff, X } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import {
  THREAD_LINK_TYPE_LABELS,
  type ResolvedThreadLink,
  type ThreadLinkEntityType,
} from "@/modules/crm/email/email-thread-links";

type Props = {
  link: ResolvedThreadLink;
  canEdit: boolean;
  onToggleVisibility: (linkId: string, visibleOnEntity: boolean) => void;
  onRemove: (linkId: string) => void;
};

function typeLabel(entityType: string): string {
  if (entityType in THREAD_LINK_TYPE_LABELS) {
    return THREAD_LINK_TYPE_LABELS[entityType as ThreadLinkEntityType];
  }
  return entityType;
}

/** Fila de vínculo: tipo, nombre, estado, badge origen, ojo y quitar. */
export function CorreoLinkRow({ link, canEdit, onToggleVisibility, onRemove }: Props) {
  const label = typeLabel(link.entityType);
  const showLink = Boolean(link.href) && !link.orphan;

  return (
    <li
      className={`flex items-center gap-2 rounded-lg px-1.5 py-1 ${
        link.orphan ? "bg-status-danger-soft" : ""
      }`}
    >
      <Tag variant={link.orphan ? "danger" : "neutral"} size="sm">
        {label}
      </Tag>
      {showLink ? (
        <Link
          href={link.href!}
          className="min-w-0 flex-1 truncate text-[13px] text-ds-text-2 underline-offset-2 hover:underline"
          title={link.label}
        >
          {link.label}
        </Link>
      ) : (
        <span
          className={`min-w-0 flex-1 truncate text-[13px] ${
            link.orphan ? "text-status-danger-fg" : "text-ds-text-2"
          }`}
          title={link.label}
        >
          {link.label}
        </span>
      )}
      {link.status && !link.orphan && (
        <Tag variant="info" size="sm">
          {link.status}
        </Tag>
      )}
      {link.linkedVia !== "manual" && (
        <Tag variant="brand" size="sm">
          {link.linkedVia === "ai" ? "IA" : "regla"}
        </Tag>
      )}
      {canEdit && !link.orphan && (
        <button
          type="button"
          aria-label={
            link.visibleOnEntity
              ? "Ocultar en la ficha de la entidad"
              : "Mostrar en la ficha de la entidad"
          }
          title={
            link.visibleOnEntity
              ? "Visible en la ficha de la entidad"
              : "Oculto en la ficha de la entidad"
          }
          onClick={() => onToggleVisibility(link.id, !link.visibleOnEntity)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 sm:h-8 sm:w-8"
        >
          {link.visibleOnEntity ? (
            <Eye className="h-3.5 w-3.5 text-status-ok-fg" />
          ) : (
            <EyeOff className="h-3.5 w-3.5 text-ds-text-4" />
          )}
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          aria-label={`Quitar vínculo ${link.label}`}
          onClick={() => onRemove(link.id)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ds-text-4 ds-tap hover:text-status-danger-fg sm:h-8 sm:w-8"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
