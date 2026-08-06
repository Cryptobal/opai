/**
 * Helper para PATCH de un solo campo en CRM.
 * Lanza Error con mensaje del servidor si falla.
 */

export async function patchCrmField<T = Record<string, unknown>>(opts: {
  url: string;
  key: string;
  value: unknown;
}): Promise<T> {
  const res = await fetch(opts.url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [opts.key]: opts.value }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(
      typeof json?.error === "string" ? json.error : `Error ${res.status}`
    );
  }
  return (json?.data ?? json) as T;
}
