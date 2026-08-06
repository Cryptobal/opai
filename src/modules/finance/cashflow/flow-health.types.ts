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
export interface FlowHealthReportV2 {
  rowsWithoutAccounts: FlowHealthRowRef[];
  accountsWithoutRow: Array<
    FlowHealthAccountRef & { rows: FlowHealthRowRef[] }
  >;
  ambiguousAccounts: Array<
    FlowHealthAccountRef & { rows: FlowHealthRowRef[] }
  >;
  expenseRowsOnNonExpenseAccounts: Array<{
    rowId: string;
    rowName: string;
    accountCode: string;
    accountName: string;
    accountType: string;
  }>;
  connectedRowCount: number;
}

/** @deprecated Legacy category-based report; se mapea en UI si el API aún lo devuelve. */
export interface FlowHealthReportLegacy {
  rowsWithoutCategory: FlowHealthRowRef[];
  categoriesWithoutRow: Array<{
    id: string;
    code: string;
    name: string;
    accounts: Array<{ code: string; name: string }>;
  }>;
  ambiguousAccounts: Array<{
    accountPlanId: string;
    code: string;
    name: string;
    categories: Array<{ id: string; name: string }>;
  }>;
  expenseCategoriesOnNonExpenseAccounts: Array<{
    categoryId: string;
    categoryName: string;
    accountCode: string;
    accountName: string;
    accountType: string;
  }>;
  connectedRowCount: number;
}

export type FlowHealthReport = FlowHealthReportV2 & Partial<FlowHealthReportLegacy>;

export interface FlowHealthLookup {
  accountPlanId?: string;
  flowRowId?: string;
}

/** Normaliza reporte legacy o v2 a la forma consumida por la UI nueva. */
export function normalizeFlowHealthReport(
  raw: FlowHealthReport,
): FlowHealthReportV2 {
  if (raw.rowsWithoutAccounts) {
    return {
      rowsWithoutAccounts: raw.rowsWithoutAccounts,
      accountsWithoutRow: raw.accountsWithoutRow ?? [],
      ambiguousAccounts: (raw.ambiguousAccounts ?? []).map((a) =>
        "rows" in a && Array.isArray(a.rows)
          ? a
          : {
              accountPlanId: a.accountPlanId,
              code: a.code,
              name: a.name,
              rows:
                "categories" in a
                  ? (a.categories as Array<{ id: string; name: string }>).map(
                      (c) => ({
                        id: c.id,
                        name: c.name,
                        section: "",
                      }),
                    )
                  : [],
            },
      ),
      expenseRowsOnNonExpenseAccounts:
        raw.expenseRowsOnNonExpenseAccounts ??
        (raw.expenseCategoriesOnNonExpenseAccounts ?? []).map((x) => ({
          rowId: x.categoryId,
          rowName: x.categoryName,
          accountCode: x.accountCode,
          accountName: x.accountName,
          accountType: x.accountType,
        })),
      connectedRowCount: raw.connectedRowCount,
    };
  }

  return {
    rowsWithoutAccounts: raw.rowsWithoutCategory ?? [],
    accountsWithoutRow: (raw.categoriesWithoutRow ?? []).map((c) => ({
      accountPlanId: c.id,
      code: c.code,
      name: c.name,
      rows: [{ id: c.id, name: c.name, section: "" }],
    })),
    ambiguousAccounts: (raw.ambiguousAccounts ?? []).map((a) => ({
      accountPlanId: a.accountPlanId,
      code: a.code,
      name: a.name,
      rows: (a.categories ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        section: "",
      })),
    })),
    expenseRowsOnNonExpenseAccounts: (
      raw.expenseCategoriesOnNonExpenseAccounts ?? []
    ).map((x) => ({
      rowId: x.categoryId,
      rowName: x.categoryName,
      accountCode: x.accountCode,
      accountName: x.accountName,
      accountType: x.accountType,
    })),
    connectedRowCount: raw.connectedRowCount,
  };
}
