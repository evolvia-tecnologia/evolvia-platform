import { IsEmail, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateEventPublicationDto {
  @IsInt()
  @Min(0)
  revision!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  shortDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(12000)
  fullDescription?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  publicContactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  publicContactPhone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  seoTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  accessibilitySummary?: string | null;

  @IsOptional()
  @IsObject()
  themeConfig?: Record<string, unknown> | null;
}
