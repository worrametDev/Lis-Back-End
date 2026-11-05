import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class UpdateResultItemDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  testResult?: string;

  @IsOptional()
  @IsString()
  repeatResult?: string;

  @IsOptional()
  @IsIn(['H', 'A', 'N'])
  flag?: 'H' | 'A' | 'N';
}

export class UpdateResultsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateResultItemDto)
  items!: UpdateResultItemDto[];
}
