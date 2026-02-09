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
export type { AppSidebarProps, NavItem } from './AppSidebar';

export { AppTopbar } from './AppTopbar';
export type { AppTopbarProps } from './AppTopbar';

export { AppLayoutClient } from './AppLayoutClient';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

// UI Components
export { KpiCard } from './KpiCard';
export type { KpiCardProps, TrendType } from './KpiCard';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { LoadingState } from './LoadingState';
export type { LoadingStateProps, LoadingStateType } from './LoadingState';

// Topbar Components
export { TemplatesDropdown } from './TemplatesDropdown';
export { NotificationBell } from './NotificationBell';
export { DocumentosTopbar } from './DocumentosTopbar';
export { ReloadButton } from './ReloadButton';

// Navigation
export { SubNav } from './SubNav';
export type { SubNavItem } from './SubNav';

// Page Components
export { DocumentosContent } from './DocumentosContent';
export { DocumentosSubnav } from './DocumentosSubnav';
export { IntegrationsGmailClient } from './IntegrationsGmailClient';
export { EmailTemplatesClient } from './EmailTemplatesClient';
export { ConfigSubnav } from './ConfigSubnav';
