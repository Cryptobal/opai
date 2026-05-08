/**
 * Mapea el payload crudo del webhook de Zoho al shape mínimo que esperan
 * las páginas de preview / presentación pública (`client.company_name`, etc.).
 */

export function mapZohoDataToPresentation(
  zohoData: Record<string, unknown>,
  id: string,
  templateSlug: string,
): Record<string, unknown> {
  const account = zohoData.account as { Account_Name?: string } | undefined;
  const existingClient = zohoData.client as { company_name?: string } | undefined;

  return {
    ...zohoData,
    id,
    template_id: templateSlug,
    client: {
      company_name:
        existingClient?.company_name ??
        account?.Account_Name ??
        "Cliente",
    },
  };
}
