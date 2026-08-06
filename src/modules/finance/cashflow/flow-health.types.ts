/** Tipos del diagnóstico de salud del flujo (compartidos cliente/servidor). */

export interface FlowHealthReport {
  rowsWithoutCategory: Array<{ id: string; name: string; section: string }>;
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

export interface FlowHealthLookup {
  accountPlanId?: string;
  flowRowId?: string;
}
