/**
 * Una ficha laboral: reusa persona/guardia existente y fusiona staff huérfano.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeRut } from "@/lib/personas";
import {
  decideStaffMerge,
  fichaMatchesLookup,
  rutKey,
  type FichaLookup,
  type FichaRow,
} from "@/lib/personas-staff-ficha";

export type EnsureStaffFichaInput = {
  tenantId: string;
  userId: string;
  lookup: FichaLookup;
  extras?: {
    cargoStaff?: string | null;
    phone?: string | null;
    afp?: string | null;
    healthSystem?: string | null;
    isapreName?: string | null;
    baseSalary?: number;
    colacion?: number;
    movilizacion?: number;
    gratificationType?: "AUTO_25" | "CUSTOM";
    gratificationCustomAmount?: number | null;
  };
};

export type EnsureStaffFichaResult = {
  personaId: string;
  guardiaId: string;
  reused: boolean;
  mergedIds: string[];
};

const FICHA_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  rut: true,
  email: true,
  phone: true,
  adminId: true,
  laborClass: true,
  salaryStructureId: true,
  afp: true,
  healthSystem: true,
  isapreName: true,
  cargoStaff: true,
  guardia: { select: { id: true, isArticulo22: true } },
} as const;

function buildNextGuardiaCode(lastCode?: string | null): string {
  if (!lastCode) return "G-000001";
  const match = /^G-(\d{6})$/.exec(lastCode);
  const next = (match ? Number(match[1]) : 0) + 1;
  return `G-${String(next).padStart(6, "0")}`;
}

async function generateUniqueGuardiaCode(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ code: string | null }>>`
    SELECT code
    FROM ops.guardias
    WHERE tenant_id = ${tenantId}
      AND code ~ '^G-[0-9]{6}$'
    ORDER BY code DESC
    LIMIT 1
  `;
  return buildNextGuardiaCode(rows[0]?.code ?? null);
}

function toRow(p: {
  id: string;
  firstName: string;
  lastName: string;
  rut: string | null;
  email: string | null;
  adminId: string | null;
  laborClass: string;
  salaryStructureId: string | null;
  guardia: { id: string } | null;
}): FichaRow {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    rut: p.rut,
    email: p.email,
    adminId: p.adminId,
    laborClass: p.laborClass,
    salaryStructureId: p.salaryStructureId,
    guardia: p.guardia ? { id: p.guardia.id } : null,
  };
}

async function loadCandidates(
  tx: Prisma.TransactionClient,
  tenantId: string,
  lookup: FichaLookup,
) {
  const or: Prisma.OpsPersonaWhereInput[] = [];
  if (lookup.personaId) or.push({ id: lookup.personaId });
  if (lookup.adminId) or.push({ adminId: lookup.adminId });
  if (lookup.email) {
    or.push({ email: { equals: lookup.email, mode: "insensitive" } });
  }
  if (lookup.rut) {
    or.push({ rut: { equals: lookup.rut, mode: "insensitive" } });
    const digits = rutKey(lookup.rut);
    if (digits && digits.length >= 6) {
      or.push({ rut: { contains: digits.slice(0, -1) } });
    }
  }
  if (lookup.lastName?.trim()) {
    or.push({ lastName: { equals: lookup.lastName.trim(), mode: "insensitive" } });
  }
  if (or.length === 0) return [];

  return tx.opsPersona.findMany({
    where: { tenantId, OR: or },
    select: FICHA_SELECT,
  });
}

async function ensureSalary(
  tx: Prisma.TransactionClient,
  args: {
    tenantId: string;
    userId: string;
    personaId: string;
    currentSalaryId: string | null;
    orphanSalaryId: string | null;
    extras?: EnsureStaffFichaInput["extras"];
  },
): Promise<string | null> {
  if (args.currentSalaryId) return args.currentSalaryId;
  if (args.orphanSalaryId) {
    await tx.payrollSalaryStructure.update({
      where: { id: args.orphanSalaryId },
      data: { sourceType: "PERSONA", sourceId: args.personaId },
    });
    return args.orphanSalaryId;
  }
  if (args.extras?.baseSalary && args.extras.baseSalary > 0) {
    const structure = await tx.payrollSalaryStructure.create({
      data: {
        tenantId: args.tenantId,
        sourceType: "PERSONA",
        sourceId: args.personaId,
        baseSalary: args.extras.baseSalary,
        colacion: args.extras.colacion ?? 0,
        movilizacion: args.extras.movilizacion ?? 0,
        gratificationType: args.extras.gratificationType ?? "AUTO_25",
        gratificationCustomAmount: args.extras.gratificationCustomAmount ?? null,
        isActive: true,
        createdBy: args.userId,
      },
    });
    return structure.id;
  }
  return null;
}

async function ensureGuardia(
  tx: Prisma.TransactionClient,
  tenantId: string,
  personaId: string,
  existingId: string | null,
  userId: string,
): Promise<string> {
  if (existingId) {
    await tx.opsGuardia.update({
      where: { id: existingId },
      data: { isArticulo22: true },
    });
    return existingId;
  }
  const code = await generateUniqueGuardiaCode(tx, tenantId);
  const created = await tx.opsGuardia.create({
    data: {
      tenantId,
      personaId,
      code,
      lifecycleStatus: "contratado",
      status: "active",
      hiredAt: new Date(),
      isArticulo22: true,
    },
  });
  await tx.opsGuardiaHistory.create({
    data: {
      tenantId,
      guardiaId: created.id,
      eventType: "created",
      newValue: { lifecycleStatus: "contratado", laborClass: "ADMINISTRATIVO", isArticulo22: true },
      createdBy: userId,
    },
  });
  return created.id;
}

export async function ensureUnifiedStaffFicha(
  input: EnsureStaffFichaInput,
): Promise<EnsureStaffFichaResult> {
  let lookup: FichaLookup = {
    ...input.lookup,
    rut: input.lookup.rut ? normalizeRut(input.lookup.rut) : input.lookup.rut,
    email: input.lookup.email?.trim() || null,
  };

  return prisma.$transaction(async (tx) => {
    if (lookup.personaId) {
      const seed = await tx.opsPersona.findFirst({
        where: { id: lookup.personaId, tenantId: input.tenantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rut: true,
          email: true,
          adminId: true,
        },
      });
      if (seed) {
        lookup = {
          ...lookup,
          adminId: lookup.adminId ?? seed.adminId,
          rut: lookup.rut ?? seed.rut,
          email: lookup.email ?? seed.email,
          firstName: lookup.firstName ?? seed.firstName,
          lastName: lookup.lastName ?? seed.lastName,
        };
      }
    }

    const loaded = await loadCandidates(tx, input.tenantId, lookup);
    const matches = loaded.filter((p) => fichaMatchesLookup(toRow(p), lookup));
    const decision = decideStaffMerge(matches.map(toRow));

    if (!decision) {
      const firstName = lookup.firstName?.trim() || "";
      const lastName = lookup.lastName?.trim() || firstName;
      if (!firstName) {
        throw new Error("Nombre es requerido");
      }
      const persona = await tx.opsPersona.create({
        data: {
          tenantId: input.tenantId,
          firstName,
          lastName,
          rut: lookup.rut ?? null,
          email: lookup.email ?? null,
          phone: input.extras?.phone ?? null,
          cargoStaff: input.extras?.cargoStaff ?? null,
          laborClass: "ADMINISTRATIVO",
          status: "active",
          adminId: lookup.adminId ?? null,
          afp: input.extras?.afp ?? null,
          healthSystem: input.extras?.healthSystem ?? null,
          isapreName: input.extras?.isapreName ?? null,
        },
      });
      const salaryId = await ensureSalary(tx, {
        tenantId: input.tenantId,
        userId: input.userId,
        personaId: persona.id,
        currentSalaryId: null,
        orphanSalaryId: null,
        extras: input.extras,
      });
      if (salaryId) {
        await tx.opsPersona.update({
          where: { id: persona.id },
          data: { salaryStructureId: salaryId },
        });
      }
      const guardiaId = await ensureGuardia(tx, input.tenantId, persona.id, null, input.userId);
      return { personaId: persona.id, guardiaId, reused: false, mergedIds: [] };
    }

    const keepLoaded = loaded.find((p) => p.id === decision.keep.id)!;
    const orphanLoaded = decision.orphans
      .map((o) => loaded.find((p) => p.id === o.id))
      .filter((p): p is (typeof loaded)[number] => !!p);
    const closeable = orphanLoaded.filter((o) => !o.guardia);

    const idsWithAdmin = [keepLoaded, ...orphanLoaded]
      .filter((p) => p.adminId)
      .map((p) => p.id);
    if (idsWithAdmin.length > 0) {
      await tx.opsPersona.updateMany({
        where: { tenantId: input.tenantId, id: { in: idsWithAdmin } },
        data: { adminId: null },
      });
    }

    const donor = closeable.find((o) => o.salaryStructureId);
    const salaryId = await ensureSalary(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      personaId: keepLoaded.id,
      currentSalaryId: keepLoaded.salaryStructureId,
      orphanSalaryId: donor && donor.id !== keepLoaded.id ? donor.salaryStructureId : null,
      extras: input.extras,
    });

    if (donor && salaryId === donor.salaryStructureId) {
      await tx.opsPersona.update({
        where: { id: donor.id },
        data: { salaryStructureId: null },
      });
    }

    await tx.opsPersona.update({
      where: { id: keepLoaded.id },
      data: {
        laborClass: "ADMINISTRATIVO",
        adminId: lookup.adminId ?? keepLoaded.adminId,
        salaryStructureId: salaryId ?? keepLoaded.salaryStructureId,
        email: keepLoaded.email ?? lookup.email ?? null,
        rut: keepLoaded.rut ?? lookup.rut ?? null,
        phone: keepLoaded.phone ?? input.extras?.phone ?? null,
        afp: keepLoaded.afp ?? input.extras?.afp ?? null,
        healthSystem: keepLoaded.healthSystem ?? input.extras?.healthSystem ?? null,
        isapreName: keepLoaded.isapreName ?? input.extras?.isapreName ?? null,
        cargoStaff: keepLoaded.cargoStaff ?? input.extras?.cargoStaff ?? null,
        status: "active",
      },
    });

    for (const orphan of closeable) {
      await tx.opsPersona.update({
        where: { id: orphan.id },
        data: {
          status: "inactive",
          adminId: null,
        },
      });
    }

    const guardiaId = await ensureGuardia(
      tx,
      input.tenantId,
      keepLoaded.id,
      keepLoaded.guardia?.id ?? null,
      input.userId,
    );

    return {
      personaId: keepLoaded.id,
      guardiaId,
      reused: true,
      mergedIds: closeable.map((o) => o.id),
    };
  });
}
