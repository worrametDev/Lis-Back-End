import { IsArray, IsOptional, IsString, Length } from 'class-validator';
import { PartialType } from '@nestjs/swagger';

export class CreateOrderDto {
  @IsString()
  @Length(1, 100)
  hn!: string;

  @IsString()
  @Length(1, 255)
  patientName!: string;

  @IsOptional() @IsString() idCard?: string;
  @IsOptional() @IsString() passport?: string;
  @IsOptional() @IsString() passportNo?: string;
  @IsOptional() @IsString() clientSiteId?: string;
  @IsOptional() @IsString() clientSiteName?: string;
  @IsOptional() @IsString() clientSite?: string;
  @IsOptional() @IsString() siteCode?: string;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() parentSiteId?: string;
  @IsOptional() @IsString() wardId?: string;
  @IsOptional() @IsString() ward?: string;
  @IsOptional() @IsString() specimenType?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) testPanels?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) selectedTests?: string[];
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() dob?: string;
  @IsOptional() @IsString() age?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() ethnicity?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() subdistrict?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() zipcode?: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsString() patientType?: string;
  @IsOptional() @IsString() entitlement?: string;
  @IsOptional() @IsString() collectedDate?: string;
  @IsOptional() @IsString() urgentStatus?: string;
  @IsOptional() @IsString() testPanel?: string;
  @IsOptional() @IsString() testProfile?: string;
  @IsOptional() @IsString() testItem?: string;
  @IsOptional() @IsArray() orderItems?: Record<string, unknown>[];
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}
