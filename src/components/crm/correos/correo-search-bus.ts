export const CORREO_SEARCH_EVENT = "opai-correo-search";

export type CorreoSearchRequest = {
  /** Token completo, p. ej. `from:a@b.cl`. */
  token: string;
  /** replace: sustituye la query. append: la agrega a la existente. */
  mode?: "replace" | "append";
};

export function requestCorreoSearch(req: CorreoSearchRequest) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CorreoSearchRequest>(CORREO_SEARCH_EVENT, { detail: req }),
  );
}
