import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { CHILE_BANKS } from "@/lib/personas";

type Params = { id: string };

// ── GET: generate Santander XLSX ──

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_pay")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para exportar pagos" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const payment = await prisma.financePayment.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        rendiciones: {
          select: {
            id: true,
            code: true,
            amount: true,
            submitterId: true,
            beneficiaryGuardiaId: true,
            beneficiaryAdminId: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json(
        { success: false, error: "Pago no encontrado" },
        { status: 404 },
      );
    }

    const config = await prisma.financeRendicionConfig.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { santanderAccountNumber: true },
    });
    const cuentaOrigen = config?.santanderAccountNumber ?? "";

    // ── Resolve effective beneficiary per rendicion ──
    // Priority: beneficiaryGuardiaId > beneficiaryAdminId > submitterId
    type ResolvedRendicion = {
      rendicionId: string;
      code: string;
      amount: number;
      kind: "guardia" | "admin";
      refId: string;
    };
    const resolved: ResolvedRendicion[] = payment.rendiciones.map((r) => {
      if (r.beneficiaryGuardiaId) {
        return {
          rendicionId: r.id,
          code: r.code,
          amount: r.amount,
          kind: "guardia",
          refId: r.beneficiaryGuardiaId,
        };
      }
      const adminId = r.beneficiaryAdminId ?? r.submitterId;
      return {
        rendicionId: r.id,
        code: r.code,
        amount: r.amount,
        kind: "admin",
        refId: adminId,
      };
    });

    const guardiaIds = [
      ...new Set(resolved.filter((r) => r.kind === "guardia").map((r) => r.refId)),
    ];
    const adminIds = [
      ...new Set(resolved.filter((r) => r.kind === "admin").map((r) => r.refId)),
    ];

    const beneficiaryGuardias = guardiaIds.length > 0
      ? await prisma.opsGuardia.findMany({
          where: { id: { in: guardiaIds } },
          select: {
            id: true,
            persona: {
              select: { firstName: true, lastName: true, rut: true, email: true },
            },
            bankAccounts: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] },
          },
        })
      : [];
    const guardiaMap = new Map(beneficiaryGuardias.map((g) => [g.id, g]));

    const admins = adminIds.length > 0
      ? await prisma.admin.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const adminMap = new Map(admins.map((a) => [a.id, a]));

    const adminEmails = admins.map((a) => a.email).filter(Boolean);
    const personasByEmailQuery = adminEmails.length > 0
      ? await prisma.opsPersona.findMany({
          where: {
            tenantId: ctx.tenantId,
            OR: [
              { email: { in: adminEmails } },
              { personalEmail: { in: adminEmails } },
            ],
          },
          select: {
            id: true,
            email: true,
            personalEmail: true,
            firstName: true,
            lastName: true,
            rut: true,
            guardia: {
              select: {
                id: true,
                bankAccounts: {
                  orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                },
              },
            },
          },
        })
      : [];
    type PersonaWithGuardia = (typeof personasByEmailQuery)[number];
    const personaByEmail = new Map<string, PersonaWithGuardia>();
    for (const p of personasByEmailQuery) {
      if (p.email) personaByEmail.set(p.email.toLowerCase(), p);
      if (p.personalEmail) personaByEmail.set(p.personalEmail.toLowerCase(), p);
    }

    // Fallback: admins cuyo email no calzó con ningún email/personalEmail de persona.
    // Buscamos por nombre dentro del tenant y tomamos match único con guardia + cuenta.
    const adminsNeedingNameLookup = admins.filter((a) => {
      const persona = a.email ? personaByEmail.get(a.email.toLowerCase()) : undefined;
      return !persona;
    });
    const personaByAdminId = new Map<string, PersonaWithGuardia>();
    const stripDiacritics = (s: string) =>
      s.normalize("NFD").replace(/\p{Mn}/gu, "");
    if (adminsNeedingNameLookup.length > 0) {
      const tokenize = (s: string) =>
        stripDiacritics(s.toLowerCase())
          .split(/\s+/)
          .filter((t) => t.length >= 2);

      // Cargamos todas las personas del tenant que tienen guardia con bankAccounts no vacías
      // (acotado por el conjunto de candidatos: nombres que comparten al menos un token).
      const allTokens = [
        ...new Set(adminsNeedingNameLookup.flatMap((a) => tokenize(a.name))),
      ];
      if (allTokens.length > 0) {
        const candidatePersonas = await prisma.opsPersona.findMany({
          where: {
            tenantId: ctx.tenantId,
            OR: allTokens.flatMap((t) => [
              { firstName: { contains: t, mode: "insensitive" as const } },
              { lastName: { contains: t, mode: "insensitive" as const } },
            ]),
          },
          select: {
            id: true,
            email: true,
            personalEmail: true,
            firstName: true,
            lastName: true,
            rut: true,
            guardia: {
              select: {
                id: true,
                bankAccounts: {
                  orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
                },
              },
            },
          },
        });

        for (const a of adminsNeedingNameLookup) {
          const tokens = tokenize(a.name);
          if (tokens.length === 0) continue;
          const matches = candidatePersonas.filter((p) => {
            const haystack = stripDiacritics(`${p.firstName} ${p.lastName}`.toLowerCase());
            return tokens.every((t) => haystack.includes(t));
          });
          // Preferir matches con guardia + bankAccounts no vacíos para evitar ambigüedad
          const usable = matches.filter(
            (m) => (m.guardia?.bankAccounts.length ?? 0) > 0,
          );
          const pick = usable.length === 1 ? usable[0] : matches.length === 1 ? matches[0] : null;
          if (pick) personaByAdminId.set(a.id, pick);
        }
      }
    }

    // ── Helper: SBIF lookup robusto (por code, luego por nombre normalizado) ──
    const normalizeBank = (s: string) =>
      stripDiacritics(s.toLowerCase()).replace(/[^a-z0-9]/g, "");
    const banksByName = new Map(
      CHILE_BANKS.map((b) => [normalizeBank(b.name), b]),
    );
    const resolveSbif = (
      bankCode: string | null | undefined,
      bankName: string | null | undefined,
    ): { sbifCode: string; bankCode: string } => {
      if (bankCode) {
        const byCode = CHILE_BANKS.find((b) => b.code === bankCode);
        if (byCode) return { sbifCode: byCode.sbifCode, bankCode };
      }
      if (bankName) {
        const byName = banksByName.get(normalizeBank(bankName));
        if (byName) return { sbifCode: byName.sbifCode, bankCode: byName.code };
      }
      return { sbifCode: "", bankCode: bankCode ?? "" };
    };

    // ── Build rows grouped by beneficiary ──
    type BeneficiaryRow = {
      accountNumber: string;
      bankCode: string;
      sbifCode: string;
      rut: string;
      fullName: string;
      amount: number;
      email: string;
      rendicionCodes: string[];
      guardiaId: string | null;
    };
    const rowsByKey = new Map<string, BeneficiaryRow>();

    for (const r of resolved) {
      let row: BeneficiaryRow;
      if (r.kind === "guardia") {
        const g = guardiaMap.get(r.refId);
        const account = g?.bankAccounts?.[0];
        const { sbifCode, bankCode } = resolveSbif(account?.bankCode, account?.bankName);
        row = {
          accountNumber: account?.accountNumber ?? "",
          bankCode,
          sbifCode,
          rut: g?.persona?.rut ?? "",
          fullName: `${g?.persona?.firstName ?? ""} ${g?.persona?.lastName ?? ""}`.trim(),
          amount: 0,
          email: g?.persona?.email ?? "",
          rendicionCodes: [],
          guardiaId: r.refId,
        };
      } else {
        const admin = adminMap.get(r.refId);
        const persona =
          (admin?.email ? personaByEmail.get(admin.email.toLowerCase()) : undefined) ??
          personaByAdminId.get(r.refId);
        const account = persona?.guardia?.bankAccounts?.[0];
        const { sbifCode, bankCode } = resolveSbif(account?.bankCode, account?.bankName);
        row = {
          accountNumber: account?.accountNumber ?? "",
          bankCode,
          sbifCode,
          rut: persona?.rut ?? "",
          fullName: persona
            ? `${persona.firstName ?? ""} ${persona.lastName ?? ""}`.trim()
            : admin?.name ?? "",
          amount: 0,
          email: admin?.email ?? "",
          rendicionCodes: [],
          guardiaId: persona?.guardia?.id ?? null,
        };
      }
      const key = `${r.kind}:${r.refId}`;
      const existing = rowsByKey.get(key);
      if (existing) {
        existing.amount += r.amount;
        existing.rendicionCodes.push(r.code);
      } else {
        row.amount = r.amount;
        row.rendicionCodes = [r.code];
        rowsByKey.set(key, row);
      }
    }

    const rows = [...rowsByKey.values()];

    // ── Validate: every row needs RUT, cuenta destino y código banco ──
    type RowIssue = {
      beneficiary: string;
      guardiaId: string | null;
      rendiciones: string[];
      missing: string[];
    };
    const issues: RowIssue[] = [];
    for (const row of rows) {
      const missing: string[] = [];
      if (!row.rut) missing.push("RUT");
      if (!row.accountNumber) missing.push("cuenta destino");
      if (!row.sbifCode) missing.push(row.bankCode ? "código banco (SBIF)" : "banco destino");
      if (missing.length > 0) {
        issues.push({
          beneficiary: row.fullName || "(sin nombre)",
          guardiaId: row.guardiaId,
          rendiciones: row.rendicionCodes,
          missing,
        });
      }
    }
    if (!cuentaOrigen) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Falta configurar la cuenta origen Santander en Finanzas → Configuración.",
        },
        { status: 422 },
      );
    }
    if (issues.length > 0) {
      const summary = issues
        .map(
          (i) =>
            `• ${i.beneficiary} (${i.rendiciones.join(", ")}): falta ${i.missing.join(", ")}`,
        )
        .join("\n");
      return NextResponse.json(
        {
          success: false,
          error: `No se puede exportar: ${issues.length} beneficiario(s) sin datos bancarios completos.\n${summary}\n\nCompleta RUT y cuenta bancaria del beneficiario en su ficha antes de reintentar.`,
          issues,
        },
        { status: 422 },
      );
    }

    // ── Build Excel ──
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Santander", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

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

    for (const row of rows) {
      sheet.addRow([
        cuentaOrigen,
        "CLP",
        row.accountNumber,
        "CLP",
        row.sbifCode,
        row.rut,
        row.fullName,
        row.amount,
        payment.code,
        row.email,
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
        "Content-Disposition": `attachment; filename="${payment.code}-santander.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[Finance] Error exporting Santander XLSX:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar el archivo Santander" },
      { status: 500 },
    );
  }
}
