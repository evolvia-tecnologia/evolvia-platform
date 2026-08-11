import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

export const EVENT_PUBLICATION_SECTION_KINDS = [
  'TEXT',
  'HIGHLIGHT',
  'CANONICAL_REFERENCE',
] as const;

export const EVENT_PUBLICATION_CANONICAL_SOURCE_TYPES = [
  'SCIENTIFIC_GUEST',
  'SCIENTIFIC_ACTIVITY',
] as const;

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

export class CreateEventPublicationSectionDto {
  @IsIn(EVENT_PUBLICATION_SECTION_KINDS)
  kind!: (typeof EVENT_PUBLICATION_SECTION_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder!: number;

  @IsObject()
  content!: Record<string, unknown>;

  @IsOptional()
  @IsIn(EVENT_PUBLICATION_CANONICAL_SOURCE_TYPES)
  canonicalSourceType?: (typeof EVENT_PUBLICATION_CANONICAL_SOURCE_TYPES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  canonicalSourceId?: string | null;
}

export class UpdateEventPublicationSectionDto {
  @IsInt()
  @Min(1)
  revision!: number;

  @IsOptional()
  @IsIn(EVENT_PUBLICATION_SECTION_KINDS)
  kind?: (typeof EVENT_PUBLICATION_SECTION_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string | null;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsIn(EVENT_PUBLICATION_CANONICAL_SOURCE_TYPES)
  canonicalSourceType?: (typeof EVENT_PUBLICATION_CANONICAL_SOURCE_TYPES)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  canonicalSourceId?: string | null;
}

export class ReorderEventPublicationSectionsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  sectionIds!: string[];
}

export class RemoveEventPublicationSectionDto {
  @IsInt()
  @Min(1)
  revision!: number;
}
