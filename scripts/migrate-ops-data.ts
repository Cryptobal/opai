/**
 * Script de migración masiva: Sistema actual → Base de datos Opai
 *
 * Migra:
 *   1. Clientes Activos + Inactivos → crm.accounts
 *   2. Instalaciones Activas + Inactivas → crm.installations
 *   3. Colaboradores (guardias) → ops.personas + ops.guardias + ops.cuentas_bancarias + ops.guardia_history
 *
 * Reglas:
 *   - Si el cliente está inactivo, sus instalaciones se marcan inactivas (independiente del archivo de origen)
 *   - Código de marcación: se genera con el mismo esquema que "Generar código" en la app (8 caracteres únicos), no se usa Cecos
 *   - Guardias activos → lifecycleStatus "contratado_activo", currentInstallationId set
 *   - Guardias inactivos → lifecycleStatus "desvinculado", currentInstallationId null
 *   - Para TODOS los guardias se crea un registro de historial con su instalación original
 *
 * Uso:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/migrate-ops-data.ts
 */

import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";
import { generateMarcacionCode } from "../src/lib/marcacion";

const prisma = new PrismaClient();

const DATA_DIR = path.join(process.cwd(), "Datos Ops");

/** Tenant ID (se resuelve al inicio buscando slug "gard") */
let TENANT_ID: string;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parsea fecha chilena "DD-MM-YYYY" → Date | null */
function parseChileanDate(val: string | undefined | null): Date | null {
  if (!val?.trim()) return null;
  const clean = val.trim();
  const parts = clean.split("-");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy || yyyy.length !== 4) return null;
  const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

