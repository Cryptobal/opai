/**
 * scripts/trigger-bulk-retry.ts
 *
 * Trigger manual del bulk-retry de envíos de Proforma / Estado de Pago.
 * Útil si querés correr el reintento desde la línea de comandos sin abrir
 * el browser. Requiere COOKIE de sesión válida.
 *
 * Uso:
 *   COOKIE='<session-cookie>' BASE_URL='https://app.opai.cl' \
 *   npx tsx scripts/trigger-bulk-retry.ts
 */
async function main() {
  const cookie = process.env.COOKIE;
  const baseUrl = process.env.BASE_URL ?? "https://app.opai.cl";
  if (!cookie) throw new Error("Falta env COOKIE");

  // 1. Listar pendientes
  const listRes = await fetch(
    `${baseUrl}/api/finance/billing/drafts/pending-sends`,
    { headers: { cookie } },
  );
  const list = await listRes.json();
  if (!list.success) throw new Error(list.error);
  const ids = (list.data.drafts as Array<{ id: string }>).map((d) => d.id);
  console.log(`Encontrados ${ids.length} borradores pendientes`);

  if (ids.length === 0) return;

  // 2. Retry
  const retryRes = await fetch(
    `${baseUrl}/api/finance/billing/drafts/bulk-retry-send`,
    {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        draftIds: ids,
        variants: ["PROFORMA", "ESTADO_DE_PAGO"],
      }),
    },
  );
  const retry = await retryRes.json();
  console.log(JSON.stringify(retry.data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
