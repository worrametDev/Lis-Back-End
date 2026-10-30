import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiQuery,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';

@ApiTags('Order Entry')
@ApiBearerAuth('JWT-auth')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({
    summary:
      'ดึงรายการคำสั่งตรวจทางห้องปฏิบัติการทั้งหมด (Order Register Table)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'ค้นหาด้วย HN, ชื่อผู้ป่วย, หรือ Lab Number',
  })
  @ApiQuery({
    name: 'clientSiteId',
    required: false,
    description: 'กรองตาม Client Site ID',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description:
      'กรองตามสถานะคำสั่งตรวจ (REGISTERED, RECEIVED, COMPLETED, CANCELLED)',
  })
  @ApiQuery({
    name: 'hn',
    required: false,
    description: 'กรองตามเลขที่โรงพยาบาล (HN)',
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
  @ApiResponse({ status: 200, description: 'คืนค่ารายการคำสั่งตรวจ' })
  findAll(
    @Query('search') search?: string,
    @Query('clientSiteId') clientSiteId?: string,
    @Query('status') status?: string,
    @Query('hn') hn?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
  ) {
    return this.ordersService.findAll({
      search,
      clientSiteId,
      status,
      hn,
      createdFrom,
      createdTo,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'ดึงข้อมูลใบสั่งตรวจและสิ่งส่งตรวจโดยละเอียด (Order Info)',
  })
  @ApiParam({ name: 'id', description: 'Order ID' })
  @ApiResponse({
    status: 200,
    description: 'คืนค่าข้อมูลใบสั่งตรวจพร้อมตัวอย่างสิ่งส่งตรวจและผลแล็บ',
  })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @ApiOperation({
    summary: 'ลงทะเบียนคำสั่งตรวจใหม่ (Create New Order Entry Modal)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        hn: {
          type: 'string',
          example: '68/01259',
          description: 'เลขประจำตัวผู้ป่วย (HN)',
        },
        patientName: {
          type: 'string',
          example: 'นายสมปอง มีชัย',
          description: 'ชื่อ-สกุล ผู้ป่วย',
        },
        idCard: {
          type: 'string',
          example: '1234567890123',
          description: 'เลขบัตรประชาชน',
        },
        passportNo: {
          type: 'string',
          example: '',
          description: 'หมายเลขหนังสือเดินทาง',
        },
        clientSiteName: {
          type: 'string',
          example: 'โรงพยาบาลส่งเสริมสุขภาพตำบลทุ่งแสลงหลวง',
          description: 'หน่วยงานส่งตรวจ',
        },
        specimenType: {
          type: 'string',
          example: 'Heparinized Blood',
          description: 'ชนิดสิ่งส่งตรวจ',
        },
        testPanels: {
          type: 'array',
          items: { type: 'string' },
          example: ['CBC', 'FBS'],
          description: 'รายการชุดตรวจแล็บที่สั่ง',
        },
      },
      required: ['hn', 'patientName'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'ลงทะเบียนสำเร็จ ออกรหัส Lab Number และบาร์โค้ดอัตโนมัติ',
  })
  create(@Body() body: any) {
    return this.ordersService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'แก้ไขข้อมูลคำสั่งตรวจ' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.ordersService.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'ยกเลิกคำสั่งตรวจ (Cancel Order)' })
  @ApiParam({ name: 'id', description: 'Order ID' })
  cancel(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }
}
