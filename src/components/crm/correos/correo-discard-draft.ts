/**
 * Descarta un borrador Gmail (espejo local + provider) desde la UI del lector.
 * Misma API que usa EmailComposer (DELETE /api/crm/gmail/drafts/[draftId]).
 */
export async function discardGmailDraft(providerDraftId: string): Promise<boolean> {
  const id = providerDraftId.trim();
  if (!id) return false;
  try {
    const res = await fetch(`/api/crm/gmail/drafts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return data?.success !== false;
  } catch {
    return false;
  }
}
