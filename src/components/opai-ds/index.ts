// OPAI Design System v3 — barrel exports
// Use: import { Surface, Stat, Tag, IconBubble } from "@/components/opai-ds";

export { Surface, type SurfaceProps } from "./Surface";
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader";
export { PageHero, type PageHeroProps } from "./PageHero";
export { Stat, StatGrid, type StatProps, type StatGridProps } from "./Stat";
export { KPICard, KPIGrid, type KPICardProps, type KPIGridProps, type KPIVariant } from "./KPICard";
export { Tag, type TagProps, type TagVariant } from "./Tag";
export { StatusDot, type StatusDotProps, type StatusKind } from "./StatusDot";
export {
  IconBubble,
  IconTile,
  type IconBubbleProps,
  type IconBubbleVariant,
  type IconBubbleSize,
  type IconBubbleTone,
  type IconTileProps,
  type IconTileSize,
  type IconTileTone,
} from "./IconBubble";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { Spinner, type SpinnerProps } from "./Spinner";
export { Skeleton, type SkeletonProps } from "./Skeleton";
export { LoadingState, type LoadingStateProps, type LoadingStateType } from "./LoadingState";
export { MetricBar, type MetricBarProps } from "./MetricBar";
export { DataTable, type DataTableProps, type DataTableColumn } from "./DataTable";
export {
  DataView,
  type DataViewProps,
  type DataViewColumn,
  type MobileSlot,
} from "./DataView";
export { Toolbar, type ToolbarProps } from "./Toolbar";
export {
  SegmentedControl,
  type SegmentedControlProps,
  type SegmentedControlItem,
} from "./SegmentedControl";
export { FilterChipsBar, type FilterChipsBarProps, type FilterChip } from "./FilterChipsBar";
export {
  FilterPopover,
  type FilterPopoverProps,
  type FilterGroup,
  type FilterOption,
} from "./FilterPopover";
export { HeatGrid, type HeatGridProps, type HeatGridRow, type HeatGridColumn } from "./HeatGrid";
export { Avatar, type AvatarProps, type AvatarVariant } from "./Avatar";
export { EntityRow, type EntityRowProps } from "./EntityRow";
export {
  tintFromId,
  tintClasses,
  ENTITY_TINTS,
  type EntityTint,
  type EntityTintOverrides,
} from "@/lib/entity-tint";
export { Breadcrumbs, type BreadcrumbsProps, type BreadcrumbItem } from "./Breadcrumbs";
export {
  BreadcrumbTrailingProvider,
  useBreadcrumbTrailing,
  useBreadcrumbTrailingSubtitle,
  useSetBreadcrumbTrailing,
  SetBreadcrumbTrailing,
} from "./BreadcrumbTrailingContext";
export { SubNav, type SubNavItem } from "./SubNav";
export { SwipeTabs, type SwipeTabsProps, type SwipeTabItem } from "./SwipeTabs";
export { ModuleSubNav, type ModuleSubNavProps } from "./ModuleSubNav";
export { TopbarSubNav, useTopbarSubNavTabs } from "./TopbarSubNav";
export { FxIndicator } from "./FxIndicator";
export { PageToolbar, type PageToolbarProps } from "./PageToolbar";
export { KPIStrip, type KPIStripProps, type KPIStripItem, type KPIStripVariant } from "./KPIStrip";
export { DetailHeader, type DetailHeaderProps } from "./DetailHeader";
export {
  IslandActionProvider,
  useIslandAction,
  useSetIslandAction,
  type IslandAction,
} from "./IslandActionContext";
export {
  IslandModuleProvider,
  useIslandModule,
  useModuleSurface,
  useSetIslandModuleMenu,
  useSetIslandSearch,
  useSetModuleSearch,
  useSetIslandSuppressed,
  useIslandSearchOpenListener,
  requestIslandSearchOpen,
  ISLAND_OPEN_SEARCH_EVENT,
  type IslandModuleMenu,
  type IslandSearch,
  type IslandSearchScopeChip,
  type ModuleSearchOperator,
} from "./IslandModuleContext";
export { ConfigShell, useConfigCategories, type ConfigShellProps, type CategoryGroup } from "./ConfigShell";
export { GlassAmbient } from "./GlassAmbient";
export {
  AttachmentPicker,
  type AttachmentPickerProps,
  type AttachmentPickerItem,
  type AttachmentPickerItemStatus,
} from "./AttachmentPicker";
export { UndoSnackbarHost } from "./UndoSnackbar";
export {
  showUndo,
  dismissUndo,
  DEFAULT_UNDO_DURATION_MS,
  getUndoSnackbarSnapshot,
  subscribeUndoSnackbar,
  claimUndoHost,
  getUndoHostClaimSnapshot,
  subscribeUndoHostClaim,
  type UndoSnackbarInput,
  type UndoSnackbarState,
} from "./undo-snackbar-store";
export { thresholdFromScore, type Threshold } from "./tokens";