/** Lee un CSV con delimitador ; y retorna array de objetos */
function readCsv(filename: string): Record<string, string>[] {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`  ⚠ Archivo no encontrado: ${filePath}`);
    return [];
  }
  let content = fs.readFileSync(filePath, "utf-8");
  // Quitar BOM si existe
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const records = parse(content, {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, string>[];
  return records;
}

/** Parsea float con coma decimal (formato chileno) */
function parseChileanFloat(val: string | undefined | null): number | null {
  if (!val?.trim()) return null;
  const n = parseFloat(val.trim().replace(",", "."));
  return isNaN(n) || n === 0 ? null : n;
}

/** Genera código guardia G-XXXXXX */
function guardiaCode(n: number): string {
  return `G-${String(n).padStart(6, "0")}`;
}

/** Genera un código de marcación único (mismo esquema que "Generar código" en la app). */
async function generateUniqueMarcacionCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateMarcacionCode();
    const existing = await prisma.crmInstallation.findFirst({
      where: { marcacionCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error("No se pudo generar código de marcación único después de varios intentos");
}

// ─── Mapeos de bancos ────────────────────────────────────────────────────────

const BANK_NAME_TO_CODE: Record<string, string> = {
  "banco estado": "BCE",
  "bancoestado": "BCE",
  "banco de chile": "BCH",
  "banco chile": "BCH",
  "banco santander": "BSC",
  "banco bci": "BCI",
  "bci": "BCI",
  "banco falabella": "FAL",
  "banco scotiabank": "SCO",
  "scotiabank": "SCO",
  "banco itau": "ITAU",
  "itau": "ITAU",
  "banco security": "SEC",
  "banco ripley": "RIP",
  "banco consorcio": "CON",
  "banco internacional": "INT",
  "banco bice": "CHI",
  "tenpo": "TENPO",
  "mach": "MACH",
};

function resolveBankCode(csvBankName: string | undefined | null): string | null {
  if (!csvBankName?.trim()) return null;
  const lower = csvBankName.trim().toLowerCase();
  return BANK_NAME_TO_CODE[lower] ?? null;
}

function resolveBankName(csvBankName: string | undefined | null): string {
  if (!csvBankName?.trim()) return "Desconocido";
  // Capitalizar
  return csvBankName.trim().split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

/** Mapea tipo cuenta del CSV → valor enum de la BD */
function resolveAccountType(csvType: string | undefined | null): "cuenta_corriente" | "cuenta_vista" | "cuenta_rut" {
  if (!csvType?.trim()) return "cuenta_vista";
  const lower = csvType.trim().toLowerCase();
  if (lower.includes("corriente")) return "cuenta_corriente";
  if (lower.includes("rut")) return "cuenta_rut";
  return "cuenta_vista";
}

/** Mapea AFP del CSV → valor normalizado */
function resolveAfp(csvAfp: string | undefined | null): string | null {
  if (!csvAfp?.trim()) return null;
  const lower = csvAfp.trim().toLowerCase();
  const map: Record<string, string> = {
    capital: "Capital",
    cuprum: "Cuprum",
    habitat: "Habitat",
    planvital: "PlanVital",
    provida: "ProVida",
    uno: "UNO",
    modelo: "Modelo",
    "sin afp": null as unknown as string,
  };
  return map[lower] ?? null;
}

/** Mapea salud del CSV → healthSystem normalizado */
function resolveHealthSystem(csvSalud: string | undefined | null): string | null {
  if (!csvSalud?.trim()) return null;
  const lower = csvSalud.trim().toLowerCase();
  if (lower === "fonasa") return "fonasa";
  if (lower.startsWith("is") || lower === "isalud") return "isapre";
  return null;
}

// ─── 1. Cargar Clientes ──────────────────────────────────────────────────────

async function loadClients(): Promise<{
  codeToId: Map<string, string>;
  codeToActive: Map<string, boolean>;
}> {
  console.log("\n══════════════════════════════════════════");
  console.log("  1. CARGANDO CLIENTES (Accounts)");
  console.log("══════════════════════════════════════════\n");

  const codeToId = new Map<string, string>();
  const codeToActive = new Map<string, boolean>();

  // --- Clientes activos ---
  const activeRows = readCsv("Clientes Activos.csv");
  let activeCount = 0;
  for (const row of activeRows) {
    const rut = row["Rut"]?.trim();
    const code = row["CÓD. CLI"]?.trim();
    if (!rut || !code) continue;

    const account = await prisma.crmAccount.create({
      data: {
        tenantId: TENANT_ID,
        name: row["NOMBRE DE FANTASIA"]?.trim() || row["RAZÓN SOCIAL"]?.trim() || "Sin nombre",
        rut,
        legalName: row["RAZÓN SOCIAL"]?.trim() || null,
        legalRepresentativeName: row["NOMBRE REP. LEGAL"]?.trim() || null,
        legalRepresentativeRut: row["Rut REP. LEGAL"]?.trim() || null,
        industry: row["GIRO"]?.trim() || null,
        segment: row["TIPO CLIENTE"]?.trim() || null,
        address: row["DIRECCIÓN PRINCIPAL"]?.trim() || null,
        commune: row["COMUNA"]?.trim() || null,
        type: "client",
        status: "client_active",
        isActive: true,
        startDate: parseChileanDate(row["FECHA INICIO"]),
        endDate: parseChileanDate(row["FECHA TÉRMINO"]),
      },
    });
    codeToId.set(code, account.id);
    codeToActive.set(code, true);
    activeCount++;
    console.log(`  ✅ [Activo]   ${code} - ${row["NOMBRE DE FANTASIA"]?.trim()}`);
  }

  // --- Clientes inactivos ---
  const inactiveRows = readCsv("Clientes Inactivos.csv");
  let inactiveCount = 0;
  for (const row of inactiveRows) {
    const rut = row["Rut"]?.trim();
    const code = row["CÓD. CLI"]?.trim();
    if (!rut || !code) continue;

    const account = await prisma.crmAccount.create({
      data: {
        tenantId: TENANT_ID,
        name: row["NOMBRE DE FANTASIA"]?.trim() || row["RAZÓN SOCIAL"]?.trim() || "Sin nombre",
        rut,
        legalName: row["RAZÓN SOCIAL"]?.trim() || null,
        legalRepresentativeName: row["NOMBRE REP. LEGAL"]?.trim() || null,
        legalRepresentativeRut: row["Rut REP. LEGAL"]?.trim() || null,
        industry: row["GIRO"]?.trim() || null,
        segment: row["TIPO CLIENTE"]?.trim() || null,
        address: row["DIRECCIÓN PRINCIPAL"]?.trim() || null,
        commune: row["COMUNA"]?.trim() || null,
        type: "client",
        status: "client_inactive",
        isActive: false,
        startDate: parseChileanDate(row["FECHA INICIO"]),
        endDate: parseChileanDate(row["FECHA TÉRMINO"]),
      },
    });
    codeToId.set(code, account.id);
    codeToActive.set(code, false);
    inactiveCount++;
    console.log(`  ⬜ [Inactivo] ${code} - ${row["NOMBRE DE FANTASIA"]?.trim()}`);
  }

  console.log(`\n  📊 Clientes: ${activeCount} activos, ${inactiveCount} inactivos, ${activeCount + inactiveCount} total`);
  return { codeToId, codeToActive };
}

// ─── 2. Cargar Instalaciones ─────────────────────────────────────────────────

async function loadInstallations(
  clientCodeToId: Map<string, string>,
  clientCodeToActive: Map<string, boolean>,
): Promise<Map<string, string>> {
  console.log("\n══════════════════════════════════════════");
  console.log("  2. CARGANDO INSTALACIONES");
  console.log("══════════════════════════════════════════\n");

  const cecosToId = new Map<string, string>();

  // --- Instalaciones activas (con override por estado del cliente) ---
  const activeRows = readCsv("ControlRoll Instalación Activos Feb 13 2026.csv");
  let activeCount = 0;
  let overriddenCount = 0;

  for (const row of activeRows) {
    const cecos = row["Cecos"]?.trim();
    if (!cecos) continue;

    const clientCode = row["Cód. Cliente"]?.trim();
    const accountId = clientCode ? clientCodeToId.get(clientCode) ?? null : null;
    const clientIsActive = clientCode ? (clientCodeToActive.get(clientCode) ?? true) : true;

    // Si el cliente está inactivo, la instalación pasa a inactiva
    const isActive = clientIsActive;
    if (!clientIsActive) overriddenCount++;

    const lat = parseChileanFloat(row["Latitud"]);
    const lng = parseChileanFloat(row["Longitud"]);

    // Limpiar comuna: "Lo Barnechea (Santiago)" → "Lo Barnechea"
    const rawCommune = row["Comuna"]?.trim() || null;
    const commune = rawCommune ? rawCommune.split(" (")[0] : null;

    const marcacionCode = await generateUniqueMarcacionCode();
    const installation = await prisma.crmInstallation.create({
      data: {
        tenantId: TENANT_ID,
        accountId,
        name: row["Nombre Instalación"]?.trim() || cecos,
        address: row["Dirección Principal"]?.trim() || null,
        commune,
        lat,
        lng,
        isActive,
        marcacionCode,
        startDate: parseChileanDate(row["Inicio"]),
        endDate: parseChileanDate(row["Término"]),
      },
    });
    cecosToId.set(cecos, installation.id);
    activeCount++;
    const tag = isActive ? "✅ Activa  " : "⚠️  Inactiva";
    console.log(`  ${tag} ${cecos} - ${row["Nombre Instalación"]?.trim()} (cliente: ${row["Cliente"]?.trim()}) [marcación: ${marcacionCode}]`);
  }

  // --- Instalaciones inactivas ---
  const inactiveRows = readCsv("FCM Instalación(Inactivos)_13-02-2026-01-27.csv");
  let inactiveCount = 0;
  for (const row of inactiveRows) {
    const cecos = row["Cecos"]?.trim();
    if (!cecos) continue;

    const clientCode = row["Cód. Cliente"]?.trim();
    const accountId = clientCode ? clientCodeToId.get(clientCode) ?? null : null;

    const lat = parseChileanFloat(row["Latitud"]);
    const lng = parseChileanFloat(row["Longitud"]);
    const rawCommune = row["Comuna"]?.trim() || null;
    const commune = rawCommune ? rawCommune.split(" (")[0] : null;

    const marcacionCode = await generateUniqueMarcacionCode();
    const installation = await prisma.crmInstallation.create({
      data: {
        tenantId: TENANT_ID,
        accountId,
        name: row["Nombre Instalación"]?.trim() || cecos,
        address: row["Dirección Principal"]?.trim() || null,
        commune,
        lat,
        lng,
        isActive: false,
        marcacionCode,
        startDate: parseChileanDate(row["Inicio"]),
        endDate: parseChileanDate(row["Término"]),
      },
    });
    cecosToId.set(cecos, installation.id);
    inactiveCount++;
    console.log(`  ⬜ Inactiva ${cecos} - ${row["Nombre Instalación"]?.trim()} [marcación: ${marcacionCode}]`);
  }

  console.log(`\n  📊 Instalaciones: ${activeCount} del archivo activos (${overriddenCount} sobreescritas a inactivas por cliente), ${inactiveCount} inactivas, ${activeCount + inactiveCount} total`);
  return cecosToId;
}

// ─── 3. Cargar Guardias/Colaboradores ────────────────────────────────────────

async function loadGuards(cecosToId: Map<string, string>) {
  console.log("\n══════════════════════════════════════════");
  console.log("  3. CARGANDO GUARDIAS (Colaboradores)");
  console.log("══════════════════════════════════════════\n");

  const rows = readCsv("Reporte Colaboradores.csv");

  // Buscar último código de guardia existente para empezar después
  const lastGuardia = await prisma.opsGuardia.findFirst({
    where: { tenantId: TENANT_ID, code: { not: null } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  let codeCounter = 0;
  if (lastGuardia?.code) {
    const match = /^G-(\d{6})$/.exec(lastGuardia.code);
    if (match) codeCounter = Number(match[1]);
  }
  console.log(`  Último código existente: ${lastGuardia?.code ?? "ninguno"}, empezando desde G-${String(codeCounter + 1).padStart(6, "0")}`);

  let activeCount = 0;
  let inactiveCount = 0;
  let skippedCount = 0;
  let bankCount = 0;
  const warnings: string[] = [];

  for (const row of rows) {
    const rut = row["Nro. Documento de Identidad"]?.trim();
    if (!rut) {
      skippedCount++;
      continue;
    }

    const isActive = row["Estado"]?.trim() === "Activo";
    const cecos = row["CECOS"]?.trim();
    const installationId = cecos ? cecosToId.get(cecos) ?? null : null;

    // Advertir si un guardia activo no tiene instalación mapeada
    if (isActive && cecos && !installationId) {
      warnings.push(`  ⚠ Guardia activo ${rut} (${row["Nombre Completo"]?.trim()}) tiene CECOS "${cecos}" que no existe en instalaciones`);
    }

    // Parsear anticipo
    const rawAnticipo = row["Monto Anticipo"]?.trim()?.replace(/\./g, "") || "0";
    const montoAnticipo = parseInt(rawAnticipo, 10) || 0;
    const recibeAnticipo = montoAnticipo > 0;

    // Parsear fechas
    const birthDate = parseChileanDate(row["Fecha Nacimiento"]);
    const hiredAt = parseChileanDate(row["Fecha Ingreso"]);
    const terminatedAt = parseChileanDate(row["Fecha Finiquito"]);

    // Sexo
    const rawSex = row["Sexo"]?.trim()?.toLowerCase();
    const sex = rawSex === "hombre" ? "masculino" : rawSex === "mujer" ? "femenino" : null;

    // Crear persona
    const persona = await prisma.opsPersona.create({
      data: {
        tenantId: TENANT_ID,
        firstName: row["Nombres"]?.trim() || "",
        lastName: `${row["Ap. Paterno"]?.trim() || ""} ${row["Ap. Materno"]?.trim() || ""}`.trim(),
        rut,
        email: row["Email Ficha"]?.trim() || null,
        phone: row["Teléfono"]?.trim() || null,
        phoneMobile: row["Celular"]?.trim() || null,
        addressLine1: row["Dirección"]?.trim() || null,
        addressFormatted: row["Dirección"]?.trim() || null,
        commune: row["Comuna"]?.trim() || null,
        city: row["Ciudad"]?.trim() || null,
        region: row["Región"]?.trim() || null,
        birthDate,
        sex,
        afp: resolveAfp(row["Afp"]),
        healthSystem: resolveHealthSystem(row["Salud"]),
        status: isActive ? "active" : "inactive",
      },
    });

    // Crear guardia
    codeCounter++;
    const guardia = await prisma.opsGuardia.create({
      data: {
        tenantId: TENANT_ID,
        personaId: persona.id,
        code: guardiaCode(codeCounter),
        status: isActive ? "active" : "inactive",
        lifecycleStatus: isActive ? "contratado_activo" : "desvinculado",
        hiredAt,
        terminatedAt,
        currentInstallationId: isActive ? installationId : null, // Solo activos aparecen en instalación
        montoAnticipo,
        recibeAnticipo,
        marcacionPin: row["PIN"]?.trim() || null,
      },
    });

    // Crear cuenta bancaria si hay datos
    const csvBankName = row["Banco"]?.trim();
    const accountNumber = row["N° Cuenta"]?.trim();
    if (csvBankName && accountNumber) {
      const fullName = row["Nombre Completo"]?.trim()
        || `${row["Nombres"]?.trim() || ""} ${row["Ap. Paterno"]?.trim() || ""} ${row["Ap. Materno"]?.trim() || ""}`.trim();

      await prisma.opsCuentaBancaria.create({
        data: {
          tenantId: TENANT_ID,
          guardiaId: guardia.id,
          bankCode: resolveBankCode(csvBankName),
          bankName: resolveBankName(csvBankName),
          accountType: resolveAccountType(row["Tipo Cuenta"]),
          accountNumber,
          holderName: fullName,
          holderRut: rut,
          isDefault: true,
        },
      });
      bankCount++;
    }

    // Crear registro de historial para TODOS (activos e inactivos)
    // Esto preserva el dato de la instalación original del guardia
    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: TENANT_ID,
        guardiaId: guardia.id,
        eventType: "migration_import",
        newValue: {
          cecos: cecos || null,
          installationId: installationId || null,
          installationName: row["Instalación"]?.trim() || null,
          clientName: row["Cliente"]?.trim() || null,
          cargo: row["Cargo"]?.trim() || null,
          jornada: row["Jornada"]?.trim() || null,
          estado: row["Estado"]?.trim() || null,
          tipoColaborador: row["Tipo Colaborador"]?.trim() || null,
          montoAnticipo,
          rut,
        },
        reason: `Migración masiva desde sistema anterior${cecos ? `. CECOS: ${cecos}` : ""}${row["Instalación"]?.trim() ? `, Instalación: ${row["Instalación"].trim()}` : ""}`,
        createdBy: "migration_script",
      },
    });

    if (isActive) {
      activeCount++;
    } else {
      inactiveCount++;
    }

    // Log cada 25 registros
    if ((activeCount + inactiveCount) % 25 === 0) {
      console.log(`  ... procesados ${activeCount + inactiveCount} guardias...`);
    }
  }

  console.log(`\n  📊 Guardias: ${activeCount} activos, ${inactiveCount} inactivos, ${skippedCount} omitidos (sin RUT)`);
  console.log(`  📊 Cuentas bancarias creadas: ${bankCount}`);
  console.log(`  📊 Códigos: G-000001 a ${guardiaCode(codeCounter)}`);

  if (warnings.length > 0) {
    console.log(`\n  ⚠ ADVERTENCIAS (${warnings.length}):`);
    for (const w of warnings) console.log(w);
  }

  return { activeCount, inactiveCount, bankCount, codeCounter };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   MIGRACIÓN MASIVA: Datos Ops → Base de datos   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Resolver tenant
  const tenant = await prisma.tenant.findUnique({ where: { slug: "gard" } });
  if (!tenant) {
    console.error("❌ Tenant 'gard' no encontrado. Ejecuta primero: npx prisma db seed");
    process.exit(1);
  }
  TENANT_ID = tenant.id;
  console.log(`✅ Tenant: ${tenant.name} (${TENANT_ID})`);

  // Verificar que no haya datos previos
  const existingAccounts = await prisma.crmAccount.count({ where: { tenantId: TENANT_ID } });
  const existingGuardias = await prisma.opsGuardia.count({ where: { tenantId: TENANT_ID } });

  if (existingAccounts > 0 || existingGuardias > 0) {
    console.log(`\n⚠ Ya existen datos en la BD:`);
    console.log(`   - ${existingAccounts} cuentas (accounts)`);
    console.log(`   - ${existingGuardias} guardias`);
    console.log(`\n   Este script creará registros ADICIONALES.`);
    console.log(`   Si quieres una carga limpia, borra los datos primero.\n`);
  }

  // Verificar que los archivos existan
  const requiredFiles = [
    "Clientes Activos.csv",
    "Clientes Inactivos.csv",
    "ControlRoll Instalación Activos Feb 13 2026.csv",
    "FCM Instalación(Inactivos)_13-02-2026-01-27.csv",
    "Reporte Colaboradores.csv",
  ];
  for (const f of requiredFiles) {
    const fp = path.join(DATA_DIR, f);
    if (!fs.existsSync(fp)) {
      console.error(`❌ Archivo requerido no encontrado: ${fp}`);
      process.exit(1);
    }
  }
  console.log("✅ Todos los archivos CSV encontrados\n");

  // ─── Paso 1: Clientes ───
  const { codeToId: clientCodeToId, codeToActive: clientCodeToActive } = await loadClients();

  // ─── Paso 2: Instalaciones ───
  const cecosToId = await loadInstallations(clientCodeToId, clientCodeToActive);

  // ─── Paso 3: Guardias ───
  const guardResult = await loadGuards(cecosToId);

  // ─── Resumen Final ───
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║              RESUMEN DE MIGRACIÓN               ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  Clientes cargados:      ${String(clientCodeToId.size).padStart(4)}                    ║`);
  console.log(`║  Instalaciones cargadas: ${String(cecosToId.size).padStart(4)}                    ║`);
  console.log(`║  Guardias activos:       ${String(guardResult.activeCount).padStart(4)}                    ║`);
  console.log(`║  Guardias inactivos:     ${String(guardResult.inactiveCount).padStart(4)}                    ║`);
  console.log(`║  Cuentas bancarias:      ${String(guardResult.bankCount).padStart(4)}                    ║`);
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("🎉 ¡Migración completada exitosamente!");
}

main()
  .catch((e) => {
    console.error("\n❌ Error durante la migración:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
