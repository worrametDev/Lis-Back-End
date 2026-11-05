import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class SampleResultsDto {
  @IsUUID() sampleId!: string;
  @IsArray() @IsUUID(undefined, { each: true }) resultIds!: string[];
}

export class ReportDto {
  @IsUUID() sampleId!: string;
  @IsArray() items!: Array<{ id: string; testResult: string }>;
}

export class ApproveDto {
  @IsOptional() @IsUUID() sampleId?: string;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  resultIds?: string[];
}

export class VoidResultDto {
  @IsUUID() id!: string;
  @IsString() @Length(1, 1000) reason!: string;
}

export class ChangeResultsDto {
  @IsArray() @IsUUID(undefined, { each: true }) resultIds!: string[];
  @IsString() @Length(1, 1000) reason!: string;
  @IsOptional() @IsString() userAccount?: string;
  @IsOptional() @IsUUID() sampleId?: string;
  @IsOptional()
  @IsIn([
    'REGISTERED',
    'RECEIVED',
    'IN_PROCESS',
    'VERIFIED',
    'APPROVED',
    'REJECTED',
  ])
  targetStatus?: string;
}
