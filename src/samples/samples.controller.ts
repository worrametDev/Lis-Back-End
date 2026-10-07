import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SamplesService } from './samples.service';

@ApiTags('Sample Receiving')
@ApiBearerAuth('JWT-auth')
@Controller('samples')
export class SamplesController {
  constructor(private readonly samplesService: SamplesService) {}

  @Get()
  @ApiOperation({ summary: 'ดึงรายการสิ่งส่งตรวจสำหรับหน้าตรวจรับ (Sample Receiving Table)' })
  @ApiQuery({ name: 'status', required: false, description: 'กรองตามสถานะ (REGISTERED, RECEIVED, REJECTED)' })
  @ApiQuery({ name: 'clientSiteId', required: false, description: 'กรองตามหน่วยงานส่งตรวจ' })
  @ApiQuery({ name: 'search', required: false, description: 'ค้นหาด้วย Lab Number, Barcode, หรือ HN' })
  @ApiResponse({ status: 200, description: 'คืนค่ารายการสิ่งส่งตรวจ' })
  findAll(
    @Query('status') status?: string,
    @Query('clientSiteId') clientSiteId?: string,
    @Query('search') search?: string,
  ) {
    return this.samplesService.findAll({ status, clientSiteId, search });
  }

  @Post('receive')
  @ApiOperation({ summary: 'ตรวจรับสิ่งส่งตรวจเข้าแล็บ (RECEIVE button - รองรับแบบ Bulk)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sampleIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['smp-uuid-1', 'smp-uuid-2'],
          description: 'รายการ UUID ของ Sample ที่ต้องการตรวจรับ',
        },
        autoBarcode: { type: 'boolean', example: true, description: 'สั่งพิมพ์บาร์โค้ดอัตโนมัติ' },
      },
      required: ['sampleIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'ตรวจรับสำเร็จ' })
  receive(@Body() body: { sampleIds: string[]; autoBarcode?: boolean; receivedById?: string }) {
    return this.samplesService.receive(body);
  }

  @Post('reject')
  @ApiOperation({ summary: 'ปฏิเสธสิ่งส่งตรวจ (REJECT button - บันทึก Specimen Condition/สาเหตุ)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sampleIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['smp-uuid-1'],
          description: 'รายการ UUID ของ Sample ที่ต้องการปฏิเสธ',
        },
        conditionCode: { type: 'string', example: 'HEMOLYSIS', description: 'รหัสสภาพสิ่งส่งตรวจ (เช่น HEMOLYSIS, CLOT)' },
        rejectionReason: { type: 'string', example: 'เม็ดเลือดแดงแตกอย่างรุนแรง ไม่สามารถตรวจ CBC ได้', description: 'เหตุผลประกอบการ Reject' },
      },
      required: ['sampleIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'ปฏิเสธสำเร็จ' })
  reject(
    @Body()
    body: {
      sampleIds: string[];
      sampleConditionId?: string;
      conditionCode?: string;
      rejectionReason?: string;
      rejectedById?: string;
    },
  ) {
    return this.samplesService.reject(body);
  }
}
