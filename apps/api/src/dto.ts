import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}
export class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}
export enum EventFormatDto { IN_PERSON='IN_PERSON', ONLINE='ONLINE', HYBRID='HYBRID' }
export enum RegistrationModeDto { FREE='FREE', PAID='PAID', INVITATION='INVITATION' }
export class CreateEventDto {
  @IsString() @MinLength(3) name!: string;
  @IsString() @MinLength(2) eventType!: string;
  @IsEnum(EventFormatDto) format!: EventFormatDto;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() venue?: string;
  @IsEnum(RegistrationModeDto) registrationMode!: RegistrationModeDto;
}
