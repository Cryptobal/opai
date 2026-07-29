"use client";

import { useState, type ReactNode } from "react";
import { Copy, Globe, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { RecipientChip } from "./message-recipients";
import { parseSender } from "./correo-sender";
import { CorreoSenderAvatar } from "./CorreoSenderAvatar";
import { requestCorreoSearch } from "./correo-search-bus";
import { runCorreoAction } from "./correo-thread-action-client";

/** Dominios de correo personal: buscar por dominio no aporta señal comercial. */
const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.cl",
]);

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("No se pudo copiar");
  }
}

type Props = {
  chip: RecipientChip;
  threadId: string;
  inSpam: boolean;
  canModify: boolean;
  children: ReactNode;
};

export function CorreoRecipientPopover({
  chip,
  threadId,
  inSpam,
  canModify,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const email = chip.email || "";
  const sender = parseSender(chip.raw || chip.email);
  const name = chip.name || sender.name || email.split("@")[0] || chip.raw;
  const domain = email.includes("@") ? email.split("@")[1]?.toLowerCase() : "";
  const showDomainSearch = Boolean(domain) && !PERSONAL_DOMAINS.has(domain);
  const personOp = chip.label === "De" ? "from" : "to";
  const showSpam =
    chip.label === "De" && canModify && !inSpam && Boolean(threadId);
  const copyLabel =
    chip.label === "De"
      ? "Remitente"
      : chip.label === "Responder a"
        ? "Reply-To"
        : chip.label === "Para"
          ? "Destinatario"
          : "CC";

  function close() {
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 max-w-[min(18rem,calc(100vw-1.5rem))] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-ds-border-subtle px-3 py-3">
          <CorreoSenderAvatar fromEmail={email || chip.raw} compact />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ds-text-1">{name}</p>
            <p className="select-text break-all text-[12px] text-ds-text-3">
              {email || chip.raw}
            </p>
          </div>
        </div>
        <div className="py-1">
          <button
            type="button"
            onClick={() => {
              void copyText(email || chip.raw, copyLabel);
              close();
            }}
            className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
          >
            <Copy className="h-4 w-4 shrink-0 text-ds-text-3" />
            Copiar dirección
          </button>
          {email ? (
            <button
              type="button"
              onClick={() => {
                requestCorreoSearch({ token: `${personOp}:${email}` });
                close();
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
            >
              <Search className="h-4 w-4 shrink-0 text-ds-text-3" />
              Buscar correos de esta persona
            </button>
          ) : null}
          {showDomainSearch ? (
            <button
              type="button"
              onClick={() => {
                requestCorreoSearch({ token: `domain:${domain}` });
                close();
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
            >
              <Globe className="h-4 w-4 shrink-0 text-ds-text-3" />
              Buscar por dominio
            </button>
          ) : null}
          {showSpam ? (
            <button
              type="button"
              onClick={() => {
                void runCorreoAction(
                  threadId,
                  "spam",
                  "Marcado como spam",
                  undefined,
                  "unspam",
                );
                close();
              }}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-status-danger-fg ds-tap hover:bg-ds-surface-2 sm:min-h-9"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Marcar hilo como spam
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
