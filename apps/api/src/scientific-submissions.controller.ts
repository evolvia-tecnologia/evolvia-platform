import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ScientificReviewMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsArray,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { SCIENTIFIC_NUMERIC_RULE_BOUNDS } from './scientific-submission-numeric-rules';
import {
  ConfigureScientificSubmissionsInput,
  CreateScientificSubmissionModalityInput,
  ScientificSubmissionsService,
} from './scientific-submissions.service';

const numeric = SCIENTIFIC_NUMERIC_RULE_BOUNDS;

class ConfigureScientificSubmissionsDto implements ConfigureScientificSubmissionsInput {
  @IsOptional() @IsBoolean() requireArea?: boolean;
  @IsOptional() @IsBoolean() requireSubarea?: boolean;
  @IsOptional() @IsBoolean() requireFile?: boolean;
  @IsOptional() @IsInt() @Min(numeric.maxSubmissionsPerAuthor.min) @Max(numeric.maxSubmissionsPerAuthor.max) maxSubmissionsPerAuthor?: number;
  @IsOptional() @IsInt() @Min(numeric.minAuthors.min) @Max(numeric.minAuthors.max) minAuthors?: number;
  @IsOptional() @IsInt() @Min(numeric.maxAuthors.min) @Max(numeric.maxAuthors.max) maxAuthors?: number;
  @IsOptional() @IsBoolean() requirePresenter?: boolean;
  @IsOptional() @IsBoolean() requireCorrespondingAuthor?: boolean;
  @IsOptional() @IsBoolean() requireAuthorInstitution?: boolean;
  @IsOptional() @IsInt() @Min(numeric.titleMaxLength.min) @Max(numeric.titleMaxLength.max) titleMaxLength?: number;
  @IsOptional() @IsInt() @Min(numeric.minKeywords.min) @Max(numeric.minKeywords.max) minKeywords?: number;
  @IsOptional() @IsInt() @Min(numeric.maxKeywords.min) @Max(numeric.maxKeywords.max) maxKeywords?: number;
  @IsOptional() @IsArray() presentationFormats?: Array<{ code: string; label: string }>;
  @IsOptional() @IsEnum(ScientificReviewMode) reviewMode?: ScientificReviewMode;
  @IsOptional() @IsBoolean() allowCorrections?: boolean;
}

class CreateScientificSubmissionModalityDto implements CreateScientificSubmissionModalityInput {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsOptional() @IsObject() rules?: Record<string, unknown>;
}

/**
 * Superfície administrativa do A6.
 *
 * O organizador configura regras, modalidades e acompanha o processo. Criar trabalho,
 * informar autoria, corrigir conteúdo e submeter versões pertencem ao portal do autor
 * e não podem ser expostos neste controller administrativo.
 */
@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/submissions')
export class ScientificSubmissionsController {
  constructor(private readonly submissions: ScientificSubmissionsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.submissions.getManagement(request.user!.id, eventId);
  }

  @Put('config')
  configure(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: ConfigureScientificSubmissionsDto,
  ) {
    return this.submissions.configure(request.user!.id, eventId, dto);
  }

  @Post('modalities')
  createModality(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificSubmissionModalityDto,
  ) {
    return this.submissions.createModality(request.user!.id, eventId, dto);
  }
}
