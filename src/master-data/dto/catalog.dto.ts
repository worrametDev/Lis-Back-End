import { Allow, IsArray, IsOptional, IsString } from 'class-validator';
import type { Prisma } from '@prisma/client';

export class TitleDto {
  @IsOptional() @IsString() titleCode?: string;
  @IsOptional() @IsString() titleName?: string;
  @IsOptional() @IsString() titleNameTh?: string;
  @IsOptional() @IsString() titleNameEn?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
}

export class EthnicityDto {
  @IsOptional() @IsString() ethnicityCode?: string;
  @IsOptional() @IsString() ethnicityName?: string;
  @IsOptional() @IsString() ethnicityNameTh?: string;
  @IsOptional() @IsString() ethnicityNameEn?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
}

export class TestPanelDto {
  @IsOptional() @IsString() panelCode?: string;
  @IsOptional() @IsString() panelName?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() specimenType?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsArray() testItems?: Prisma.InputJsonArray;
  @IsOptional() @IsArray() selectedSites?: string[];
  @IsOptional() @IsString() status?: string;
}

export class ValueListDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
}

export class LabTestDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() selectedSites?: string[];
  @IsOptional() @IsArray() testItems?: Prisma.InputJsonArray;
  @IsOptional() @IsString() status?: string;
}

export class TestProfileDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsArray() tests?: Prisma.InputJsonArray;
  @IsOptional() @IsArray() selectedSites?: string[];
  @IsOptional() @IsString() status?: string;
}

export class AnalyzerDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() protocol?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @Allow() port?: string | number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsArray() orderCodes?: Prisma.InputJsonArray;
}
