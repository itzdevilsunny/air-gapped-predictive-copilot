export interface TelemetryPoint {
  timestamp: string;
  router_id: string;
  router_name: string;
  latency: number;
  packet_loss: number;
  jitter: number;
  bandwidth: number;
  cpu: number;
  memory: number;
  link_status: number;
  failure_label: number;
}

export interface AnalysisResult {
  failure_risk: number;
  is_anomaly: boolean;
  anomaly_score: number;
  explanation: string;
  root_cause: string;
  cli_recommendation: string;
  timeline_events: Array<{
    time: string;
    type: 'info' | 'warning' | 'critical';
    msg: string;
  }>;
}

export interface RouterState {
  telemetry: TelemetryPoint;
  analysis: AnalysisResult;
}

export interface ActiveAlert {
  router_id: string;
  router_name: string;
  risk_score: number;
  root_cause: string;
  timestamp: string;
}

export interface EnrichedHistoryPoint extends TelemetryPoint {
  failure_risk: number;
  is_anomaly: boolean;
  anomaly_score: number;
}

export interface CopilotDocument {
  id: string;
  title: string;
  content: string;
}

export interface CopilotResponse {
  answer: string;
  retrieved_documents: CopilotDocument[];
  engine: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'copilot';
  text: string;
  timestamp: string;
  retrieved_documents?: CopilotDocument[];
  engine?: string;
}
