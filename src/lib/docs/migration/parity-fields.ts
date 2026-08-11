import { prisma } from "@/lib/prisma";
import {
  LEGACY_OPERACIONAL,
  LEGACY_PERSONA,
  type ParityMismatch,
} from "@/lib/docs/migration/types";

function sameDate(
  a: Date | null | undefined,
  b: Date | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.getTime() === b.getTime();
}

type Vigencia = {
  expiresAt: Date | null;
  issuedAt: Date | null;
  status: string | null;
  lastExpiryMilestone: number | null;
  renewalInProgressUntil: Date | null;
  expiryDismissedAt: Date | null;
  portalVisible: boolean;
};

function fieldsMatch(a: Vigencia, b: Vigencia): boolean {
  return (
    sameDate(a.expiresAt, b.expiresAt) &&
    sameDate(a.issuedAt, b.issuedAt) &&
    a.status === b.status &&
    a.lastExpiryMilestone === b.lastExpiryMilestone &&
    sameDate(a.renewalInProgressUntil, b.renewalInProgressUntil) &&
    sameDate(a.expiryDismissedAt, b.expiryDismissedAt) &&
    a.portalVisible === b.portalVisible
  );
}

export async function checkPersonaFields(
  tenantId: string,
  mismatches: ParityMismatch[]
): Promise<void> {
  const rows = await prisma.opsDocumentoPersona.findMany({
    where: { tenantId },
    select: {
      id: true,
      expiresAt: true,
      issuedAt: true,
      status: true,
      lastExpiryMilestone: true,
      renewalInProgressUntil: true,
      expiryDismissedAt: true,
      portalVisible: true,
    },
  });
  for (const row of rows) {
    const doc = await prisma.documento.findFirst({
      where: { tenantId, legacySource: LEGACY_PERSONA, legacyId: row.id },
      select: {
        expiresAt: true,
        issuedAt: true,
        status: true,
        lastExpiryMilestone: true,
        renewalInProgressUntil: true,
        expiryDismissedAt: true,
        portalVisible: true,
      },
    });
    if (!doc) {
      mismatches.push({ kind: "missing_persona", detail: row.id, sampleIds: [row.id] });
      continue;
    }
    if (!fieldsMatch(row, doc)) {
      mismatches.push({ kind: "field_persona", detail: row.id, sampleIds: [row.id] });
    }
  }
}

export async function checkOperacionalFields(
  tenantId: string,
  mismatches: ParityMismatch[]
): Promise<void> {
  const rows = await prisma.docOperacional.findMany({
    where: { tenantId },
    select: {
      id: true,
      expiresAt: true,
      issuedAt: true,
      status: true,
      lastExpiryMilestone: true,
      renewalInProgressUntil: true,
      expiryDismissedAt: true,
      portalClienteVisible: true,
    },
  });
  for (const row of rows) {
    const doc = await prisma.documento.findFirst({
      where: { tenantId, legacySource: LEGACY_OPERACIONAL, legacyId: row.id },
      select: {
        expiresAt: true,
        issuedAt: true,
        status: true,
        lastExpiryMilestone: true,
        renewalInProgressUntil: true,
        expiryDismissedAt: true,
        portalVisible: true,
      },
    });
    if (!doc) {
      mismatches.push({
        kind: "missing_operacional",
        detail: row.id,
        sampleIds: [row.id],
      });
      continue;
    }
    if (
      !fieldsMatch(
        { ...row, portalVisible: row.portalClienteVisible },
        doc
      )
    ) {
      mismatches.push({
        kind: "field_operacional",
        detail: row.id,
        sampleIds: [row.id],
      });
    }
  }
}
