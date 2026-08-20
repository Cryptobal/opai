import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { getPermissionsFromAuth } from "@/lib/permissions-server";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { createStaffPersonaSchema } from "@/lib/validations/personas-equipo";
import { formatPersonName, normalizeRut } from "@/lib/personas";
import { splitPersonName, staffCargoFromAdminCargo, staffCargoLabel } from "@/lib/personas-staff";
import { loadStaffAssignmentByGuardia, staffRowFromPersona } from "@/lib/personas-staff-list";
import { canViewSensitiveSalary, maskSalaryAmount } from "@/lib/salary-privacy";
import { ensureUnifiedStaffFicha } from "@/lib/personas-staff-merge";

export const dynamic = "force-dynamic";

const PERSONA_LIST_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  rut: true,
  email: true,
  phone: true,
  cargoStaff: true,
  laborClass: true,
  status: true,
  salaryStructureId: true,
  adminId: true,
  updatedAt: true,
  salaryStructure: {
    select: { id: true, baseSalary: true, isActive: true },
  },
  admin: {
    select: { id: true, name: true, email: true, cargo: true },
  },
  guardia: {
    select: { id: true, isArticulo22: true },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const search = request.nextUrl.searchParams.get("search")?.trim() || undefined;
    const status = request.nextUrl.searchParams.get("status") || undefined;

    const personas = await prisma.opsPersona.findMany({
      where: {
        tenantId: ctx.tenantId,
        laborClass: "ADMINISTRATIVO",
        status: status ?? "active",
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { rut: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: PERSONA_LIST_SELECT,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const assignments = await loadStaffAssignmentByGuardia(
      ctx.tenantId,
      personas.map((p) => p.guardia?.id).filter((id): id is string => Boolean(id)),
    );
    const canSeeSensitive = canViewSensitiveSalary(await getPermissionsFromAuth(ctx));

    return NextResponse.json({
      data: personas.map((p) => {
        const personaSalary =
          p.salaryStructure?.isActive && p.salaryStructure.baseSalary != null
            ? Number(p.salaryStructure.baseSalary)
            : null;
        const display = staffRowFromPersona({
          cargoStaff: p.cargoStaff,
          personaBaseSalary:
            personaSalary != null && Number.isFinite(personaSalary) ? personaSalary : null,
          guardiaId: p.guardia?.id ?? null,
          assignments,
        });
        return {
          ...p,
          displayName: formatPersonName(p.firstName, p.lastName),
          cargoLabel: display.cargoLabel,
          salarySensitive: display.salarySensitive,
          baseSalary: maskSalaryAmount(display.baseSalary, {
            salarySensitive: display.salarySensitive,
            canViewSensitive: canSeeSensitive,
          }),
          personaId: p.id,
          guardiaId: p.guardia?.id ?? null,
        };
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[GET /api/personas/equipo]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = createStaffPersonaSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    let firstName = body.firstName?.trim() ?? "";
    let lastName = body.lastName?.trim() ?? "";
    let email = body.email ?? null;
    let phone = body.phone ?? null;
    let cargoStaff = body.cargoStaff ?? null;
    const adminId = body.adminId ?? null;
    const personaId = body.personaId ?? null;

    if (adminId) {
      const admin = await prisma.admin.findFirst({
        where: { id: adminId, tenantId: ctx.tenantId },
        select: { id: true, name: true, email: true, phone: true, cargo: true },
      });
      if (!admin) {
        return NextResponse.json({ error: "Usuario ERP no encontrado" }, { status: 404 });
      }
      if (!firstName && !lastName) {
        const split = splitPersonName(admin.name);
        firstName = split.firstName;
        lastName = split.lastName;
      }
      if (!email) email = admin.email;
      if (!phone) phone = admin.phone;
      if (!cargoStaff) cargoStaff = staffCargoFromAdminCargo(admin.cargo);
    }

    if (!firstName && !personaId && !adminId) {
      return NextResponse.json({ error: "Nombre es requerido" }, { status: 400 });
    }
    if (firstName && !lastName) lastName = firstName;

    const result = await ensureUnifiedStaffFicha({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      lookup: {
        personaId,
        adminId,
        rut: body.rut ? normalizeRut(body.rut) : null,
        email,
        firstName: firstName || null,
        lastName: lastName || null,
      },
      extras: {
        cargoStaff,
        phone,
        afp: body.afp ?? null,
        healthSystem: body.healthSystem ?? null,
        isapreName: body.isapreName ?? null,
        baseSalary: body.baseSalary,
        colacion: body.colacion,
        movilizacion: body.movilizacion,
        gratificationType: body.gratificationType,
        gratificationCustomAmount: body.gratificationCustomAmount,
      },
    });

    const created = await prisma.opsPersona.findFirstOrThrow({
      where: { id: result.personaId, tenantId: ctx.tenantId },
      select: PERSONA_LIST_SELECT,
    });

    await createOpsAuditLog(ctx, "create", "ops_persona_staff", created.id, {
      cargoStaff,
      adminId,
      reused: result.reused,
      mergedIds: result.mergedIds,
      guardiaId: result.guardiaId,
    });

    return NextResponse.json(
      {
        data: {
          ...created,
          id: created.id,
          personaId: created.id,
          guardiaId: result.guardiaId,
          displayName: formatPersonName(created.firstName, created.lastName),
          cargoLabel: staffCargoLabel(created.cargoStaff),
          baseSalary: created.salaryStructure ? Number(created.salaryStructure.baseSalary) : null,
        },
      },
      { status: result.reused ? 200 : 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[POST /api/personas/equipo]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
