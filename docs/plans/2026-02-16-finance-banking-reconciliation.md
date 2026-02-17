# Finance Banking & Reconciliation Suite — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the missing banking, bank statement import, bank transactions, DTE received, supplier payments, and bank reconciliation modules — completing the finance suite.

**Architecture:** Each module follows the existing pattern: Zod validation schema → API route (auth + permissions + Prisma) → Service layer (business logic) → Server page component (data fetching) → Client component (responsive UI with mobile cards + desktop tables). All Prisma models already exist in the schema; we only need APIs, services, validations, and frontend.

**Tech Stack:** Next.js 15 App Router, TypeScript 5.6, Prisma 6.x, PostgreSQL, shadcn/ui, Tailwind CSS, Zod, lucide-react, sonner (toast), openpyxl-style Excel parsing via `xlsx` npm package.

**Cartola Santander Format (reference):**
- Rows 0-12: Header (account info, balances, column headers)
- Row 12: Column headers → MONTO | DESCRIPCIÓN MOVIMIENTO | (empty) | FECHA | N° DOCUMENTO | SUCURSAL | (empty) | CARGO/ABONO
- Rows 13-247: Transaction data
- Row 248+: "Saldos diarios" footer section
- Amounts are negative for CARGO (debits), positive for ABONO (credits)
- Dates format: DD/MM/YYYY
- CARGO/ABONO column: "C" = cargo (debit), "A" = abono (credit)

---

## Task 1: Zod Validation Schemas

**Files:**
- Modify: `src/lib/validations/finance.ts`

**Step 1: Add bank account, bank transaction, payment record, and reconciliation schemas**

Append to `src/lib/validations/finance.ts`:

```typescript
// ── Bank Accounts ──

export const createBankAccountSchema = z.object({
  bankCode: z.string().trim().min(1).max(10),
  bankName: z.string().trim().min(1).max(100),
  accountType: z.enum(["CHECKING", "SAVINGS", "VISTA"]),
  accountNumber: z.string().trim().min(1).max(30),
  currency: z.enum(["CLP", "USD", "UF"]).optional(),
  holderName: z.string().trim().min(1).max(200),
  holderRut: z.string().trim().min(8).max(12),
  accountPlanId: optNull(z.string().uuid()),
  isDefault: z.boolean().optional(),
});

export const updateBankAccountSchema = createBankAccountSchema.partial();

// ── Bank Transactions (manual entry) ──

export const createBankTransactionSchema = z.object({
  bankAccountId: z.string().uuid(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  description: z.string().trim().min(1).max(500),
  reference: optNull(z.string().trim().max(100)),
  amount: z.number(),
  balance: z.number().optional(),
  category: optNull(z.string().trim().max(50)),
  source: z.enum(["API", "MANUAL", "CSV_IMPORT"]).optional(),
});

// ── Bank Statement Import ──

export const importBankStatementSchema = z.object({
  bankAccountId: z.string().uuid(),
  bankFormat: z.enum(["SANTANDER"]),
  transactions: z.array(z.object({
    transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(1),
    reference: optNull(z.string().trim().max(100)),
    amount: z.number(),
    balance: z.number().optional(),
  })).min(1, "Debe incluir al menos una transacción"),
});

// ── DTE Received (purchase invoices) ──

export const registerReceivedDteSchema = z.object({
  dteType: z.number().int().refine((v) => [33, 34, 56, 61].includes(v), {
    message: "Tipo de DTE recibido inválido",
  }),
  folio: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: optNull(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  issuerRut: z.string().trim().min(8).max(12),
  issuerName: z.string().trim().min(1).max(200),
  netAmount: z.number().min(0),
  exemptAmount: z.number().min(0).optional(),
  taxAmount: z.number().min(0),
  totalAmount: z.number().min(0),
  supplierId: optNull(z.string().uuid()),
  accountId: optNull(z.string().uuid()),
  notes: optNull(z.string().trim().max(1000)),
  receptionStatus: z.enum(["PENDING_REVIEW", "ACCEPTED", "CLAIMED", "PARTIAL_CLAIM"]).optional(),
});

// ── Payment Records (supplier payments / customer collections) ──

export const createPaymentRecordSchema = z.object({
  type: z.enum(["COLLECTION", "DISBURSEMENT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  currency: z.enum(["CLP", "USD", "UF"]).optional(),
  paymentMethod: z.enum(["TRANSFER", "CHECK", "CASH", "CREDIT_CARD", "FACTORING", "COMPENSATION", "OTHER"]),
  bankAccountId: optNull(z.string().uuid()),
  checkNumber: optNull(z.string().trim().max(30)),
  transferReference: optNull(z.string().trim().max(100)),
  supplierId: optNull(z.string().uuid()),
  notes: optNull(z.string().trim().max(500)),
  allocations: z.array(z.object({
    dteId: z.string().uuid(),
    amount: z.number().positive(),
  })).optional(),
});

// ── Reconciliation ──

export const createReconciliationSchema = z.object({
  bankAccountId: z.string().uuid(),
  periodYear: z.number().int().min(2020).max(2099),
  periodMonth: z.number().int().min(1).max(12),
  bankBalance: z.number(),
  bookBalance: z.number(),
});

export const reconciliationMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  paymentRecordId: optNull(z.string().uuid()),
  journalEntryId: optNull(z.string().uuid()),
  matchType: z.enum(["AUTO", "MANUAL"]),
});
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -i "validations/finance" | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/validations/finance.ts
git commit -m "feat(finance): add Zod schemas for banking, DTE received, payments, reconciliation"
```

---

## Task 2: Bank Account API + Service

**Files:**
- Create: `src/modules/finance/banking/bank-account.service.ts`
- Create: `src/app/api/finance/banking/accounts/route.ts`
- Create: `src/app/api/finance/banking/accounts/[id]/route.ts`

**Step 1: Create bank account service**

