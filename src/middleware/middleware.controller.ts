import { Controller, Get, Post, Body, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { MiddlewareService, CloudResultPayload } from './middleware.service';
import { Public } from '../auth/public.decorator';

@ApiTags('Middleware Ingestion API')
@Controller('middleware')
export class MiddlewareController {
  private readonly expectedApiKey: string;

  constructor(
    private readonly middlewareService: MiddlewareService,
    private readonly config: ConfigService,
  ) {
    this.expectedApiKey = this.config.get<string>('SITE_API_KEY', '');
  }

  private verifyAuth(apiKey?: string) {
    const requiredKey = this.expectedApiKey || 'healthdi_sec_live_sena00940';
    if (!apiKey || apiKey !== requiredKey) {
      throw new UnauthorizedException('Invalid or missing X-Api-Key for Middleware Ingestion');
    }
  }

  @Public()
  @Get('orders')
  @ApiOperation({ summary: 'Pull recent orders for local middleware ingestion' })
  async getOrders(
    @Headers('x-site-code') siteCode: string,
    @Headers('x-api-key') apiKey?: string,
    @Query('since') since?: string,
  ) {
    this.verifyAuth(apiKey);
    return this.middlewareService.getOrders(siteCode || '00940', since);
  }

  @Public()
  @Post('results')
  @ApiOperation({ summary: 'Receive batch test results delivered from local middleware outbox' })
  async receiveResults(
    @Headers('x-site-code') siteCode: string,
    @Headers('x-api-key') apiKey?: string,
    @Body() payload?: CloudResultPayload,
  ) {
    this.verifyAuth(apiKey);
    return this.middlewareService.receiveResults(siteCode || '00940', payload as CloudResultPayload);
  }

  @Public()
  @Post('heartbeat')
  @ApiOperation({ summary: 'Record telemetry heartbeat from local middleware engine' })
  async heartbeat(
    @Headers('x-site-code') siteCode: string,
    @Headers('x-api-key') apiKey?: string,
    @Body() telemetry?: any,
  ) {
    this.verifyAuth(apiKey);
    return this.middlewareService.recordHeartbeat(siteCode || '00940', telemetry);
  }
}
