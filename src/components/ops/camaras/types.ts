export type CamaraDto = {
  id: string;
  name: string;
  sourceType: string;
  brand: string;
  host: string;
  rtspPort: number;
  onvifPort: number | null;
  channel: number;
  streamQuality: string;
  customPath: string | null;
  username: string;
  ptzCapable: boolean;
  streamName: string;
  status: string;
  lastSeenAt: string | null;
  lastError: string | null;
  isActive: boolean;
  notes: string | null;
  installationId: string;
  installation?: {
    id: string;
    name: string;
    accountId: string | null;
    account: { id: string; name: string } | null;
  };
};

export type LayoutDto = {
  id: string;
  name: string;
  gridSize: number;
  cameraIds: string[];
  sortOrder: number;
};

export type RelayAccess = {
  token: string;
  relayUrl: string;
  streams: Record<string, string>;
};