Create `src/modules/finance/banking/bank-account.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import type { FinanceBankAccountType, FinanceCurrency } from "@prisma/client";

interface CreateBankAccountInput {
  bankCode: string;
  bankName: string;
  accountType: FinanceBankAccountType;
  accountNumber: string;
  currency?: FinanceCurrency;
  holderName: string;
  holderRut: string;
  accountPlanId?: string;
  isDefault?: boolean;
}

export async function listBankAccounts(tenantId: string) {
  return prisma.financeBankAccount.findMany({
    where: { tenantId },
    include: { accountPlan: { select: { id: true, code: true, name: true } } },
    orderBy: { bankName: "asc" },
  });
}

export async function getBankAccount(tenantId: string, id: string) {
  return prisma.financeBankAccount.findFirst({
    where: { tenantId, id },
    include: {
      accountPlan: { select: { id: true, code: true, name: true } },
      transactions: { orderBy: { transactionDate: "desc" }, take: 10 },
    },
  });
}

export async function createBankAccount(tenantId: string, data: CreateBankAccountInput) {
  if (data.isDefault) {
    await prisma.financeBankAccount.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
  }
  return prisma.financeBankAccount.create({
    data: { tenantId, ...data },
  });
}

export async function updateBankAccount(tenantId: string, id: string, data: Partial<CreateBankAccountInput>) {
  if (data.isDefault) {
    await prisma.financeBankAccount.updateMany({
      where: { tenantId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }
  return prisma.financeBankAccount.update({
    where: { id },
    data,
  });
}

export async function deleteBankAccount(tenantId: string, id: string) {
  const txCount = await prisma.financeBankTransaction.count({
    where: { bankAccountId: id },
  });
  if (txCount > 0) {
    throw new Error("No se puede eliminar una cuenta con movimientos asociados");
  }
  return prisma.financeBankAccount.delete({ where: { id } });
}
```

**Step 2: Create bank accounts list/create API route**

Create `src/app/api/finance/banking/accounts/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createBankAccountSchema } from "@/lib/validations/finance";
import { listBankAccounts, createBankAccount } from "@/modules/finance/banking/bank-account.service";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const data = await listBankAccounts(ctx.tenantId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Banking] Error listing accounts:", error);
    return NextResponse.json({ success: false, error: "Error al listar cuentas bancarias" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createBankAccountSchema);
    if (parsed.error) return parsed.error;
    const account = await createBankAccount(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: account }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Banking] Error creating account:", error);
    return NextResponse.json({ success: false, error: "Error al crear cuenta bancaria" }, { status: 500 });
  }
}
```

**Step 3: Create bank account [id] route**

Create `src/app/api/finance/banking/accounts/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { updateBankAccountSchema } from "@/lib/validations/finance";
import { getBankAccount, updateBankAccount, deleteBankAccount } from "@/modules/finance/banking/bank-account.service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const account = await getBankAccount(ctx.tenantId, id);
    if (!account) {
      return NextResponse.json({ success: false, error: "Cuenta no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[Finance/Banking] Error getting account:", error);
    return NextResponse.json({ success: false, error: "Error al obtener cuenta" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, updateBankAccountSchema);
    if (parsed.error) return parsed.error;
    const account = await updateBankAccount(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("[Finance/Banking] Error updating account:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar cuenta" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    await deleteBankAccount(ctx.tenantId, id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al eliminar cuenta";
    console.error("[Finance/Banking] Error deleting account:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
```

**Step 4: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -i "banking" | head -10`
Expected: No errors

**Step 5: Commit**

```bash
git add src/modules/finance/banking/ src/app/api/finance/banking/
git commit -m "feat(finance): add bank account CRUD API + service"
```

---

## Task 3: Bank Statement Import (Santander Parser + API)

**Files:**
- Create: `src/modules/finance/banking/santander-parser.ts`
- Create: `src/modules/finance/banking/bank-transaction.service.ts`
- Create: `src/app/api/finance/banking/transactions/route.ts`
- Create: `src/app/api/finance/banking/transactions/import/route.ts`

**Step 1: Create Santander cartola parser**

Create `src/modules/finance/banking/santander-parser.ts`:

```typescript
/**
 * Parser for Banco Santander "Cartola Provisoria" Excel format.
 *
 * Expected structure:
 * - Rows 0-12: Header section (account info, balances, column headers)
 * - Row 12: MONTO | DESCRIPCIÓN MOVIMIENTO | (empty) | FECHA | N° DOCUMENTO | SUCURSAL | (empty) | CARGO/ABONO
 * - Rows 13+: Transaction data until "Saldos diarios" section
 * - Amounts are negative for CARGO (debits), raw numbers (no formatting)
 * - Dates: DD/MM/YYYY format
 * - CARGO/ABONO column (index 7): "C" = cargo, "A" = abono
 */

export interface ParsedBankTransaction {
  transactionDate: string; // YYYY-MM-DD
  description: string;
  reference: string | null;
  amount: number; // positive for abono, negative for cargo
  branch: string | null;
}

export interface ParsedBankStatement {
  accountNumber: string | null;
  currency: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  openingBalance: number | null;
  closingBalance: number | null;
  transactions: ParsedBankTransaction[];
}

