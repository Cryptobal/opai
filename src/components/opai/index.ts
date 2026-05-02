/**
 * OPAI Design System - Components
 * 
 * Componentes custom de OPAI construidos sobre shadcn/ui.
 * Todos siguen los tokens y patrones del Design System.
 */

// Layout Components
export { AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';

export { AppSidebar } from './AppSidebar';
export type { AppSidebarProps, NavItem, NavSubItem } from './AppSidebar';

export { AppLayoutClient } from './AppLayoutClient';

// Theme
export { ThemeProvider, useTheme } from './ThemeProvider';
export { ThemeToggle } from './ThemeToggle';
export { ThemeLogo } from './ThemeLogo';

// Topbar Components
export { TopbarActions } from './TopbarActions';
export { DocumentosTopbar } from './DocumentosTopbar';
export { ReloadButton } from './ReloadButton';

// Navigation
export { BottomNav } from './BottomNav';
export { CommandPalette } from './CommandPalette';

// Page Components
export { DocumentosSubnav } from './DocumentosSubnav';
export { IntegrationsGmailClient } from './IntegrationsGmailClient';
export { EmailTemplatesClient } from './EmailTemplatesClient';
export { ConfigBackLink } from './ConfigBackLink';
export { AiProvidersConfigClient } from './AiProvidersConfigClient';
export { SectionNav } from './SectionNav';
export type { SectionNavItem } from './SectionNav';
export { DetailLayout } from './DetailLayout';
export type { DetailLayoutSection } from './DetailLayout';