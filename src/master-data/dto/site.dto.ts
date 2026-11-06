import { PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import type { Prisma } from '@prisma/client';

export class SiteInfoDto {
  @IsOptional() @IsString() siteCode?: string;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() hospitalNameEn?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() subdistrict?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() zipcode?: string;
  @IsOptional() @IsString() lnPattern?: string;
}

export class CreateParentSiteDto {
  @IsString() siteCode!: string;
  @IsString() siteName!: string;
  @IsOptional() @IsString() siteType?: string;
  @IsOptional() @IsString() siteStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() lnPattern?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() subdistrict?: string;
  @IsOptional() @IsString() district?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() zipcode?: string;
  @IsOptional() @IsString() hospitalFile?: string;
  @IsOptional() @IsString() isoFile?: string;
}
export class UpdateParentSiteDto extends PartialType(CreateParentSiteDto) {}

export class CreateClientSiteDto extends CreateParentSiteDto {
  @IsOptional() @IsString() parentSiteId?: string;
  @IsOptional() @IsString() parentSiteCode?: string;
  @IsOptional() @IsString() parentSiteName?: string;
}
export class UpdateClientSiteDto extends PartialType(CreateClientSiteDto) {}

export class CreateWardDto {
  @IsString() wardCode!: string;
  @IsString() wardName!: string;
  @IsOptional() @IsString() siteCode?: string;
  @IsOptional() @IsString() wardStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() parentSiteId?: string;
  @IsOptional() @IsArray() selectedSites?: Prisma.InputJsonArray;
  @IsOptional() @IsString() hospitalFile?: string;
}
export class UpdateWardDto extends PartialType(CreateWardDto) {}

export class CreateDepartmentDto {
  @IsString() departmentCode!: string;
  @IsString() departmentName!: string;
  @IsOptional() @IsString() deptStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() hospitalFile?: string;
}
export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class CreateSampleConditionDto {
  @IsString() conditionCode!: string;
  @IsString() conditionName!: string;
  @IsOptional() @IsString() sampleStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() hospitalFile?: string;
}
export class UpdateSampleConditionDto extends PartialType(
  CreateSampleConditionDto,
) {}
