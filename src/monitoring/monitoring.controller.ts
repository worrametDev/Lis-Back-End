import {
  Controller,
  Get,
  Header,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';
import { MetricsService } from './metrics.service';

@Controller()
export class MonitoringController {
  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {}

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsEndpoint(@Headers('x-monitoring-token') token?: string) {
    const expectedToken = this.config.get<string>('MONITORING_TOKEN');
    if (!expectedToken) {
      throw new ServiceUnavailableException('Monitoring is not configured');
    }
    if (token !== expectedToken) {
      throw new UnauthorizedException('Invalid monitoring token');
    }
    return this.metrics.renderPrometheus();
  }
}
