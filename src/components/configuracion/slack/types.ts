// Tipos compartidos del panel de configuración de Slack.

export type SlackMatchType = "KEY" | "CATEGORY" | "MODULE";

export interface SlackRoute {
  id: string;
  matchType: SlackMatchType;
  matchValue: string;
  channelId: string;
  channelName: string;
  enabled: boolean;
}

export interface SlackNotifType {
  key: string;
  label: string;
  module: string;
  category: string;
}

export interface SlackConfig {
  connected: boolean;
  teamName: string | null;
  botUserId: string | null;
  defaultChannel: { id: string; name: string } | null;
  routes: SlackRoute[];
  notifTypes: SlackNotifType[];
}

export interface SlackChannelOption {
  id: string;
  name: string;
  isPrivate: boolean;
}
