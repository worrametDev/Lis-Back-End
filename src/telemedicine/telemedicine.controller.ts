import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import {
  ConsultationQueryDto,
  CreateConsultationDto,
  CreateQueueDto,
  QueueQueryDto,
  UpdateQueueDto,
  UpdateSettingsDto,
} from './dto/telemedicine.dto';
import { TelemedicineService } from './telemedicine.service';

@ApiTags('Telemedicine')
@ApiBearerAuth('JWT-auth')
@Controller('telemedicine')
export class TelemedicineController {
  constructor(private readonly service: TelemedicineService) {}
  @Get('queues') queues(
    @Req() req: AuthenticatedRequest,
    @Query() query: QueueQueryDto,
  ) {
    return this.service.findQueues(req.user.sub, query.search, query.status);
  }
  @Post('queues') createQueue(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateQueueDto,
  ) {
    return this.service.createQueue(req.user.sub, dto);
  }
  @Patch('queues/:id') patchQueue(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
  ) {
    return this.service.updateQueue(req.user.sub, id, dto);
  }
  @Put('queues/:id') putQueue(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
  ) {
    return this.service.updateQueue(req.user.sub, id, dto);
  }
  @Delete('queues/:id') deleteQueue(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.cancelQueue(req.user.sub, id);
  }
  @Get('dashboard') dashboard(@Req() req: AuthenticatedRequest) {
    return this.service.dashboard(req.user.sub);
  }
  @Get('patients/:hn') patient(
    @Req() req: AuthenticatedRequest,
    @Param('hn') hn: string,
  ) {
    return this.service.patient(req.user.sub, hn);
  }
  @Get('consultations') consultations(
    @Req() req: AuthenticatedRequest,
    @Query() query: ConsultationQueryDto,
  ) {
    return this.service.consultations(req.user.sub, query.search);
  }
  @Post('consultations') createConsultation(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateConsultationDto,
  ) {
    return this.service.createConsultation(req.user.sub, dto);
  }
  @Get('settings') settings(@Req() req: AuthenticatedRequest) {
    return this.service.getSettings(req.user.sub);
  }
  @Put('settings') updateSettings(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.service.updateSettings(req.user.sub, dto);
  }
}
