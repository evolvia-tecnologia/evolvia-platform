import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SaveEventFinancialResponsibilityDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() sellerOrganizationId!: string;
  @IsOptional() @IsIn(['ORGANIZER', 'PARTICIPANT']) feeBearer?: 'ORGANIZER' | 'PARTICIPANT';
}
