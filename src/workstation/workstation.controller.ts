import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { WorkstationService } from './workstation.service';

@ApiTags('Workstation')
@ApiBearerAuth('JWT-auth')
@Controller('workstation')
export class WorkstationController {
  constructor(private readonly workstationService: WorkstationService) {}

  @Get('queue')
  @ApiOperation({ summary: 'ดึงคิวผู้ป่วยที่รอการตรวจผลแล็บ (Patient Queue Table ด้านบน)' })
  @ApiResponse({ status: 200, description: 'คืนค่าคิวผู้ป่วยในห้องแล็บ' })
  getQueue() {
    return this.workstationService.getQueue();
  }

  @Get('results/:sampleId')
  @ApiOperation({ summary: 'ดึงรายการผลแล็บของสิ่งส่งตรวจที่เลือก (Test Results Table ด้านล่าง)' })
  @ApiParam({ name: 'sampleId', description: 'Sample UUID' })
  @ApiResponse({ status: 200, description: 'คืนค่าผลการตรวจ พร้อมค่า Ref Range, Unit, Flag, Repeat' })
  getResults(@Param('sampleId') sampleId: string) {
    return this.workstationService.getResults(sampleId);
  }

  @Post('results')
  @ApiOperation({ summary: 'บันทึก/แก้ไขผลตรวจแล็บ (คำนวณ Flag H/A/N อัตโนมัติ)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Test Result UUID' },
              testResult: { type: 'string', example: '14.8', description: 'ค่าผลตรวจที่กรอก' },
              repeatResult: { type: 'string', example: '14.7', description: 'ค่าผลตรวจซ้ำ' },
              flag: { type: 'string', enum: ['H', 'A', 'N'], example: 'N', description: 'Flag ผลตรวจ' },
            },
            required: ['id'],
          },
          example: [
            { id: 'result-uuid-1', testResult: '4.52', repeatResult: '4.48' },
            { id: 'result-uuid-2', testResult: '14.2' },
          ],
        },
      },
      required: ['items'],
    },
  })
  @ApiResponse({ status: 200, description: 'บันทึกผลสำเร็จ' })
  updateResults(@Body() body: { items: any[] }) {
    return this.workstationService.updateResults(body.items || []);
  }

  @Post('approve')
  @ApiOperation({ summary: 'อนุมัติผลแล็บ (APPROVE button - ตรวจสอบความถูกต้องและลงนามดิจิทัล)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sampleId: { type: 'string', description: 'อนุมัติทุกรายการของ Sample ID นี้' },
        resultIds: { type: 'array', items: { type: 'string' }, description: 'เลือกอนุมัติเฉพาะ Result IDs ที่ระบุ' },
        approvedById: { type: 'string', description: 'UUID ของนักเทคนิคการแพทย์ผู้อนุมัติ' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'อนุมัติผลสำเร็จ' })
  approve(@Body() body: { sampleId?: string; resultIds?: string[]; approvedById?: string }) {
    return this.workstationService.approve(body);
  }

  @Post('void')
  @ApiOperation({ summary: 'ยกเลิกผลแล็บพร้อมระบุสาเหตุ (ตามมาตรฐาน ISO 15189 Audit Trail)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Test Result UUID' },
        reason: { type: 'string', example: 'สิ่งส่งตรวจมีก้อนคลัตปนเปื้อน ต้องเจาะเก็บตัวอย่างใหม่', description: 'เหตุผลการยกเลิก' },
      },
      required: ['id', 'reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'ยกเลิกผลสำเร็จ' })
  voidResult(@Body() body: { id: string; reason: string }) {
    return this.workstationService.voidResult(body.id, body.reason);
  }

  @Post('delete-results')
  @ApiOperation({ summary: 'ลบผลตรวจแล็บ (ISO 15189 Soft Delete / Void พร้อม Audit Trail)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resultIds: { type: 'array', items: { type: 'string' }, description: 'Array of result UUIDs' },
        reason: { type: 'string', example: 'ยกเลิกคำสั่งตรวจซ้ำซ้อน' },
        userAccount: { type: 'string', example: 'thititada.p' },
        sampleId: { type: 'string' },
      },
      required: ['resultIds', 'reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'ลบผลตรวจสำเร็จ' })
  deleteResults(@Body() body: { resultIds: string[]; reason: string; userAccount?: string; sampleId?: string }) {
    return this.workstationService.deleteResults(body);
  }

  @Post('re-status')
  @ApiOperation({ summary: 'ปรับสถานะผลแล็บ / สิ่งส่งตรวจ (Re-status พร้อม Audit Trail)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resultIds: { type: 'array', items: { type: 'string' }, description: 'Array of result UUIDs' },
        reason: { type: 'string', example: 'ส่งตรวจซ้ำเพื่อยืนยันค่าผิดปกติ' },
        targetStatus: { type: 'string', example: 'IN_PROCESS' },
        userAccount: { type: 'string', example: 'thititada.p' },
        sampleId: { type: 'string' },
      },
      required: ['reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'ปรับสถานะสำเร็จ' })
  reStatus(@Body() body: { resultIds: string[]; reason: string; targetStatus?: string; userAccount?: string; sampleId?: string }) {
    return this.workstationService.reStatus(body);
  }
}
