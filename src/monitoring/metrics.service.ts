import { Injectable } from '@nestjs/common';

interface RequestMetric {
  count: number;
  durationMs: number;
}

@Injectable()
export class MetricsService {
  private readonly requests = new Map<string, RequestMetric>();

  recordRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
  ) {
    const normalizedPath = path
      .split('?')[0]
      .replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi, ':id');
    const key = `${method}|${normalizedPath}|${statusCode}`;
    const metric = this.requests.get(key) ?? { count: 0, durationMs: 0 };
    metric.count += 1;
    metric.durationMs += Math.max(0, durationMs);
    this.requests.set(key, metric);
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP process_uptime_seconds Process uptime in seconds.',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${process.uptime().toFixed(3)}`,
      '# HELP process_resident_memory_bytes Resident memory size in bytes.',
      '# TYPE process_resident_memory_bytes gauge',
      `process_resident_memory_bytes ${process.memoryUsage().rss}`,
      '# HELP http_requests_total HTTP requests served by method, path and status.',
      '# TYPE http_requests_total counter',
      '# HELP http_request_duration_milliseconds HTTP request duration in milliseconds.',
      '# TYPE http_request_duration_milliseconds summary',
    ];
    for (const [key, metric] of this.requests) {
      const [method, path, status] = key.split('|');
      const labels = `method="${method}",path="${path}",status="${status}"`;
      lines.push(`http_requests_total{${labels}} ${metric.count}`);
      lines.push(
        `http_request_duration_milliseconds_sum{${labels}} ${metric.durationMs.toFixed(3)}`,
      );
      lines.push(
        `http_request_duration_milliseconds_count{${labels}} ${metric.count}`,
      );
    }
    return `${lines.join('\n')}\n`;
  }
}
