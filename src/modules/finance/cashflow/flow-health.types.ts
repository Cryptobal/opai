/** Tipos del diagnóstico de salud del flujo (compartidos cliente/servidor). */

export interface FlowHealthRowRef {
  id: string;
  name: string;
  section: string;
}

export interface FlowHealthAccountRef {
  accountPlanId: string;
  code: string;
  name: string;
}

/** Diagnóstico basado en renglones ↔ cuentas (modelo v3). */
export interface FlowHealthReport {
  rowsWithoutAccounts: FlowHealthRowRef[];
  accountsWithoutRow: FlowHealthAccountRef[];
  sharedAccountsWithoutDefault: Array<
    FlowHealthAccountRef & { rows: FlowHealthRowRef[] }
  >;
  duplicateCanonicalKeys: Array<{
    key: string;
    rows: FlowHealthRowRef[];
  }>;
  expenseRowsOnNonExpenseAccounts: Array<{
    rowId: string;
    rowName: string;
    accountCode: string;
    accountName: string;
    accountType: string;
  }>;
  missingSystemKeys: string[];
  connectedRowCount: number;
  /** Compat UI — alias de sharedAccountsWithoutDefault. */
  ambiguousAccounts: Array<FlowHealthAccountRef & { rows: FlowHealthRowRef[] }>;
}

/** Alias usado por la UI de configuración. */
export type FlowHealthReportV2 = FlowHealthReport;

export interface FlowHealthLookup {
  accountPlanId?: string;
  flowRowId?: string;
}

/** Normaliza reporte a la forma consumida por la UI. */
export function normalizeFlowHealthReport(
  raw: FlowHealthReport & Record<string, unknown>,
): FlowHealthReportV2 {
  if (Array.isArray(raw.rowsWithoutAccounts)) {
    const shared =
      (raw.sharedAccountsWithoutDefault as FlowHealthReport["sharedAccountsWithoutDefault"]) ??
      (raw.ambiguousAccounts as FlowHealthReport["sharedAccountsWithoutDefault"]) ??
      [];
    return {
      rowsWithoutAccounts: raw.rowsWithoutAccounts,
      accountsWithoutRow: (raw.accountsWithoutRow as FlowHealthAccountRef[]) ?? [],
      sharedAccountsWithoutDefault: shared,
      duplicateCanonicalKeys:
        (raw.duplicateCanonicalKeys as FlowHealthReport["duplicateCanonicalKeys"]) ??
        [],
      expenseRowsOnNonExpenseAccounts:
        (raw.expenseRowsOnNonExpenseAccounts as FlowHealthReport["expenseRowsOnNonExpenseAccounts"]) ??
        [],
      missingSystemKeys: (raw.missingSystemKeys as string[]) ?? [],
      connectedRowCount: Number(raw.connectedRowCount ?? 0),
      ambiguousAccounts: shared,
    };
  }

  // Legacy category-based payload
  const legacy = raw as {
    rowsWithoutCategory?: FlowHealthRowRef[];
    categoriesWithoutRow?: Array<{
      id: string;
      code: string;
      name: string;
    }>;
    ambiguousAccounts?: Array<{
      accountPlanId: string;
      code: string;
      name: string;
      categories?: Array<{ id: string; name: string }>;
    }>;
    expenseCategoriesOnNonExpenseAccounts?: Array<{
      categoryId: string;
      categoryName: string;
      accountCode: string;
      accountName: string;
      accountType: string;
    }>;
    connectedRowCount?: number;
  };

  const shared = (legacy.ambiguousAccounts ?? []).map((a) => ({
    accountPlanId: a.accountPlanId,
    code: a.code,
    name: a.name,
    rows: (a.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      section: "",
    })),
  }));

  return {
    rowsWithoutAccounts: legacy.rowsWithoutCategory ?? [],
    accountsWithoutRow: (legacy.categoriesWithoutRow ?? []).map((c) => ({
      accountPlanId: c.id,
      code: c.code,
      name: c.name,
    })),
    sharedAccountsWithoutDefault: shared,
    duplicateCanonicalKeys: [],
    expenseRowsOnNonExpenseAccounts: (
      legacy.expenseCategoriesOnNonExpenseAccounts ?? []
    ).map((x) => ({
      rowId: x.categoryId,
      rowName: x.categoryName,
      accountCode: x.accountCode,
      accountName: x.accountName,
      accountType: x.accountType,
    })),
    missingSystemKeys: [],
    connectedRowCount: legacy.connectedRowCount ?? 0,
    ambiguousAccounts: shared,
  };
}