export function parseSantanderCartola(rows: (string | number | null)[][]): ParsedBankStatement {
  const result: ParsedBankStatement = {
    accountNumber: null,
    currency: null,
    periodFrom: null,
    periodTo: null,
    openingBalance: null,
    closingBalance: null,
    transactions: [],
  };

  // Parse header info (rows 6-10)
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const cell0 = String(row[0] ?? "").trim();
    const cell1 = String(row[1] ?? "").trim();
    const cell2 = String(row[2] ?? "").trim();
    const cell3 = String(row[3] ?? "").trim();

    if (cell0.startsWith("Cuenta")) {
      // "Cuenta 0-000-9454115-8"
      const match = cell0.match(/Cuenta\s+([\d\-]+)/);
      if (match) result.accountNumber = match[1];
    }
    if (cell2.startsWith("Moneda:")) {
      result.currency = cell2.replace("Moneda:", "").trim();
    }
    if (cell2.includes("Fecha desde:")) {
      result.periodFrom = parseSantanderDate(cell2.replace("Fecha desde:", "").trim());
    }
    if (cell3.includes("Fecha hasta:")) {
      result.periodTo = parseSantanderDate(cell3.replace("Fecha hasta:", "").trim());
    }
    if (cell0 === "SALDO INICIAL") {
      // Next row has the values
      const valRow = rows[i + 1];
      if (valRow) {
        result.openingBalance = toNumber(valRow[0]);
        result.closingBalance = toNumber(valRow[3]);
      }
    }
  }

  // Find transaction start (row after "MONTO" header)
  let txStart = -1;
  for (let i = 0; i < rows.length; i++) {
    const cell0 = String(rows[i]?.[0] ?? "").trim();
    if (cell0 === "MONTO") {
      txStart = i + 1;
      break;
    }
  }

  if (txStart === -1) return result;

  // Parse transactions until "Saldos diarios" section
  for (let i = txStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const cell0 = String(row[0] ?? "").trim();
    // Stop at footer section
    if (cell0 === "Saldos diarios" || cell0 === "") break;

    const amount = toNumber(row[0]);
    if (amount === null) continue;

    const description = String(row[1] ?? "").trim();
    const dateRaw = String(row[3] ?? "").trim();
    const reference = row[4] ? String(row[4]).trim() : null;
    const branch = row[5] ? String(row[5]).trim() : null;

    const transactionDate = parseSantanderDate(dateRaw);
    if (!transactionDate || !description) continue;

    result.transactions.push({
      transactionDate,
      description,
      reference: reference === "000000000" ? null : reference,
      amount, // already negative for cargos from source
      branch,
    });
  }

  return result;
}

function parseSantanderDate(raw: string): string | null {
  // DD/MM/YYYY → YYYY-MM-DD
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function toNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const n = typeof val === "number" ? val : Number(String(val).replace(/[^\d\-.,]/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}
```

**Step 2: Create bank transaction service**

Create `src/modules/finance/banking/bank-transaction.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import type { FinanceBankTxSource } from "@prisma/client";

interface CreateTxInput {
  bankAccountId: string;
  transactionDate: string;
  description: string;
  reference?: string | null;
  amount: number;
  balance?: number | null;
  category?: string | null;
  source?: FinanceBankTxSource;
}

export async function listBankTransactions(
  tenantId: string,
  bankAccountId: string,
  opts: { dateFrom?: string; dateTo?: string; page?: number; pageSize?: number } = {}
) {
  const { dateFrom, dateTo, page = 1, pageSize = 50 } = opts;
  const where: Record<string, unknown> = { tenantId, bankAccountId };
  if (dateFrom || dateTo) {
    where.transactionDate = {};
    if (dateFrom) (where.transactionDate as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.transactionDate as Record<string, unknown>).lte = new Date(dateTo);
  }

  const [transactions, total] = await Promise.all([
    prisma.financeBankTransaction.findMany({
      where,
      orderBy: { transactionDate: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.financeBankTransaction.count({ where }),
  ]);

  return { transactions, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function importBankTransactions(
  tenantId: string,
  bankAccountId: string,
  transactions: CreateTxInput[]
) {
  const created = await prisma.financeBankTransaction.createMany({
    data: transactions.map((tx) => ({
      tenantId,
      bankAccountId,
      transactionDate: new Date(tx.transactionDate),
      description: tx.description,
      reference: tx.reference ?? null,
      amount: tx.amount,
      balance: tx.balance ?? null,
      category: tx.category ?? null,
      source: tx.source ?? "CSV_IMPORT",
    })),
  });

  // Update bank account balance with latest transaction
  if (transactions.length > 0) {
    const lastTx = transactions[transactions.length - 1];
    if (lastTx.balance != null) {
      await prisma.financeBankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: lastTx.balance, balanceUpdatedAt: new Date() },
      });
    }
  }

  return { importedCount: created.count };
}

export async function createBankTransaction(tenantId: string, data: CreateTxInput) {
  return prisma.financeBankTransaction.create({
    data: {
      tenantId,
      bankAccountId: data.bankAccountId,
      transactionDate: new Date(data.transactionDate),
      description: data.description,
      reference: data.reference ?? null,
      amount: data.amount,
      balance: data.balance ?? null,
      category: data.category ?? null,
      source: data.source ?? "MANUAL",
    },
  });
}
```

**Step 3: Create transactions list/create API**

Create `src/app/api/finance/banking/transactions/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createBankTransactionSchema } from "@/lib/validations/finance";
import { listBankTransactions, createBankTransaction } from "@/modules/finance/banking/bank-transaction.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const url = new URL(request.url);
    const bankAccountId = url.searchParams.get("bankAccountId");
    if (!bankAccountId) {
      return NextResponse.json({ success: false, error: "bankAccountId requerido" }, { status: 400 });
    }
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");

    const result = await listBankTransactions(ctx.tenantId, bankAccountId, { dateFrom, dateTo, page, pageSize });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking] Error listing transactions:", error);
    return NextResponse.json({ success: false, error: "Error al listar movimientos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createBankTransactionSchema);
    if (parsed.error) return parsed.error;
    const tx = await createBankTransaction(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: tx }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Banking] Error creating transaction:", error);
    return NextResponse.json({ success: false, error: "Error al crear movimiento" }, { status: 500 });
  }
}
```

**Step 4: Create import API endpoint**

Create `src/app/api/finance/banking/transactions/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { importBankTransactions } from "@/modules/finance/banking/bank-transaction.service";
import { parseSantanderCartola } from "@/modules/finance/banking/santander-parser";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const bankAccountId = formData.get("bankAccountId") as string | null;
    const bankFormat = formData.get("bankFormat") as string | null;

    if (!file || !bankAccountId) {
      return NextResponse.json(
        { success: false, error: "Archivo y cuenta bancaria requeridos" },
        { status: 400 }
      );
    }

    // Read Excel file
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
    });

    // Parse based on bank format
    let transactions: { transactionDate: string; description: string; reference: string | null; amount: number; balance?: number | null }[];

    if (bankFormat === "SANTANDER" || !bankFormat) {
      const parsed = parseSantanderCartola(rows);
      transactions = parsed.transactions;
    } else {
      return NextResponse.json(
        { success: false, error: `Formato de banco '${bankFormat}' no soportado` },
        { status: 400 }
      );
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No se encontraron transacciones en el archivo" },
        { status: 400 }
      );
    }

    const result = await importBankTransactions(
      ctx.tenantId,
      bankAccountId,
      transactions.map((tx) => ({
        bankAccountId,
        ...tx,
        source: "CSV_IMPORT" as const,
      }))
    );

    return NextResponse.json({
      success: true,
      data: {
        importedCount: result.importedCount,
        totalInFile: transactions.length,
      },
    });
  } catch (error) {
    console.error("[Finance/Banking] Error importing statement:", error);
    return NextResponse.json(
      { success: false, error: "Error al importar cartola" },
      { status: 500 }
    );
  }
}
```

**Step 5: Install xlsx dependency**

Run: `npm install xlsx`

**Step 6: Verify TypeScript**

Run: `npx tsc --noEmit 2>&1 | grep -i "banking\|santander\|xlsx" | head -10`
Expected: No errors

**Step 7: Commit**

```bash
git add src/modules/finance/banking/ src/app/api/finance/banking/transactions/ package.json package-lock.json
git commit -m "feat(finance): add bank transaction service, Santander parser, import API"
```

---

## Task 4: DTE Received API + Service

**Files:**
- Create: `src/modules/finance/billing/dte-received.service.ts`
- Create: `src/app/api/finance/billing/received/route.ts`
- Create: `src/app/api/finance/billing/received/[id]/route.ts`

**Step 1: Create DTE received service**

Create `src/modules/finance/billing/dte-received.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import type { FinanceDteReceptionStatus } from "@prisma/client";

