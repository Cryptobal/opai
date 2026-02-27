import { type ComponentType } from 'react';

export type CommandCategory = 'navigation' | 'action' | 'config' | 'recent';

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
}

export interface RecentItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  timestamp: number;
}
