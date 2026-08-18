"use client";

import {
  MoreVertical,
  Mailbox,
  Save,
  Trash2,
  Loader2,
  FileDown,
  MessageCircle,
  Phone,
  Mail,
  Handshake,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type LeadContactChannel = "whatsapp" | "phone" | "email" | "in_person";

/**
 * LeadOverflowMenu — menú «⋮» con acciones secundarias del lead.
 */
export interface LeadOverflowMenuProps {
  isEditable: boolean;
  canSendPresentation: boolean;
  savingLead: boolean;
  downloadingPresentation?: boolean;
  onSendPresentation: () => void;
  onDownloadPresentation?: () => void;
  onSaveDraft: () => void;
  onDelete: () => void;
  /** Marcar primer contacto (canales fuera de la grilla rápida). */
  onMarkContacted?: (ch: LeadContactChannel) => void;
  firstContactAt?: string | Date | null;
  firstContactChannel?: string | null;
  markingContact?: boolean;
  onOpenChat?: () => void;
}

const CONTACT_CHANNEL_ITEMS: {
  ch: LeadContactChannel;
  label: string;
  icon: typeof MessageCircle;
}[] = [
  { ch: "whatsapp", label: "Por WhatsApp", icon: MessageCircle },
  { ch: "phone", label: "Por llamada", icon: Phone },
  { ch: "email", label: "Por email", icon: Mail },
  { ch: "in_person", label: "En persona", icon: Handshake },
];

const CHANNEL_SHORT: Record<string, string> = {
  whatsapp: "WhatsApp",
  phone: "llamada",
  email: "email",
  in_person: "en persona",
};

export function LeadOverflowMenu({
  isEditable,
  canSendPresentation,
  savingLead,
  downloadingPresentation = false,
  onSendPresentation,
  onDownloadPresentation,
  onSaveDraft,
  onDelete,
  onMarkContacted,
  firstContactAt,
  firstContactChannel,
  markingContact = false,
  onOpenChat,
}: LeadOverflowMenuProps) {
  const alreadyContacted = Boolean(firstContactAt);
  const contactedLabel = alreadyContacted
    ? `Contactado · ${CHANNEL_SHORT[firstContactChannel || ""] || firstContactChannel || "—"}`
    : "Marcar contactado";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Más acciones">
          <MoreVertical className="h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {onOpenChat ? (
          <DropdownMenuItem onSelect={onOpenChat}>
            <MessageCircle className="mr-2 h-4 w-4" aria-hidden />
            Abrir chat
          </DropdownMenuItem>
        ) : null}
        {onMarkContacted ? (
          alreadyContacted ? (
            <DropdownMenuItem disabled className="opacity-80">
              <CheckCircle2 className="mr-2 h-4 w-4 text-status-ok-fg" aria-hidden />
              {contactedLabel}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={markingContact}>
                {markingContact ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <UserCheck className="mr-2 h-4 w-4" aria-hidden />
                )}
                {contactedLabel}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {CONTACT_CHANNEL_ITEMS.map(({ ch, label, icon: Icon }) => (
                  <DropdownMenuItem
                    key={ch}
                    disabled={markingContact}
                    onSelect={() => onMarkContacted(ch)}
                  >
                    <Icon className="mr-2 h-4 w-4" aria-hidden />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )
        ) : null}
        {(onOpenChat || onMarkContacted) && (isEditable || onDownloadPresentation) ? (
          <DropdownMenuSeparator />
        ) : null}
        {isEditable && (
          <DropdownMenuItem onSelect={onSendPresentation} disabled={!canSendPresentation}>
            <Mailbox className="mr-2 h-4 w-4" aria-hidden />
            Enviar presentación
          </DropdownMenuItem>
        )}
        {onDownloadPresentation ? (
          <DropdownMenuItem
            onSelect={onDownloadPresentation}
            disabled={downloadingPresentation}
          >
            {downloadingPresentation ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <FileDown className="mr-2 h-4 w-4" aria-hidden />
            )}
            Descargar / compartir PDF
          </DropdownMenuItem>
        ) : null}
        {isEditable && (
          <DropdownMenuItem onSelect={onSaveDraft} disabled={savingLead}>
            {savingLead ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Save className="mr-2 h-4 w-4" aria-hidden />}
            Guardar en revisión
          </DropdownMenuItem>
        )}
        {(onOpenChat || onMarkContacted || isEditable || onDownloadPresentation) ? (
          <DropdownMenuSeparator />
        ) : null}
        <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          Eliminar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
