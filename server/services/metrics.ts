import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry, prefix: 'tsmeet_' });

export const httpRequestDuration = new Histogram({
  name: 'tsmeet_http_request_duration_seconds',
  help: 'Express request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  registers: [metricsRegistry],
});
export const activeRooms = new Gauge({ name: 'tsmeet_active_rooms', help: 'Current application rooms', registers: [metricsRegistry] });
export const activeParticipants = new Gauge({ name: 'tsmeet_active_participants', help: 'Current visible participants', registers: [metricsRegistry] });
export const recordingFailures = new Counter({ name: 'tsmeet_recording_failures_total', help: 'Failed LiveKit Egress recordings', registers: [metricsRegistry] });
export const networkQualityReports = new Counter({
  name: 'tsmeet_network_quality_reports_total',
  help: 'Client LiveKit network-quality reports',
  labelNames: ['quality'],
  registers: [metricsRegistry],
});
