import { Controller, Get, Post, Body, Headers, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MiddlewareService, CloudResultPayload } from './middleware.service';

@ApiTags('Middleware Ingestion API')
@Controller('middleware')
export class MiddlewareController {
  constructor(private readonly middlewareService: MiddlewareService) {}

  @Get('orders')
  @ApiOperation({ summary: 'Pull recent orders for local middleware ingestion' })
  async getOrders(
    @Headers('x-site-code') siteCode: string,
    @Query('since') since?: string,
  ) {
    return this.middlewareService.getOrders(siteCode || '00940', since);
  }

  @Post('results')
  @ApiOperation({ summary: 'Receive batch test results delivered from local middleware outbox' })
  async receiveResults(
    @Headers('x-site-code') siteCode: string,
    @Body() payload: CloudResultPayload,
  ) {
    return this.middlewareService.receiveResults(siteCode || '00940', payload);
  }

  @Post('heartbeat')
  @ApiOperation({ summary: 'Record telemetry heartbeat from local middleware engine' })
  async heartbeat(
    @Headers('x-site-code') siteCode: string,
    @Body() telemetry: any,
  ) {
    return this.middlewareService.recordHeartbeat(siteCode || '00940', telemetry);
  }
}
