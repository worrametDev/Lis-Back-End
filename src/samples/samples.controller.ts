import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SamplesService } from './samples.service';

@ApiTags('Sample Receiving')
@ApiBearerAuth('JWT-auth')
@Controller('samples')
export class SamplesController {
  constructor(private readonly samplesService: SamplesService) {}

  @Get()
  @ApiOperation({
    summary: 'ดึงรายการสิ่งส่งตรวจสำหรับหน้าตรวจรับ (Sample Receiving Table)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'กรองตามสถานะ (REGISTERED, RECEIVED, REJECTED)',
  })
  @ApiQuery({
    name: 'clientSiteId',
    required: false,
    description: 'กรองตามหน่วยงานส่งตรวจ',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'ค้นหาด้วย Lab Number, Barcode, หรือ HN',
  })
  @ApiQuery({
    name: 'createdFrom',
    required: false,
    description: 'กรองตั้งแต่วันที่สร้าง (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'createdTo',
    required: false,
    description: 'กรองถึงวันที่สร้าง (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'receivedFrom',
    required: false,
    description: 'กรองตั้งแต่วันที่ตรวจรับ (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'receivedTo',
    required: false,
    description: 'กรองถึงวันที่ตรวจรับ (YYYY-MM-DD)',
  })
  @ApiResponse({ status: 200, description: 'คืนค่ารายการสิ่งส่งตรวจ' })
  findAll(
    @Query('status') status?: string,
    @Query('clientSiteId') clientSiteId?: string,
    @Query('search') search?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('receivedFrom') receivedFrom?: string,
    @Query('receivedTo') receivedTo?: string,
  ) {
    return this.samplesService.findAll({
      status,
      clientSiteId,
      search,
      createdFrom,
      createdTo,
      receivedFrom,
      receivedTo,
    });
  }

  @Post('receive')
  @ApiOperation({
    summary: 'ตรวจรับสิ่งส่งตรวจเข้าแล็บ (RECEIVE button - รองรับแบบ Bulk)',
  })
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
        autoBarcode: {
          type: 'boolean',
          example: true,
          description: 'สั่งพิมพ์บาร์โค้ดอัตโนมัติ',
        },
        condition: {
          type: 'string',
          example: 'ปกติ (Normal)',
          description: 'Specimen Condition (เช่น ปกติ, Hemolysis)',
        },
        sampleConditionId: {
          type: 'string',
          description: 'ID ของ Sample Condition',
        },
        conditionOther: {
          type: 'string',
          description: 'รายละเอียดสภาพสิ่งส่งตรวจอื่นๆ',
        },
      },
      required: ['sampleIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'ตรวจรับสำเร็จ' })
  receive(
    @Body()
    body: {
      sampleIds: string[];
      autoBarcode?: boolean;
      sampleConditionId?: string;
      conditionCode?: string;
      condition?: string;
      conditionOther?: string;
      receivedById?: string;
    },
  ) {
    return this.samplesService.receive(body);
  }

  @Post('reject')
  @ApiOperation({
    summary:
      'ปฏิเสธสิ่งส่งตรวจ (REJECT button - บันทึก Specimen Condition/สาเหตุ)',
  })
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
        condition: {
          type: 'string',
          example: 'Hemolysis',
          description: 'Specimen Condition',
        },
        conditionCode: {
          type: 'string',
          example: 'HEMOLYSIS',
          description: 'รหัสสภาพสิ่งส่งตรวจ (เช่น HEMOLYSIS, CLOT)',
        },
        sampleConditionId: {
          type: 'string',
          description: 'ID ของ Sample Condition',
        },
        conditionOther: {
          type: 'string',
          description: 'รายละเอียดสภาพสิ่งส่งตรวจอื่นๆ',
        },
        rejectionReason: {
          type: 'string',
          example: 'เม็ดเลือดแดงแตกอย่างรุนแรง ไม่สามารถตรวจ CBC ได้',
          description: 'เหตุผลประกอบการ Reject',
        },
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
      condition?: string;
      conditionOther?: string;
      rejectionReason?: string;
      rejectedById?: string;
    },
  ) {
    return this.samplesService.reject(body);
  }

  @Post('reset')
  @ApiOperation({
    summary: 'รีเซ็ตสถานะสิ่งส่งตรวจกลับเป็น REGISTERED (Reset Sample Status)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sampleIds: {
          type: 'array',
          items: { type: 'string' },
          example: ['smp-uuid-1'],
          description: 'รายการ UUID ของ Sample ที่ต้องการรีเซ็ตสถานะ',
        },
      },
      required: ['sampleIds'],
    },
  })
  @ApiResponse({ status: 200, description: 'รีเซ็ตสำเร็จ' })
  reset(@Body() body: { sampleIds: string[] }) {
    return this.samplesService.reset(body.sampleIds);
  }
}
