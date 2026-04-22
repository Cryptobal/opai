"use client";

import { ExternalLink } from "lucide-react";
import { formatCustomFieldValue } from "@/lib/crm-custom-fields";

interface Props {
  type: string;
  value: unknown;
  options?: unknown;
  className?: string;
}

/**
 * Muestra el valor de un campo personalizado.
 * - URL: enlace clicable con etiqueta o URL
 * - Teléfono: enlace tel:
 * - Email: enlace mailto:
 * - Resto: texto plano
 */
export function CustomFieldValue({ type, value, options, className }: Props) {
  const formatted = formatCustomFieldValue(type, value, options);

  if (formatted.type === "url") {
    return (
      <a
        href={formatted.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-primary hover:underline ${className ?? ""}`}
      >
        {formatted.label}
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    );
  }

  if (formatted.type === "phone") {
    return (
      <a
        href={`tel:${formatted.value}`}
        className={`text-primary hover:underline ${className ?? ""}`}
      >
        {formatted.value}
      </a>
    );
  }

  if (formatted.type === "email") {
    return (
      <a
        href={`mailto:${formatted.value}`}
        className={`text-primary hover:underline ${className ?? ""}`}
      >
        {formatted.value}
      </a>
    );
  }

  return <span className={className}>{formatted.value}</span>;
}
