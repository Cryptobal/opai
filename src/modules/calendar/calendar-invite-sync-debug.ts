/**
 * Metadatos de diagnóstico para push OPAI → Google (Brief C / Bloque 0).
 * Cuenta y hashea; nunca escribe correos en claro.
 */
import { createHash } from "crypto";

export type InviteSyncDebugPayload = {
  eventId: string;
  participantsCount: number;
  internalIdsCount: number;
  internalIdsResolvedCount: number;
  attendeeEmailsCount: number;
  externalEmailsCount: number;
  sendUpdates: "all" | "none";
  /** Dominios de attendees enviados (sin local-part). */
  attendeeDomains: string[];
  /** SHA-256 truncado (12 hex) de cada correo enviado. */
  attendeeEmailHashes: string[];
  googleEventId: string | null;
  googleStatus: string | null;
  googleAttendeesReturned: number;
};

export function hashEmailForAudit(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

export function emailDomainForAudit(email: string): string {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  return at >= 0 ? email.trim().toLowerCase().slice(at + 1) : "(invalid)";
}

export function buildInviteSyncDebugPayload(input: {
  eventId: string;
  participantsCount: number;
  internalIdsCount: number;
  internalIdsResolvedCount: number;
  attendeeEmails: string[];
  externalEmailsCount: number;
  sendUpdates: "all" | "none";
  googleEventId?: string | null;
  googleStatus?: string | null;
  googleAttendeesReturned?: number;
}): InviteSyncDebugPayload {
  const unique = Array.from(
    new Set(input.attendeeEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  );
  return {
    eventId: input.eventId,
    participantsCount: input.participantsCount,
    internalIdsCount: input.internalIdsCount,
    internalIdsResolvedCount: input.internalIdsResolvedCount,
    attendeeEmailsCount: unique.length,
    externalEmailsCount: input.externalEmailsCount,
    sendUpdates: input.sendUpdates,
    attendeeDomains: Array.from(new Set(unique.map(emailDomainForAudit))).sort(),
    attendeeEmailHashes: unique.map(hashEmailForAudit).sort(),
    googleEventId: input.googleEventId ?? null,
    googleStatus: input.googleStatus ?? null,
    googleAttendeesReturned: input.googleAttendeesReturned ?? 0,
  };
}
