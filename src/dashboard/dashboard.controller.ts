import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'ดึงตัวเลขสถิติและตัวชี้วัด KPI ของห้องปฏิบัติการ (4 KPI Cards)' })
  @ApiResponse({
    status: 200,
    description: 'คืนค่าตัวเลขสถิติ Orders, Sample Receiving, Workstation Pending, Approved Today',
    schema: {
      type: 'object',
      properties: {
        pendingOrders: { type: 'number', example: 14, description: 'ใบคำสั่งตรวจรอรับ' },
        pendingSamples: { type: 'number', example: 8, description: 'สิ่งส่งตรวจรอตรวจรับ' },
        pendingApproval: { type: 'number', example: 5, description: 'ผลตรวจรออนุมัติ' },
        approvedToday: { type: 'number', example: 142, description: 'ผลตรวจที่อนุมัติแล้ววันนี้' },
      },
    },
  })
  getStats() {
    return this.dashboardService.getStats();
  }
}
