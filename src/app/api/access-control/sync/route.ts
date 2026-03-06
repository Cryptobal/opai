import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/access-control/utils";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { records, exits } = body as {
      records: Array<{
        localId: string;
        installationId: string;
        recordType: string;
        rut?: string;
        fullName?: string;
        company?: string;
        entryGuardId: string;
        entryAt: string;
        gpsLat?: number;
        gpsLng?: number;
        vehiclePlate?: string;
        vehicleType?: string;
        vehicleBrandModel?: string;
        customFields?: Record<string, unknown>;
        qrSource?: string;
        documentSerial?: string;
        listMatch?: string;
        observations?: string;
        deviceId: string;
      }>;
      exits: Array<{
        recordId: string;
        exitAt: string;
        exitGuardId?: string;
        exitObservations?: string;
        gpsLat?: number;
        gpsLng?: number;
      }>;
    };

    const syncResult = { synced: 0, errors: [] as Array<{ localId: string; error: string }> };

    // Process entry records
    if (records && records.length > 0) {
      for (const rec of records) {
        try {
          // Check for duplicate (same deviceId + offlineCreatedAt)
          const existing = await prisma.accessControlRecord.findFirst({
            where: {
              deviceId: rec.deviceId,
              offlineCreatedAt: new Date(rec.entryAt),
            },
          });

          if (existing) {
            syncResult.synced++;
            continue;
          }

          const installation = await prisma.crmInstallation.findUnique({
            where: { id: rec.installationId },
            select: { tenantId: true },
          });

          if (!installation) {
            syncResult.errors.push({ localId: rec.localId, error: "Instalación no encontrada" });
            continue;
          }

          await prisma.accessControlRecord.create({
            data: {
              tenantId: installation.tenantId,
              installationId: rec.installationId,
              recordType: rec.recordType,
              rut: rec.rut ? cleanRut(rec.rut) : null,
              fullName: rec.fullName || null,
              company: rec.company || null,
              documentSerial: rec.documentSerial || null,
              entryAt: new Date(rec.entryAt),
              entryGuardId: rec.entryGuardId,
              entryGpsLat: rec.gpsLat ?? null,
              entryGpsLng: rec.gpsLng ?? null,
              vehiclePlate: rec.vehiclePlate || null,
              vehicleType: rec.vehicleType || null,
              vehicleBrandModel: rec.vehicleBrandModel || null,
              customFields: rec.customFields || {},
              qrSource: rec.qrSource || null,
              listMatch: rec.listMatch || null,
              isSynced: true,
              deviceId: rec.deviceId,
              offlineCreatedAt: new Date(rec.entryAt),
              entryObservations: rec.observations || null,
            },
          });

          syncResult.synced++;
        } catch (err) {
          syncResult.errors.push({
            localId: rec.localId,
            error: err instanceof Error ? err.message : "Error desconocido",
          });
        }
      }
    }

    // Process exits
    if (exits && exits.length > 0) {
      for (const exit of exits) {
        try {
          await prisma.accessControlRecord.update({
            where: { id: exit.recordId },
            data: {
              exitAt: new Date(exit.exitAt),
              exitGuardId: exit.exitGuardId || null,
              exitGpsLat: exit.gpsLat ?? null,
              exitGpsLng: exit.gpsLng ?? null,
              exitObservations: exit.exitObservations || null,
            },
          });
          syncResult.synced++;
        } catch (err) {
          syncResult.errors.push({
            localId: exit.recordId,
            error: err instanceof Error ? err.message : "Error desconocido",
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: syncResult });
  } catch (error) {
    console.error("[AccessControl] Error syncing records:", error);
    return NextResponse.json(
      { success: false, error: "Error al sincronizar registros" },
      { status: 500 }
    );
  }
}
