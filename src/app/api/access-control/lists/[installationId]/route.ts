import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut, cleanPlate } from "@/lib/access-control/utils";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const tenantId = authCtx.tenantId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "whitelist" | "blacklist" | null;

    // Alcance multitenant solo vía requireAccessControlAuth(installationId): la instalación ya
    // quedó acotada al tenant del operador/dispositivo. Filtrar de nuevo por row.tenant_id o
    // por join installation→tenant puede dejar todo vacío si hubo drift, o ante rarezas entre
    // schemas. Las filas keyed por este installation_id son efectivamente las de ese sitio.

    let where: Prisma.AccessControlListWhereInput;

    if (type === "blacklist") {
      where = {
        OR: [
          { installationId, listType: "blacklist" },
          { scope: "global", listType: "blacklist", tenantId },
        ],
      };
    } else if (type === "whitelist") {
      where = { installationId, listType: "whitelist" };
    } else {
      where = {
        OR: [
          { installationId },
          { scope: "global", listType: "blacklist", tenantId },
        ],
      };
    }

    const lists = await safeAccessControlQuery(
      () =>
        prisma.accessControlList.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            groupLinks: {
              include: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    listType: true,
                    installationLinks: {
                      select: { installationId: true },
                    },
                  },
                },
              },
            },
          },
        }),
      [],
    );

    const normalized = (lists ?? []).map((entry) => ({
      ...entry,
      groups: (entry.groupLinks ?? [])
        .map((link) => link.group)
        .filter(
          (group) =>
            group &&
            group.listType === entry.listType &&
            group.installationLinks.some((i) => i.installationId === installationId),
        )
        .map((group) => ({ id: group.id, name: group.name })),
    }));

    return NextResponse.json({ success: true, data: normalized });
  } catch (error) {
    console.error("[AccessControl] Error fetching lists:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener listas" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const hasRut = typeof body.rut === "string" && body.rut.trim().length > 0;
    const hasPlate = typeof body.vehiclePlate === "string" && body.vehiclePlate.trim().length > 0;

    if (!hasRut && !hasPlate) {
      return NextResponse.json(
        { success: false, error: "Debe especificar al menos RUT o patente" },
        { status: 400 }
      );
    }
    if (hasRut && !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const cleanedRut = hasRut ? cleanRut(body.rut) : null;
    const cleanedPlate = hasPlate ? cleanPlate(body.vehiclePlate) : null;

    const recordTypesInput: string[] = Array.isArray(body.recordTypes)
      ? body.recordTypes.filter((t: unknown): t is string => typeof t === "string" && t.length > 0)
      : [];
    const recordTypeSingular: string = typeof body.recordType === "string" && body.recordType.length > 0
      ? body.recordType
      : "visit";
    const finalRecordTypes = recordTypesInput.length > 0 ? recordTypesInput : [recordTypeSingular];

    const entry = await prisma.accessControlList.create({
      data: {
        tenantId: authCtx.tenantId,
        installationId: body.scope === "global" ? null : installationId,
        listType: body.listType,
        rut: cleanedRut,
        vehiclePlate: cleanedPlate,
        fullName: body.fullName,
        company: body.company || null,
        blockReason: body.blockReason || null,
        scope: body.scope || "local",
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: Array.isArray(body.allowedDays) ? body.allowedDays : [],
        allowedTimeFrom: body.allowedTimeFrom || null,
        allowedTimeTo: body.allowedTimeTo || null,
        recordType: finalRecordTypes[0], // mirror legacy del primer elemento
        recordTypes: finalRecordTypes,
        singleUse: !!body.singleUse,
        isActive: true,
        createdBy: body.createdBy || null,
      },
    });

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error("[AccessControl] Error creating list entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear entrada en lista" },
      { status: 500 }
    );
  }
}
