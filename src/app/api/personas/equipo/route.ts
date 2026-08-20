import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { createStaffPersonaSchema } from "@/lib/validations/personas-equipo";
import { formatPersonName, normalizeRut } from "@/lib/personas";
import {
  splitPersonName,
  staffCargoFromAdminCargo,
  staffCargoLabel,
} from "@/lib/personas-staff";
import { cleanRut } from "@/lib/chile-rut";

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
} as const;

function rutKey(rut: string | null | undefined): string | null {
  if (!rut) return null;
  const k = cleanRut(rut);
  return k.length >= 2 ? k : null;
}

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
        ...(status ? { status } : {}),
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

    return NextResponse.json({
      data: personas.map((p) => ({
        ...p,
        displayName: formatPersonName(p.firstName, p.lastName),
        cargoLabel: staffCargoLabel(p.cargoStaff),
        baseSalary: p.salaryStructure ? Number(p.salaryStructure.baseSalary) : null,
      })),
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

    if (adminId) {
      const admin = await prisma.admin.findFirst({
        where: { id: adminId, tenantId: ctx.tenantId },
        select: { id: true, name: true, email: true, phone: true, cargo: true, persona: { select: { id: true } } },
      });
      if (!admin) {
        return NextResponse.json({ error: "Usuario ERP no encontrado" }, { status: 404 });
      }
      if (admin.persona) {
        return NextResponse.json(
          { error: "Este usuario ya tiene ficha en Personas", personaId: admin.persona.id },
          { status: 409 },
        );
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

    if (!firstName) {
      return NextResponse.json({ error: "Nombre es requerido" }, { status: 400 });
    }
    if (!lastName) lastName = firstName;

    const rut = body.rut ? normalizeRut(body.rut) : null;
    if (rut) {
      const existing = await prisma.opsPersona.findMany({
        where: { tenantId: ctx.tenantId, rut: { not: null } },
        select: { id: true, laborClass: true, rut: true, guardia: { select: { id: true } } },
      });
      const key = rutKey(rut);
      const clash = existing.find((p) => rutKey(p.rut) === key);
      if (clash) {
        const msg =
          clash.laborClass === "OPERATIVO" || clash.guardia
            ? "Este RUT ya está en el listado de guardias"
            : "Ya existe una ficha de equipo interno con este RUT";
        return NextResponse.json({ error: msg, personaId: clash.id }, { status: 409 });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const persona = await tx.opsPersona.create({
        data: {
          tenantId: ctx.tenantId,
          firstName,
          lastName,
          rut,
          email,
          phone,
          cargoStaff,
          laborClass: "ADMINISTRATIVO",
          status: "active",
          adminId,
          afp: body.afp ?? null,
          healthSystem: body.healthSystem ?? null,
          isapreName: body.isapreName ?? null,
        },
      });

      if (body.baseSalary && body.baseSalary > 0) {
        const structure = await tx.payrollSalaryStructure.create({
          data: {
            tenantId: ctx.tenantId,
            sourceType: "PERSONA",
            sourceId: persona.id,
            baseSalary: body.baseSalary,
            colacion: body.colacion ?? 0,
            movilizacion: body.movilizacion ?? 0,
            gratificationType: body.gratificationType ?? "AUTO_25",
            gratificationCustomAmount: body.gratificationCustomAmount ?? null,
            isActive: true,
            createdBy: ctx.userId,
          },
        });
        return tx.opsPersona.update({
          where: { id: persona.id },
          data: { salaryStructureId: structure.id },
          select: PERSONA_LIST_SELECT,
        });
      }

      return tx.opsPersona.findFirstOrThrow({
        where: { id: persona.id },
        select: PERSONA_LIST_SELECT,
      });
    });

    await createOpsAuditLog(ctx, "create", "ops_persona_staff", created.id, {
      cargoStaff,
      adminId,
    });

    return NextResponse.json(
      {
        data: {
          ...created,
          displayName: formatPersonName(created.firstName, created.lastName),
          cargoLabel: staffCargoLabel(created.cargoStaff),
          baseSalary: created.salaryStructure ? Number(created.salaryStructure.baseSalary) : null,
        },
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[POST /api/personas/equipo]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
