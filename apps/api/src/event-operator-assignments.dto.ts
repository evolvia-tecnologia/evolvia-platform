import { ArrayMaxSize, ArrayUnique, IsArray, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { OperatorPermission } from '@prisma/client';

export class SaveEventOperatorAssignmentDto {
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsEnum(OperatorPermission, { each: true })
  permissions!: OperatorPermission[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
