import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { LegalProfileInput } from './organization-legal-policy';

export class SaveOrganizationLegalProfileDto implements LegalProfileInput {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsIn(['PERSON', 'COMPANY']) kind!: 'PERSON' | 'COMPANY';
  @IsString() @MaxLength(160) legalName!: string;
  @IsOptional() @IsString() @MaxLength(160) tradeName?: string;
  @IsString() @MaxLength(24) taxId!: string;
  @IsEmail() @MaxLength(160) contactEmail!: string;
  @IsString() @MaxLength(10) postalCode!: string;
  @IsString() @MaxLength(160) street!: string;
  @IsString() @MaxLength(20) number!: string;
  @IsOptional() @IsString() @MaxLength(100) complement?: string;
  @IsString() @MaxLength(100) district!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsString() @MaxLength(2) state!: string;
  @IsOptional() @IsString() @MaxLength(36) asaasWalletId?: string;
}
