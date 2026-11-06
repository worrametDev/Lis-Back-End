import { PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString() username!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() firstName!: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() telNo?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() organization?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() userRole?: string;
  @IsOptional() @IsString() userStatus?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() clientSite?: string;
  @IsOptional() @IsString() parentSite?: string;
  @IsOptional() @IsString() license?: string;
  @IsOptional() @IsString() licenseNo?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() healthRegion?: string;
  @IsOptional() @IsString() signatureUrl?: string;
  @IsOptional() @IsString() parentSiteId?: string;
  @IsOptional() @IsString() clientSiteId?: string;
  @IsOptional() @IsBoolean() telemedicineAccess?: boolean;
  @IsOptional() @IsString() telemedicineRole?: string;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateTelemedicineAccessDto {
  @IsBoolean() telemedicineAccess!: boolean;
  @IsOptional()
  @IsIn(['DOCTOR', 'NURSE', 'STAFF', 'ADMIN'])
  telemedicineRole?: string;
}
