import { parseSender } from "./correo-sender";

export type RecipientChip = {
  raw: string;
  name: string;
  email: string;
  label: "De" | "Responder a" | "Para" | "CC";
};

export function displayName(raw: string): string {
  const s = parseSender(raw);
  return s.name || s.email || raw;
}

export function buildRecipientChips(input: {
  fromEmail: string;
  replyToEmail?: string | null;
  toEmails: string[];
  ccEmails: string[];
}): RecipientChip[] {
  const from = parseSender(input.fromEmail);
  const chips: RecipientChip[] = [
    { raw: input.fromEmail, name: from.name, email: from.email, label: "De" },
  ];

  if (
    input.replyToEmail &&
    parseSender(input.replyToEmail).email !== from.email
  ) {
    const rt = parseSender(input.replyToEmail);
    chips.push({
      raw: input.replyToEmail,
      name: rt.name,
      email: rt.email,
      label: "Responder a",
    });
  }

  for (const addr of input.toEmails) {
    const s = parseSender(addr);
    chips.push({ raw: addr, name: s.name, email: s.email, label: "Para" });
  }
  for (const addr of input.ccEmails) {
    const s = parseSender(addr);
    chips.push({ raw: addr, name: s.name, email: s.email, label: "CC" });
  }
  return chips;
}

/** Resumen de una línea para móvil (cabecera colapsada). */
export function summarizeRecipients(input: {
  fromEmail: string;
  replyToEmail?: string | null;
  toEmails: string[];
  ccEmails: string[];
}): { from: string; line: string; extraCount: number } {
  const from = displayName(input.fromEmail);
  const toNames = input.toEmails.map(displayName);
  const ccCount = input.ccEmails.length;
  const hasReplyTo =
    Boolean(input.replyToEmail) &&
    parseSender(input.replyToEmail!).email !== parseSender(input.fromEmail).email;

  const parts: string[] = [];
  if (toNames.length === 1) parts.push(`Para ${toNames[0]}`);
  else if (toNames.length > 1) parts.push(`Para ${toNames[0]} +${toNames.length - 1}`);
  if (ccCount > 0) parts.push(`CC ${ccCount}`);
  if (hasReplyTo) parts.push("Reply-To");

  const visible = toNames.length + ccCount + (hasReplyTo ? 1 : 0);
  return {
    from,
    line: parts.join(" · "),
    extraCount: Math.max(0, visible - 1),
  };
}
