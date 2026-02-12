import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { CHILE_BANKS } from "@/lib/personas";

const CUENTA_ORIGEN = "94541158";

type Params = { id: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const lote = await prisma.opsPagoTeLote.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
      },
      include: {
        items: {
          include: {
            guardia: {
              include: {
                persona: {
                  select: {
                    firstName: true,
                    lastName: true,
                    rut: true,
                    email: true,
                  },
                },
                bankAccounts: {
                  orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                },
              },
            },
          },
        },
      },
    });

    if (!lote) {
      return NextResponse.json(
        { success: false, error: "Lote no encontrado" },
        { status: 404 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Santander", { views: [{ state: "frozen", ySplit: 1 }] });

    // Columnas plantilla Santander (A–M)
    const headers = [
      "Cuenta origen",
      "Moneda origen",
      "Cuenta destino",
      "Moneda destino",
      "Codigo banco destino",
      "RUT beneficiario",
      "Nombre beneficiario",
      "Monto transferencia",
      "Glosa personalizada transferencia",
      "Correo beneficiario",
      "Mensaje correo beneficiario",
      "Glosa cartola originador",
      "Glosa cartola beneficiario",
    ];
    sheet.addRow(headers);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const item of lote.items) {
      const persona = item.guardia.persona;
      const account = item.guardia.bankAccounts[0];
      const fullName = `${persona.firstName ?? ""} ${persona.lastName ?? ""}`.trim();
      const sbifCode = account?.bankCode
        ? CHILE_BANKS.find((b) => b.code === account.bankCode)?.sbifCode ?? ""
        : "";

      sheet.addRow([
        CUENTA_ORIGEN,
        "CLP",
        account?.accountNumber ?? "",
        "CLP",
        sbifCode,
        persona.rut ?? "",
        fullName,
        Number(item.amountClp),
        lote.code,
        persona.email ?? "",
        "",
        "",
        "",
      ]);
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${lote.code}-santander.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[TE] Error exporting lote XLSX:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar el lote" },
      { status: 500 }
    );
  }
}
