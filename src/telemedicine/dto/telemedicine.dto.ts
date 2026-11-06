import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class QueueQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() status?: string;
}

export class CreateQueueDto {
  @IsOptional() @IsString() orderId?: string;
  @IsString() hn!: string;
  @IsOptional() @IsString() patientName?: string;
  @IsOptional() @IsString() ageGender?: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @MinLength(1) chiefComplaint!: string;
  @IsOptional()
  @IsIn(['Normal', 'Urgent', 'NORMAL', 'URGENT'])
  priority?: string;
  @IsOptional() @IsString() parentSiteId?: string;
  @IsOptional() @IsString() clientSiteId?: string;
  @IsOptional() @IsObject() triageData?: Record<string, unknown>;
}

export class UpdateQueueDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() doctor?: string;
  @IsOptional() @IsString() assignedDoctorId?: string;
  @IsOptional() @IsString() chiefComplaint?: string;
  @IsOptional() @IsString() ageGender?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional()
  @IsIn(['Normal', 'Urgent', 'NORMAL', 'URGENT'])
  priority?: string;
  @IsOptional() @IsObject() triageData?: Record<string, unknown>;
}

export class CreateConsultationDto {
  @IsOptional() @IsString() queueId?: string;
  @IsOptional() @IsString() hn?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() noteStatus?: string;
  @IsOptional() @IsString() outcome?: string;
  @IsOptional() @IsString() referral?: string;
  @IsOptional() @IsString() referralSiteName?: string;
  @IsOptional() @IsString() followUp?: string;
  @IsOptional() @IsString() followUpDate?: string;
  @IsOptional() @IsObject() soap?: {
    s?: string;
    o?: string;
    a?: string;
    p?: string;
    chiefComplaint?: string;
    hpi?: string;
    pe?: string;
    assessment?: string;
    planAdvice?: string;
    followUp?: string;
    followUpDate?: string;
    referral?: string;
    referralSiteName?: string;
  };
  @IsOptional() @IsObject() vitals?: Record<string, unknown>;
  @IsOptional() diagnosisCodes?: unknown[];
  @IsOptional() prescriptions?: unknown[];
}

export class ConsultationQueryDto {
  @IsOptional() @IsString() search?: string;
}

export class UpdateSettingsDto {
  @IsOptional() @IsObject() dropdownSettings?: Record<string, unknown>;
  @IsOptional() @IsObject() generalSettings?: Record<string, unknown>;
}