interface RegisterReceivedDteInput {
  dteType: number;
  folio: number;
  date: string;
  dueDate?: string;
  issuerRut: string;
  issuerName: string;
  netAmount: number;
  exemptAmount?: number;
  taxAmount: number;
  totalAmount: number;
  supplierId?: string;
  accountId?: string;
  notes?: string;
  receptionStatus?: FinanceDteReceptionStatus;
}

export async function listReceivedDtes(
  tenantId: string,
  opts: { page?: number; pageSize?: number; supplierId?: string } = {}
) {
  const { page = 1, pageSize = 50, supplierId } = opts;
  const where: Record<string, unknown> = { tenantId, direction: "RECEIVED" };
  if (supplierId) where.supplierId = supplierId;

  const [dtes, total] = await Promise.all([
    prisma.financeDte.findMany({
      where,
      include: { supplier: { select: { id: true, name: true, rut: true } }, lines: true },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.financeDte.count({ where }),
  ]);

  return { dtes, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function registerReceivedDte(tenantId: string, userId: string, data: RegisterReceivedDteInput) {
  // Generate a unique code for received DTEs
  const count = await prisma.financeDte.count({ where: { tenantId, direction: "RECEIVED" } });
  const code = `RCV-${String(count + 1).padStart(6, "0")}`;

  return prisma.financeDte.create({
    data: {
      tenantId,
      direction: "RECEIVED",
      dteType: data.dteType,
      folio: data.folio,
      code,
      date: new Date(data.date),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      issuerRut: data.issuerRut,
      issuerName: data.issuerName,
      receiverRut: "", // will be filled from tenant config
      receiverName: "",
      netAmount: data.netAmount,
      exemptAmount: data.exemptAmount ?? 0,
      taxRate: 19,
      taxAmount: data.taxAmount,
      totalAmount: data.totalAmount,
      currency: "CLP",
      supplierId: data.supplierId ?? null,
      accountId: data.accountId ?? null,
      siiStatus: "ACCEPTED", // received DTEs are already accepted by SII
      receptionStatus: data.receptionStatus ?? "PENDING_REVIEW",
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: data.totalAmount,
      notes: data.notes ?? null,
      createdBy: userId,
    },
  });
}

export async function updateReceivedDte(tenantId: string, id: string, data: Partial<RegisterReceivedDteInput>) {
  return prisma.financeDte.update({
    where: { id },
    data: {
      ...(data.dueDate && { dueDate: new Date(data.dueDate) }),
      ...(data.supplierId !== undefined && { supplierId: data.supplierId }),
      ...(data.accountId !== undefined && { accountId: data.accountId }),
      ...(data.receptionStatus && { receptionStatus: data.receptionStatus }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}
```

**Step 2: Create received DTE API routes**

Create `src/app/api/finance/billing/received/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { registerReceivedDteSchema } from "@/lib/validations/finance";
import { listReceivedDtes, registerReceivedDte } from "@/modules/finance/billing/dte-received.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");
    const supplierId = url.searchParams.get("supplierId") || undefined;
    const result = await listReceivedDtes(ctx.tenantId, { page, pageSize, supplierId });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Billing] Error listing received DTEs:", error);
    return NextResponse.json({ success: false, error: "Error al listar DTEs recibidos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, registerReceivedDteSchema);
    if (parsed.error) return parsed.error;
    const dte = await registerReceivedDte(ctx.tenantId, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: dte }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Billing] Error registering received DTE:", error);
    return NextResponse.json({ success: false, error: "Error al registrar DTE recibido" }, { status: 500 });
  }
}
```

Create `src/app/api/finance/billing/received/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { registerReceivedDteSchema } from "@/lib/validations/finance";
import { updateReceivedDte } from "@/modules/finance/billing/dte-received.service";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const dte = await prisma.financeDte.findFirst({
      where: { id, tenantId: ctx.tenantId, direction: "RECEIVED" },
      include: { supplier: true, lines: true },
    });
    if (!dte) return NextResponse.json({ success: false, error: "DTE no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: dte });
  } catch (error) {
    console.error("[Finance/Billing] Error getting received DTE:", error);
    return NextResponse.json({ success: false, error: "Error al obtener DTE" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, registerReceivedDteSchema.partial());
    if (parsed.error) return parsed.error;
    const dte = await updateReceivedDte(ctx.tenantId, id, parsed.data);
    return NextResponse.json({ success: true, data: dte });
  } catch (error) {
    console.error("[Finance/Billing] Error updating received DTE:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar DTE" }, { status: 500 });
  }
}
```

**Step 3: Verify TypeScript + Commit**

Run: `npx tsc --noEmit 2>&1 | grep -i "received\|dte-received" | head -10`

```bash
git add src/modules/finance/billing/dte-received.service.ts src/app/api/finance/billing/received/
git commit -m "feat(finance): add DTE received (purchase invoices) API + service"
```

---

## Task 5: Payment Records API + Service

**Files:**
- Create: `src/modules/finance/banking/payment-record.service.ts`
- Create: `src/app/api/finance/banking/payments/route.ts`
- Create: `src/app/api/finance/banking/payments/[id]/route.ts`

**Step 1: Create payment record service**

Create `src/modules/finance/banking/payment-record.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import type { FinancePaymentRecordType, FinancePaymentMethod, FinanceCurrency } from "@prisma/client";

interface CreatePaymentInput {
  type: FinancePaymentRecordType;
  date: string;
  amount: number;
  currency?: FinanceCurrency;
  paymentMethod: FinancePaymentMethod;
  bankAccountId?: string;
  checkNumber?: string;
  transferReference?: string;
  supplierId?: string;
  notes?: string;
  allocations?: { dteId: string; amount: number }[];
}

export async function listPaymentRecords(
  tenantId: string,
  opts: { type?: string; page?: number; pageSize?: number; dateFrom?: string; dateTo?: string } = {}
) {
  const { type, page = 1, pageSize = 50, dateFrom, dateTo } = opts;
  const where: Record<string, unknown> = { tenantId };
  if (type) where.type = type;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo);
  }

  const [records, total] = await Promise.all([
    prisma.financePaymentRecord.findMany({
      where,
      include: {
        bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
        supplier: { select: { id: true, name: true, rut: true } },
        allocations: { include: { dte: { select: { id: true, dteType: true, folio: true, totalAmount: true } } } },
      },
      orderBy: { date: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.financePaymentRecord.count({ where }),
  ]);

  return { records, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function createPaymentRecord(tenantId: string, userId: string, data: CreatePaymentInput) {
  // Generate code
  const count = await prisma.financePaymentRecord.count({ where: { tenantId } });
  const prefix = data.type === "DISBURSEMENT" ? "PAG" : "COB";
  const code = `${prefix}-${String(count + 1).padStart(6, "0")}`;

  return prisma.$transaction(async (tx) => {
    const record = await tx.financePaymentRecord.create({
      data: {
        tenantId,
        code,
        type: data.type,
        date: new Date(data.date),
        amount: data.amount,
        currency: data.currency ?? "CLP",
        paymentMethod: data.paymentMethod,
        bankAccountId: data.bankAccountId ?? null,
        checkNumber: data.checkNumber ?? null,
        transferReference: data.transferReference ?? null,
        supplierId: data.supplierId ?? null,
        notes: data.notes ?? null,
        createdBy: userId,
        status: "PENDING",
      },
    });

    // Create allocations to DTEs if provided
    if (data.allocations?.length) {
      await tx.financePaymentAllocation.createMany({
        data: data.allocations.map((alloc) => ({
          paymentId: record.id,
          dteId: alloc.dteId,
          amount: alloc.amount,
        })),
      });

      // Update DTE payment status
      for (const alloc of data.allocations) {
        const dte = await tx.financeDte.findUnique({
          where: { id: alloc.dteId },
          select: { totalAmount: true, amountPaid: true },
        });
        if (dte) {
          const newPaid = dte.amountPaid.toNumber() + alloc.amount;
          const total = dte.totalAmount.toNumber();
          await tx.financeDte.update({
            where: { id: alloc.dteId },
            data: {
              amountPaid: newPaid,
              amountPending: total - newPaid,
              paymentStatus: newPaid >= total ? "PAID" : "PARTIAL",
            },
          });
        }
      }
    }

    return record;
  });
}

export async function confirmPayment(tenantId: string, id: string) {
  return prisma.financePaymentRecord.update({
    where: { id },
    data: { status: "CONFIRMED" },
  });
}

export async function cancelPayment(tenantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.financePaymentRecord.findFirst({
      where: { id, tenantId },
      include: { allocations: true },
    });
    if (!record) throw new Error("Pago no encontrado");

    // Reverse DTE allocations
    for (const alloc of record.allocations) {
      const dte = await tx.financeDte.findUnique({
        where: { id: alloc.dteId },
        select: { totalAmount: true, amountPaid: true },
      });
      if (dte) {
        const newPaid = Math.max(0, dte.amountPaid.toNumber() - alloc.amount.toNumber());
        const total = dte.totalAmount.toNumber();
        await tx.financeDte.update({
          where: { id: alloc.dteId },
          data: {
            amountPaid: newPaid,
            amountPending: total - newPaid,
            paymentStatus: newPaid === 0 ? "UNPAID" : "PARTIAL",
          },
        });
      }
    }

    // Delete allocations and cancel payment
    await tx.financePaymentAllocation.deleteMany({ where: { paymentId: id } });
    return tx.financePaymentRecord.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  });
}
```

**Step 2: Create payment record API routes**

Create `src/app/api/finance/banking/payments/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createPaymentRecordSchema } from "@/lib/validations/finance";
import { listPaymentRecords, createPaymentRecord } from "@/modules/finance/banking/payment-record.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = parseInt(url.searchParams.get("pageSize") || "50");
    const result = await listPaymentRecords(ctx.tenantId, { type, dateFrom, dateTo, page, pageSize });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Payments] Error listing records:", error);
    return NextResponse.json({ success: false, error: "Error al listar pagos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createPaymentRecordSchema);
    if (parsed.error) return parsed.error;
    const record = await createPaymentRecord(ctx.tenantId, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Payments] Error creating record:", error);
    return NextResponse.json({ success: false, error: "Error al crear pago" }, { status: 500 });
  }
}
```

Create `src/app/api/finance/banking/payments/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { confirmPayment, cancelPayment } from "@/modules/finance/banking/payment-record.service";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const record = await prisma.financePaymentRecord.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        bankAccount: true,
        supplier: true,
        allocations: { include: { dte: true } },
      },
    });
    if (!record) return NextResponse.json({ success: false, error: "Pago no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("[Finance/Payments] Error getting record:", error);
    return NextResponse.json({ success: false, error: "Error al obtener pago" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    const action = body.action as string;

    if (action === "confirm") {
      const record = await confirmPayment(ctx.tenantId, id);
      return NextResponse.json({ success: true, data: record });
    } else if (action === "cancel") {
      const record = await cancelPayment(ctx.tenantId, id);
      return NextResponse.json({ success: true, data: record });
    }

    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error al actualizar pago";
    console.error("[Finance/Payments] Error updating record:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
```

**Step 3: Verify TypeScript + Commit**

```bash
npx tsc --noEmit 2>&1 | grep -i "payment-record\|banking/payments" | head -10
git add src/modules/finance/banking/payment-record.service.ts src/app/api/finance/banking/payments/
git commit -m "feat(finance): add payment records CRUD with DTE allocation"
```

---

## Task 6: Reconciliation API + Service

**Files:**
- Create: `src/modules/finance/banking/reconciliation.service.ts`
- Create: `src/app/api/finance/banking/reconciliation/route.ts`
- Create: `src/app/api/finance/banking/reconciliation/[id]/route.ts`
- Create: `src/app/api/finance/banking/reconciliation/[id]/match/route.ts`

**Step 1: Create reconciliation service**

Create `src/modules/finance/banking/reconciliation.service.ts`:

```typescript
import { prisma } from "@/lib/prisma";

export async function listReconciliations(tenantId: string, bankAccountId?: string) {
  const where: Record<string, unknown> = { tenantId };
  if (bankAccountId) where.bankAccountId = bankAccountId;

  return prisma.financeReconciliation.findMany({
    where,
    include: {
      bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
      _count: { select: { matches: true } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });
}

export async function getReconciliation(tenantId: string, id: string) {
  return prisma.financeReconciliation.findFirst({
    where: { id, tenantId },
    include: {
      bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
      matches: {
        include: {
          bankTransaction: true,
          paymentRecord: { select: { id: true, code: true, amount: true, date: true } },
          journalEntry: { select: { id: true, number: true, description: true } },
        },
      },
    },
  });
}

export async function createReconciliation(
  tenantId: string,
  data: { bankAccountId: string; periodYear: number; periodMonth: number; bankBalance: number; bookBalance: number }
) {
  return prisma.financeReconciliation.create({
    data: {
      tenantId,
      bankAccountId: data.bankAccountId,
      periodYear: data.periodYear,
      periodMonth: data.periodMonth,
      bankBalance: data.bankBalance,
      bookBalance: data.bookBalance,
      difference: data.bankBalance - data.bookBalance,
      status: "IN_PROGRESS",
    },
  });
}

export async function addReconciliationMatch(
  reconciliationId: string,
  userId: string,
  data: { bankTransactionId: string; paymentRecordId?: string; journalEntryId?: string; matchType: "AUTO" | "MANUAL" }
) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.financeReconciliationMatch.create({
      data: {
        reconciliationId,
        bankTransactionId: data.bankTransactionId,
        paymentRecordId: data.paymentRecordId ?? null,
        journalEntryId: data.journalEntryId ?? null,
        matchType: data.matchType,
        createdBy: userId,
      },
    });

    // Update bank transaction status
    await tx.financeBankTransaction.update({
      where: { id: data.bankTransactionId },
      data: {
        reconciliationStatus: "MATCHED",
        reconciliationId,
      },
    });

    // Recalculate difference
    const allMatches = await tx.financeReconciliationMatch.count({
      where: { reconciliationId },
    });
    const reconc = await tx.financeReconciliation.findUnique({
      where: { id: reconciliationId },
    });

    if (reconc) {
      const unmatchedTxs = await tx.financeBankTransaction.findMany({
        where: {
          bankAccountId: reconc.bankAccountId,
          reconciliationStatus: "UNMATCHED",
          transactionDate: {
            gte: new Date(reconc.periodYear, reconc.periodMonth - 1, 1),
            lt: new Date(reconc.periodYear, reconc.periodMonth, 1),
          },
        },
        select: { amount: true },
      });
      const unmatchedTotal = unmatchedTxs.reduce((sum, t) => sum + t.amount.toNumber(), 0);

      await tx.financeReconciliation.update({
        where: { id: reconciliationId },
        data: { difference: unmatchedTotal },
      });
    }

    return match;
  });
}

export async function completeReconciliation(tenantId: string, id: string, userId: string) {
  return prisma.financeReconciliation.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedBy: userId,
      completedAt: new Date(),
    },
  });
}

export async function getUnmatchedTransactions(tenantId: string, bankAccountId: string, year: number, month: number) {
  return prisma.financeBankTransaction.findMany({
    where: {
      tenantId,
      bankAccountId,
      reconciliationStatus: "UNMATCHED",
      transactionDate: {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      },
    },
    orderBy: { transactionDate: "asc" },
  });
}
```

**Step 2: Create reconciliation API routes**

Create `src/app/api/finance/banking/reconciliation/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { createReconciliationSchema } from "@/lib/validations/finance";
import { listReconciliations, createReconciliation } from "@/modules/finance/banking/reconciliation.service";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const bankAccountId = new URL(request.url).searchParams.get("bankAccountId") || undefined;
    const data = await listReconciliations(ctx.tenantId, bankAccountId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error listing:", error);
    return NextResponse.json({ success: false, error: "Error al listar conciliaciones" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const parsed = await parseBody(request, createReconciliationSchema);
    if (parsed.error) return parsed.error;
    const rec = await createReconciliation(ctx.tenantId, parsed.data);
    return NextResponse.json({ success: true, data: rec }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error creating:", error);
    return NextResponse.json({ success: false, error: "Error al crear conciliación" }, { status: 500 });
  }
}
```

Create `src/app/api/finance/banking/reconciliation/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { getReconciliation, completeReconciliation, getUnmatchedTransactions } from "@/modules/finance/banking/reconciliation.service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "finance")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const rec = await getReconciliation(ctx.tenantId, id);
    if (!rec) return NextResponse.json({ success: false, error: "Conciliación no encontrada" }, { status: 404 });

    // Also get unmatched transactions for this period
    const unmatched = await getUnmatchedTransactions(
      ctx.tenantId, rec.bankAccountId, rec.periodYear, rec.periodMonth
    );

    return NextResponse.json({ success: true, data: { ...rec, unmatchedTransactions: unmatched } });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error getting:", error);
    return NextResponse.json({ success: false, error: "Error al obtener conciliación" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const body = await request.json();
    if (body.action === "complete") {
      const rec = await completeReconciliation(ctx.tenantId, id, ctx.userId);
      return NextResponse.json({ success: true, data: rec });
    }
    return NextResponse.json({ success: false, error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error updating:", error);
    return NextResponse.json({ success: false, error: "Error al actualizar conciliación" }, { status: 500 });
  }
}
```

Create `src/app/api/finance/banking/reconciliation/[id]/match/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { reconciliationMatchSchema } from "@/lib/validations/finance";
import { addReconciliationMatch } from "@/modules/finance/banking/reconciliation.service";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }
    const { id } = await params;
    const parsed = await parseBody(request, reconciliationMatchSchema);
    if (parsed.error) return parsed.error;
    const match = await addReconciliationMatch(id, ctx.userId, parsed.data);
    return NextResponse.json({ success: true, data: match }, { status: 201 });
  } catch (error) {
    console.error("[Finance/Reconciliation] Error matching:", error);
    return NextResponse.json({ success: false, error: "Error al conciliar movimiento" }, { status: 500 });
  }
}
```

**Step 3: Verify TypeScript + Commit**

```bash
npx tsc --noEmit 2>&1 | grep -i "reconcil" | head -10
git add src/modules/finance/banking/reconciliation.service.ts src/app/api/finance/banking/reconciliation/
git commit -m "feat(finance): add bank reconciliation API + service"
```

---

## Task 7: FinanceSubnav — Add "Bancos" navigation item

**Files:**
- Modify: `src/components/finance/FinanceSubnav.tsx`

**Step 1: Add Bancos nav item**

In `src/components/finance/FinanceSubnav.tsx`, add `Landmark` to the lucide-react import and add the new nav item after "Proveedores":

```typescript
// Add to imports:
import { ..., Landmark } from "lucide-react";

// Add to FINANCE_ITEMS array (after Proveedores):
{ href: "/finanzas/bancos", label: "Bancos", icon: Landmark, subKey: "bancos" as const, capability: null },
```

**Step 2: Commit**

```bash
git add src/components/finance/FinanceSubnav.tsx
git commit -m "feat(finance): add Bancos navigation item to FinanceSubnav"
```

---

## Task 8: Bancos Frontend Page + Client Component

**Files:**
- Create: `src/app/(app)/finanzas/bancos/page.tsx`
- Create: `src/components/finance/BancosClient.tsx`

**Step 1: Create BancosClient component**

Create `src/components/finance/BancosClient.tsx` — a "use client" component with:
- **3 Tabs**: Cuentas Bancarias | Movimientos | Importar Cartola
- **Cuentas Bancarias tab**: CRUD table/cards for bank accounts (bankName, accountType, accountNumber, holderRut, currency, currentBalance, isActive). Dialog for create/edit with form fields matching the Zod schema.
- **Movimientos tab**: List of bank transactions filtered by account + date range. Shows: date, description, reference, amount (colored green/red), balance, reconciliation status badge. Fetch from `/api/finance/banking/transactions?bankAccountId=X`.
- **Importar Cartola tab**: File upload zone + bank format selector (only "Santander" for now). Shows preview of parsed transactions before import. Submit via `FormData` POST to `/api/finance/banking/transactions/import`.

Follow exact same patterns as `ProveedoresClient.tsx`: mobile cards (`md:hidden`) + desktop table (`hidden md:block`), Dialog for forms, toast on success/error, `router.refresh()` after mutations.

Currency formatting: `new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 })`.

**Step 2: Create server page**

Create `src/app/(app)/finanzas/bancos/page.tsx` following `proveedores/page.tsx` pattern:
- Auth + permissions check
- Fetch `prisma.financeBankAccount.findMany({ where: { tenantId }, include: { accountPlan: { select: { id, code, name } } }, orderBy: { bankName: "asc" } })`
- Fetch accounts for form selects
- Map to plain objects, pass to `BancosClient`

**Step 3: Add export to index.ts**

Add to `src/components/finance/index.ts`:
```typescript
export { BancosClient } from "./BancosClient";
```

**Step 4: Verify TypeScript + Commit**

```bash
npx tsc --noEmit 2>&1 | grep -i "bancos\|BancosClient" | head -10
git add src/app/(app)/finanzas/bancos/ src/components/finance/BancosClient.tsx src/components/finance/index.ts
git commit -m "feat(finance): add Bancos page with accounts, transactions, and import"
```

---

## Task 9: DTE Recibidos Frontend — Add Tab to FacturacionClient

**Files:**
- Modify: `src/components/finance/FacturacionClient.tsx`
- Modify: `src/app/(app)/finanzas/facturacion/page.tsx`

**Step 1: Add "DTEs Recibidos" tab to FacturacionClient**

Add a new tab "DTEs Recibidos" to the existing FacturacionClient. This tab:
- Fetches received DTEs from `/api/finance/billing/received` client-side
- Shows table with: tipo DTE, folio, emisor (RUT + nombre), fecha, monto neto, IVA, total, estado recepción, estado pago
- Badge colors for reception status: PENDING_REVIEW=yellow, ACCEPTED=green, CLAIMED=red
- Badge colors for payment status: UNPAID=red, PARTIAL=yellow, PAID=green
- Button to register new received DTE (Dialog form with fields from `registerReceivedDteSchema`)
- Supplier autocomplete from existing suppliers list

**Step 2: Update facturacion page.tsx to also pass suppliers**

Modify `src/app/(app)/finanzas/facturacion/page.tsx` to also query suppliers and pass to client:
```typescript
const suppliers = await prisma.financeSupplier.findMany({
  where: { tenantId },
  select: { id: true, rut: true, name: true },
  orderBy: { name: "asc" },
});
```

**Step 3: Verify TypeScript + Commit**

```bash
npx tsc --noEmit 2>&1 | grep -i "facturacion\|FacturacionClient" | head -10
git add src/components/finance/FacturacionClient.tsx src/app/(app)/finanzas/facturacion/page.tsx
git commit -m "feat(finance): add DTEs Recibidos tab to Facturación"
```

---

## Task 10: Pagos a Proveedores Frontend — New Page

**Files:**
- Create: `src/app/(app)/finanzas/pagos-proveedores/page.tsx`
- Create: `src/components/finance/PagosProveedoresClient.tsx`

**Step 1: Create PagosProveedoresClient**

Create `src/components/finance/PagosProveedoresClient.tsx`:
- Tabs: "Pagos Registrados" | "Nuevo Pago"
- **Pagos Registrados tab**: Table of payment records (code, type, date, amount, method, supplier, status, allocations count). Badges for status.
- **Nuevo Pago tab**: Form with type selector (COLLECTION/DISBURSEMENT), date, amount, payment method, bank account selector, supplier selector, transfer reference. Below: "Asignar a documentos" section — search unpaid DTEs for selected supplier and add allocations with amounts. Submit to `/api/finance/banking/payments`.

**Step 2: Create server page**

Create `src/app/(app)/finanzas/pagos-proveedores/page.tsx`:
- Auth + permissions
- Fetch bank accounts, suppliers for selects
- Pass to client

**Step 3: Add to FinanceSubnav**

Add nav item: `{ href: "/finanzas/pagos-proveedores", label: "Pagos Prov.", icon: CreditCard, subKey: "pagos" as const, capability: null }`

**Step 4: Add export, verify + commit**

```bash
npx tsc --noEmit 2>&1 | grep -i "pagos-prov\|PagosProv" | head -10
git add src/app/(app)/finanzas/pagos-proveedores/ src/components/finance/PagosProveedoresClient.tsx src/components/finance/FinanceSubnav.tsx src/components/finance/index.ts
git commit -m "feat(finance): add Pagos a Proveedores page with DTE allocation"
```

---

## Task 11: Conciliación Bancaria Frontend

**Files:**
- Create: `src/app/(app)/finanzas/conciliacion/page.tsx`
- Create: `src/components/finance/ConciliacionClient.tsx`

**Step 1: Create ConciliacionClient**

Create `src/components/finance/ConciliacionClient.tsx`:
- **Main view**: List of reconciliation periods with status badges, bank account selector, button to start new reconciliation
- **Detail view** (when reconciliation selected): Split layout:
  - Left panel: Unmatched bank transactions (from cartola)
  - Right panel: Unmatched book entries (payments, DTEs, journal entries)
  - Drag-and-drop or click-to-match interface
  - Match creates a `POST /api/finance/banking/reconciliation/[id]/match`
  - Show running totals: matched vs unmatched, bank balance vs book balance, difference
  - Complete reconciliation button

**Step 2: Create server page**

Create `src/app/(app)/finanzas/conciliacion/page.tsx`:
- Auth + permissions
- Fetch bank accounts
- Pass to client

**Step 3: Add to FinanceSubnav**

Add nav item: `{ href: "/finanzas/conciliacion", label: "Conciliación", icon: GitCompareArrows, subKey: "bancos" as const, capability: null }`

**Step 4: Add export, verify + commit**

```bash
npx tsc --noEmit 2>&1 | grep -i "conciliacion\|ConciliacionClient" | head -10
git add src/app/(app)/finanzas/conciliacion/ src/components/finance/ConciliacionClient.tsx src/components/finance/FinanceSubnav.tsx src/components/finance/index.ts
git commit -m "feat(finance): add Conciliación Bancaria page with matching UI"
```

---

## Task 12: Final Integration — TypeScript Check + Push + PR

**Step 1: Full TypeScript check**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — Expected: 0 (or only pre-existing non-finance errors)

**Step 2: Verify all routes exist**

Run: `find src/app/(app)/finanzas -name "page.tsx" | sort` — should show all 17+ routes

**Step 3: Push and create PR**

```bash
git push origin claude/competent-poincare
gh pr create --title "feat(finance): complete banking, DTE received, payments & reconciliation suite" --body "..."
```

---

## File Summary

| Category | New Files | Modified Files |
|----------|-----------|---------------|
| Validation | — | `src/lib/validations/finance.ts` |
| Bank Account Service | `src/modules/finance/banking/bank-account.service.ts` | — |
| Bank Transaction Service | `src/modules/finance/banking/bank-transaction.service.ts` | — |
| Santander Parser | `src/modules/finance/banking/santander-parser.ts` | — |
| Payment Record Service | `src/modules/finance/banking/payment-record.service.ts` | — |
| Reconciliation Service | `src/modules/finance/banking/reconciliation.service.ts` | — |
| DTE Received Service | `src/modules/finance/billing/dte-received.service.ts` | — |
| Bank Account APIs | `src/app/api/finance/banking/accounts/route.ts`, `[id]/route.ts` | — |
| Bank Transaction APIs | `src/app/api/finance/banking/transactions/route.ts`, `import/route.ts` | — |
| Payment APIs | `src/app/api/finance/banking/payments/route.ts`, `[id]/route.ts` | — |
| Reconciliation APIs | `src/app/api/finance/banking/reconciliation/route.ts`, `[id]/route.ts`, `[id]/match/route.ts` | — |
| DTE Received APIs | `src/app/api/finance/billing/received/route.ts`, `[id]/route.ts` | — |
| Bancos Page | `src/app/(app)/finanzas/bancos/page.tsx` | — |
| BancosClient | `src/components/finance/BancosClient.tsx` | — |
| PagosProveedoresClient | `src/components/finance/PagosProveedoresClient.tsx` | — |
| Pagos Proveedores Page | `src/app/(app)/finanzas/pagos-proveedores/page.tsx` | — |
| ConciliacionClient | `src/components/finance/ConciliacionClient.tsx` | — |
| Conciliación Page | `src/app/(app)/finanzas/conciliacion/page.tsx` | — |
| Navigation | — | `src/components/finance/FinanceSubnav.tsx` |
| Facturación | — | `src/components/finance/FacturacionClient.tsx`, `facturacion/page.tsx` |
| Exports | — | `src/components/finance/index.ts` |

**Total: ~22 new files, ~5 modified files, 12 tasks**
