import { MembershipRole } from '@prisma/client';
import {
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
