// ─── Types for Phase 1 Dashboard ─────────────────────────────────────────────

export interface Router {
  id: string;
  name: string;
  location: string;
  ip_address: string;
  site_type: string;
  created_at: string;
}

export interface Snapshot {
  id: number;
  router_id: string;
  router_name: string;
  timestamp: string;
  latency: number;
  packet_loss: number;
  jitter: number;
  bandwidth: number;
  cpu: number;
  memory: number;
  link_status: number;
  failure_label: number;
  ip_address?: string;
  site_type?: string;
}

export interface Incident {
  id: number;
  router_id: string;
  router_name: string;
  started_at: string;
  resolved_at: string | null;
  failure_type: string;
  severity: string;
  peak_latency: number;
  peak_loss: number;
  peak_cpu: number;
  notes: string;
}

export interface GeneratorStatus {
  running: boolean;
  pid: number | null;
  uptime_seconds: number;
  total_rows: number;
  total_incidents: number;
  latest_timestamp: string | null;
  rows_last_30s: number;
  rows_per_minute: number;
  influx_available: boolean;
  sqlite_path: string;
}

export interface SnapshotsResponse {
  total: number;
  limit: number;
  offset: number;
  data: Snapshot[];
}

export type FailureLabel = 0 | 1 | 2 | 3;

export const FAILURE_LABEL_MAP: Record<number, string> = {
  0: 'Normal',
  1: 'Congestion',
  2: 'Overload',
  3: 'Instability',
};

export const FAILURE_LABEL_CLASS: Record<number, string> = {
  0: 'label-normal',
  1: 'label-congestion',
  2: 'label-overload',
  3: 'label-instability',
};

export const SITE_TYPE_CLASS: Record<string, string> = {
  ISTRAC: 'site-istrac',
  SDSC: 'site-sdsc',
  MCF: 'site-mcf',
  NOC: 'site-noc',
  TRACK: 'site-track',
};

export const METRIC_COLORS = {
  latency: '#00d4ff',
  packet_loss: '#f43f5e',
  jitter: '#f59e0b',
  bandwidth: '#8b5cf6',
  cpu: '#10b981',
  memory: '#f97316',
};
