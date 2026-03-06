import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { cleanRut, validateRut } from "@/lib/access-control/utils";
import { isTableMissingError } from "@/lib/access-control/safe-query";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const body = await request.json();

    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Validate RUT if provided
    if (body.rut && !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const cleaned = body.rut ? cleanRut(body.rut) : null;

    // Create the access record
    const record = await prisma.accessControlRecord.create({
      data: {
        tenantId: installation.tenantId,
        installationId,
        recordType: body.recordType,
        rut: cleaned,
        fullName: body.fullName || null,
        company: body.company || null,
        documentSerial: body.documentSerial || null,
        entryAt: body.offlineCreatedAt ? new Date(body.offlineCreatedAt) : new Date(),
        entryGuardId: body.entryGuardId,
        entryGpsLat: body.gpsLat ?? null,
        entryGpsLng: body.gpsLng ?? null,
        vehiclePlate: body.vehiclePlate || null,
        vehiclePlatePhotoUrl: body.vehiclePlatePhotoUrl || null,
        vehicleType: body.vehicleType || null,
        vehicleBrandModel: body.vehicleBrandModel || null,
        visitorPhotoUrl: body.visitorPhotoUrl || null,
        credentialPhotoUrl: body.credentialPhotoUrl || null,
        entrySignatureUrl: body.entrySignatureUrl || null,
        customFields: (body.customFields || {}) as Prisma.InputJsonValue,
        qrSource: body.qrSource || null,
        idValidationStatus: body.idValidationStatus || "not_checked",
        listMatch: body.listMatch || null,
        preregistrationId: body.preregistrationId || null,
        isSynced: !body.deviceId,
        deviceId: body.deviceId || null,
        offlineCreatedAt: body.offlineCreatedAt ? new Date(body.offlineCreatedAt) : null,
        entryObservations: body.observations || null,
      },
    });

    // Update known visitors cache
    if (cleaned && body.fullName) {
      await prisma.accessControlKnownVisitor.upsert({
        where: { rut: cleaned },
        update: {
          fullName: body.fullName,
          company: body.company || null,
          lastVisitAt: new Date(),
          visitCount: { increment: 1 },
          lastPhotoUrl: body.visitorPhotoUrl || undefined,
          metadata: (body.customFields || {}) as Prisma.InputJsonValue,
        },
        create: {
          tenantId: installation.tenantId,
          rut: cleaned,
          fullName: body.fullName,
          company: body.company || null,
          lastVisitAt: new Date(),
          visitCount: 1,
          lastPhotoUrl: body.visitorPhotoUrl || null,
          metadata: (body.customFields || {}) as Prisma.InputJsonValue,
        },
      });
    }

    // Update preregistration status if linked
    if (body.preregistrationId) {
      await prisma.accessControlPreregistration.update({
        where: { id: body.preregistrationId },
        data: { status: "checked_in" },
      });
    }

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    if (isTableMissingError(error)) {
      return NextResponse.json(
        { success: false, error: "Las tablas de control de acceso aún no existen. Ejecute la migración." },
        { status: 503 }
      );
    }
    console.error("[AccessControl] Error creating entry record:", error);
    return NextResponse.json(
      { success: false, error: "Error al registrar entrada" },
      { status: 500 }
    );
  }
}
