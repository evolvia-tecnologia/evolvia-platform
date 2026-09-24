import { IsInt, IsString, Min } from 'class-validator';

export class SaveEventFinancialResponsibilityDto {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsString() sellerOrganizationId!: string;
}
