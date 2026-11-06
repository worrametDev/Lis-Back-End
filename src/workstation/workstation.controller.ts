import { Controller, Get, Post, Body, Param, Req, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { WorkstationWorkflowService } from './workstation-workflow.service';
import { WorkstationService } from './workstation.service';
import { UpdateResultsDto } from './dto/update-results.dto';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  ApproveDto,
  ChangeResultsDto,
  ReportDto,
  SampleResultsDto,
  VoidResultDto,
} from './dto/workflow.dto';

@ApiTags('Workstation')
@ApiBearerAuth('JWT-auth')
@Controller('workstation')
export class WorkstationController {
  constructor(
    private readonly workstationService: WorkstationService,
    private readonly workflow: WorkstationWorkflowService,
  ) {}

  @Get('history/:sampleId')
  history(
    @Param('sampleId') sampleId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workflow.history(
      sampleId,
      page ? Number(page) : undefined,
      pageSize ? Number(pageSize) : undefined,
    );
  }

  @Post('transfer-repeat')
  transferRepeat(
    @Body() body: SampleResultsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflow.transferRepeat(
      body.sampleId,
      body.resultIds,
      req.user.sub,
    );
  }

  @Post('report')
  report(
    @Body()
    body: ReportDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflow.report(body.sampleId, body.items, req.user.sub);
  }

  @Post('repeat')
  repeat(@Body() body: SampleResultsDto, @Req() req: AuthenticatedRequest) {
    return this.workflow.repeat(body.sampleId, body.resultIds, req.user.sub);
  }

  @Get('queue')
  @ApiOperation({
    summary: 'ดึงคิวผู้ป่วยที่รอการตรวจผลแล็บ (Patient Queue Table ด้านบน)',
  })
  @ApiResponse({ status: 200, description: 'คืนค่าคิวผู้ป่วยในห้องแล็บ' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  getQueue(@Query('page') page?: number, @Query('pageSize') pageSize?: number) {
    return this.workstationService.getQueue({ page, pageSize });
  }

  @Get('results/:sampleId')
  @ApiOperation({
    summary:
      'ดึงรายการผลแล็บของสิ่งส่งตรวจที่เลือก (Test Results Table ด้านล่าง)',
  })
  @ApiParam({ name: 'sampleId', description: 'Sample UUID' })
  @ApiResponse({
    status: 200,
    description: 'คืนค่าผลการตรวจ พร้อมค่า Ref Range, Unit, Flag, Repeat',
  })
  getResults(@Param('sampleId') sampleId: string) {
    return this.workstationService.getResults(sampleId);
  }

  @Post('results')
  @ApiOperation({
    summary: 'บันทึก/แก้ไขผลตรวจแล็บ (คำนวณ Flag H/A/N อัตโนมัติ)',
  })
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
              testResult: {
                type: 'string',
                example: '14.8',
                description: 'ค่าผลตรวจที่กรอก',
              },
              repeatResult: {
                type: 'string',
                example: '14.7',
                description: 'ค่าผลตรวจซ้ำ',
              },
              flag: {
                type: 'string',
                enum: ['H', 'A', 'N'],
                example: 'N',
                description: 'Flag ผลตรวจ',
              },
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
  updateResults(@Body() body: UpdateResultsDto) {
    return this.workstationService.updateResults(body.items || []);
  }

  @Post('approve')
  @ApiOperation({
    summary:
      'อนุมัติผลแล็บ (APPROVE button - ตรวจสอบความถูกต้องและลงนามดิจิทัล)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sampleId: {
          type: 'string',
          description: 'อนุมัติทุกรายการของ Sample ID นี้',
        },
        resultIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'เลือกอนุมัติเฉพาะ Result IDs ที่ระบุ',
        },
        approvedById: {
          type: 'string',
          description: 'UUID ของนักเทคนิคการแพทย์ผู้อนุมัติ',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'อนุมัติผลสำเร็จ' })
  approve(
    @Body()
    body: ApproveDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflow.approve(body.sampleId, body.resultIds, req.user.sub);
  }

  @Post('void')
  @ApiOperation({
    summary: 'ยกเลิกผลแล็บพร้อมระบุสาเหตุ (ตามมาตรฐาน ISO 15189 Audit Trail)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Test Result UUID' },
        reason: {
          type: 'string',
          example: 'สิ่งส่งตรวจมีก้อนคลัตปนเปื้อน ต้องเจาะเก็บตัวอย่างใหม่',
          description: 'เหตุผลการยกเลิก',
        },
      },
      required: ['id', 'reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'ยกเลิกผลสำเร็จ' })
  voidResult(@Body() body: VoidResultDto) {
    return this.workstationService.voidResult(body.id, body.reason);
  }

  @Post('delete-results')
  @ApiOperation({
    summary: 'ลบผลตรวจแล็บ (ISO 15189 Soft Delete / Void พร้อม Audit Trail)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resultIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of result UUIDs',
        },
        reason: { type: 'string', example: 'ยกเลิกคำสั่งตรวจซ้ำซ้อน' },
        userAccount: { type: 'string', example: 'thititada.p' },
        sampleId: { type: 'string' },
      },
      required: ['resultIds', 'reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'ลบผลตรวจสำเร็จ' })
  deleteResults(
    @Body()
    body: ChangeResultsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflow.changeResults(
      { ...body, sampleId: body.sampleId! },
      req.user.sub,
      true,
    );
  }

  @Post('re-status')
  @ApiOperation({
    summary: 'ปรับสถานะผลแล็บ / สิ่งส่งตรวจ (Re-status พร้อม Audit Trail)',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resultIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of result UUIDs',
        },
        reason: { type: 'string', example: 'ส่งตรวจซ้ำเพื่อยืนยันค่าผิดปกติ' },
        targetStatus: { type: 'string', example: 'IN_PROCESS' },
        userAccount: { type: 'string', example: 'thititada.p' },
        sampleId: { type: 'string' },
      },
      required: ['reason'],
    },
  })
  @ApiResponse({ status: 200, description: 'ปรับสถานะสำเร็จ' })
  reStatus(
    @Body()
    body: ChangeResultsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflow.changeResults(
      { ...body, sampleId: body.sampleId! },
      req.user.sub,
    );
  }
}
