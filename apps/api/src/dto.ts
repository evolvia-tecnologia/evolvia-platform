import { MembershipRole, ScientificTaxonomyLevel } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class AddOrganizationMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(MembershipRole)
  role!: MembershipRole;
}

export class UpdateMembershipRoleDto {
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}

export enum EventFormatDto {
  IN_PERSON = 'IN_PERSON',
  ONLINE = 'ONLINE',
  HYBRID = 'HYBRID',
}

export enum RegistrationModeDto {
  FREE = 'FREE',
  PAID = 'PAID',
  INVITATION = 'INVITATION',
}

export class CreateEventDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsString()
  @MinLength(2)
  eventType!: string;

  @IsEnum(EventFormatDto)
  format!: EventFormatDto;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  venue?: string;

  @IsEnum(RegistrationModeDto)
  registrationMode!: RegistrationModeDto;
}

export class StartEventWizardDto {
  @IsOptional()
  @IsString()
  organizationId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  eventType!: string;
}

export class SaveEventWizardDto {
  @IsString()
  currentStep!: string;

  @IsObject()
  answers!: Record<string, unknown>;

  @IsInt()
  @Min(1)
  revision!: number;
}

export enum ScientificCentralChoiceDto {
  RECOMMENDED = 'RECOMMENDED',
  CUSTOMIZED = 'CUSTOMIZED',
  LATER = 'LATER',
}

export class UpdateScientificCentralBlockDto {
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  blockId!: string;

  @IsEnum(ScientificCentralChoiceDto)
  choice!: ScientificCentralChoiceDto;
}

export class CreateScientificPersonDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  institution?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  orcid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateScientificRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class AssignScientificPersonRoleDto {
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  personId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(64)
  roleId!: string;
}

export class CreateScientificCommitteeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class AddScientificCommitteeMemberDto {
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  committeeId!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(64)
  personId!: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  roleId?: string;

  @IsOptional()
  @IsBoolean()
  isChair?: boolean;
}

export class CreateScientificTaxonomyNodeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name!: string;

  @IsEnum(ScientificTaxonomyLevel)
  level!: ScientificTaxonomyLevel;

  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
