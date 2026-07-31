"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CorreoMessageDTO } from "@/modules/crm/email/correos.types";
import {
  buildRecipientChips,
  summarizeRecipients,
  type RecipientChip,
} from "./message-recipients";
import { CorreoRecipientPopover } from "./CorreoRecipientPopover";

type RecipientActions = {
  threadId: string;
  inSpam: boolean;
  canModify: boolean;
};

function RecipientChipPill({
  chip,
  threadId,
  inSpam,
  canModify,
}: { chip: RecipientChip } & RecipientActions) {
  const email = chip.email || chip.raw;
  return (
    <CorreoRecipientPopover
      chip={chip}
      threadId={threadId}
      inSpam={inSpam}
      canModify={canModify}
    >
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-[min(100%,220px)] items-center gap-1.5 rounded-full border border-ds-border-subtle bg-ds-surface-2 px-2.5 py-1 text-[12px] text-ds-text-2 ds-tap transition-colors hover:border-ds-border-default hover:bg-ds-surface-3"
      >
        <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
          {chip.label === "Responder a" ? "R-To" : chip.label}
        </span>
        <span className="min-w-0 truncate font-medium">
          {chip.name || email.split("@")[0] || email}
        </span>
      </button>
    </CorreoRecipientPopover>
  );
}

/** Cabecera De/Para/CC del mensaje abierto: una línea colapsada; chips al expandir. */
export function CorreoMessageRecipients({
  m,
  threadId,
  inSpam,
  canModify,
}: { m: CorreoMessageDTO } & RecipientActions) {
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeRecipients(m);
  const chips = buildRecipientChips(m);
  const canExpand = chips.length > 1;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={`flex w-full min-w-0 items-start gap-2 rounded-lg px-1 py-1 text-left ds-tap ${
          canExpand ? "hover:bg-ds-surface-2" : "cursor-default"
        }`}
      >
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
            <span className="shrink-0 text-[12px] font-medium uppercase tracking-wide text-ds-text-4">
              De
            </span>
            <span className="truncate font-medium text-ds-text-1">{summary.from}</span>
          </div>
          {summary.line ? (
            <p className="truncate text-[12px] text-ds-text-3">{summary.line}</p>
          ) : null}
        </div>
        {canExpand ? (
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ds-text-4">
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </span>
        ) : null}
      </button>

      {expanded ? (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {chips.map((chip) => (
            <RecipientChipPill
              key={`${chip.label}-${chip.email || chip.raw}`}
              chip={chip}
              threadId={threadId}
              inSpam={inSpam}
              canModify={canModify}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
