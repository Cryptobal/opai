/**
 * Tamaños de página para listados CRM.
 *
 * Módulo client-safe: NO importar prisma / server-only aquí.
 * Los clientes ("use client") solo pueden consumir este archivo (o constantes
 * inline); los helpers `list-*.ts` sí pueden importar server modules.
 */

export const ACCOUNT_LIST_DEFAULT_PAGE_SIZE = 50;
export const CONTACT_LIST_DEFAULT_PAGE_SIZE = 50;
export const INSTALLATION_LIST_DEFAULT_PAGE_SIZE = 50;
export const QUOTE_LIST_DEFAULT_PAGE_SIZE = 50;
export const DEAL_LIST_DEFAULT_PAGE_SIZE = 50;
/** Kanban legacy (carga global). Preferir DEAL_LIST_BOARD_PAGE_SIZE_PER_STAGE. */
export const DEAL_LIST_KANBAN_PAGE_SIZE = 200;
/** Primera página por columna del tablero rediseñado. */
export const DEAL_LIST_BOARD_PAGE_SIZE_PER_STAGE = 25;
