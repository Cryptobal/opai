import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { updateStaffPersonaSchema } from "@/lib/validations/personas-equipo";
import { formatPersonName, normalizeRut } from "@/lib/personas";
import { staffCargoLabel } from "@/lib/personas-staff";
import { cleanRut } from "@/lib/chile-rut";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const PERSONA_DETAIL_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  rut: true,
  email: true,
  phone: true,
  personalEmail: true,
  cargoStaff: true,
  laborClass: true,
  status: true,
  salaryStructureId: true,
  adminId: true,
  afp: true,
  healthSystem: true,
  isapreName: true,
  createdAt: true,
  updatedAt: true,
  salaryStructure: {
    select: {
      id: true,
      baseSalary: true,
      colacion: true,
      movilizacion: true,
      gratificationType: true,
      gratificationCustomAmount: true,
      isActive: true,
    },
  },
  admin: {
    select: { id: true, name: true, email: true, cargo: true, status: true },
  },
} as const;

function rutKey(rut: string | null | undefined): string | null {
  if (!rut) return null;
  const k = cleanRut(rut);
  return k.length >= 2 ? k : null;
}

async function loadStaff(tenantId: string, id: string) {
  return prisma.opsPersona.findFirst({
    where: { id, tenantId, laborClass: "ADMINISTRATIVO" },
    select: PERSONA_DETAIL_SELECT,
  });
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const persona = await loadStaff(ctx.tenantId, id);
    if (!persona) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        ...persona,
        displayName: formatPersonName(persona.firstName, persona.lastName),
        cargoLabel: staffCargoLabel(persona.cargoStaff),
        baseSalary: persona.salaryStructure ? Number(persona.salaryStructure.baseSalary) : null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[GET /api/personas/equipo/[id]]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await loadStaff(ctx.tenantId, id);
    if (!existing) {
      return NextResponse.json({ error: "Persona no encontrada" }, { status: 404 });
    }

    const parsed = updateStaffPersonaSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
        { status: 400 },
      );
    }
    const body = parsed.data;

    if (body.rut) {
      const rut = normalizeRut(body.rut);
      const key = rutKey(rut);
      const others = await prisma.opsPersona.findMany({
        where: { tenantId: ctx.tenantId, id: { not: id }, rut: { not: null } },
        select: { id: true, laborClass: true, rut: true, guardia: { select: { id: true } } },
      });
      const clash = others.find((p) => rutKey(p.rut) === key);
      if (clash) {
        const msg =
          clash.laborClass === "OPERATIVO" || clash.guardia
            ? "Este RUT ya está en el listado de guardias"
            : "Ya existe una ficha de equipo interno con este RUT";
        return NextResponse.json({ error: msg }, { status: 409 });
      }
    }

    if (body.adminId !== undefined) {
      if (body.adminId) {
        const admin = await prisma.admin.findFirst({
          where: { id: body.adminId, tenantId: ctx.tenantId },
          select: { id: true, persona: { select: { id: true } } },
        });
        if (!admin) {
          return NextResponse.json({ error: "Usuario ERP no encontrado" }, { status: 404 });
        }
        if (admin.persona && admin.persona.id !== id) {
          return NextResponse.json(
            { error: "Ese usuario ya está vinculado a otra ficha" },
            { status: 409 },
          );
        }
      }
    }

    const updated = await prisma.opsPersona.update({
      where: { id },
      data: {
        ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
        ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
        ...(body.rut !== undefined ? { rut: body.rut } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.personalEmail !== undefined ? { personalEmail: body.personalEmail } : {}),
        ...(body.cargoStaff !== undefined ? { cargoStaff: body.cargoStaff } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.adminId !== undefined ? { adminId: body.adminId } : {}),
        ...(body.afp !== undefined ? { afp: body.afp } : {}),
        ...(body.healthSystem !== undefined ? { healthSystem: body.healthSystem } : {}),
        ...(body.isapreName !== undefined ? { isapreName: body.isapreName } : {}),
      },
      select: PERSONA_DETAIL_SELECT,
    });

    await createOpsAuditLog(ctx, "update", "ops_persona_staff", id, {
      fields: Object.keys(body),
    });

    return NextResponse.json({
      data: {
        ...updated,
        displayName: formatPersonName(updated.firstName, updated.lastName),
        cargoLabel: staffCargoLabel(updated.cargoStaff),
        baseSalary: updated.salaryStructure ? Number(updated.salaryStructure.baseSalary) : null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error interno";
    console.error("[PATCH /api/personas/equipo/[id]]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
