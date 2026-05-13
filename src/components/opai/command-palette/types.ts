import { type ComponentType } from 'react';

export type CommandCategory =
  | 'navigation'
  | 'action'
  | 'config'
  | 'recent'
  | 'search'
  | 'search_crm'
  | 'search_ops'
  | 'search_docs'
  | 'search_chat'
  | 'search_inventory'
  | 'search_finance';

export interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon: ComponentType<{ className?: string }>;
  /** Atajo de teclado a mostrar (ej: "⌘T") */
  shortcut?: string;
  /** Palabras clave adicionales para búsqueda */
  keywords?: string[];
  /** Ruta de navegación */
  href?: string;
  /** Acción custom a ejecutar (en vez de navegar) */
  action?: () => void;
  /** Control de visibilidad por rol */
  canShow?: (role: string) => boolean;
  /** Solo para search: avatar/logo URL (guardias, cuentas) */
  imageUrl?: string;
  /** Solo para search: PIN de marcación (guardias) */
  pinDisplay?: string;
  /** Solo para search: etiqueta de badge de estado (ej. Contratado) */
  badgeLabel?: string;
  /** Solo para search: clases Tailwind para badge de estado */
  badgeClass?: string;
}

export interface RecentItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  timestamp: number;
}
