import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ScientificAbstractCounterUnit, ScientificEvaluationStyle, ScientificReviewMode } from '@prisma/client';
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
import {
  ConfigureScientificSubmissionsInput,
  CreateScientificSubmissionModalityInput,
  ScientificSubmissionsService,
} from './scientific-submissions.service';

class ConfigureScientificSubmissionsDto implements ConfigureScientificSubmissionsInput {
  @IsOptional() @IsBoolean() requireArea?: boolean;
  @IsOptional() @IsBoolean() requireSubarea?: boolean;
  @IsOptional() @IsBoolean() requireFile?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxSubmissionsPerAuthor?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) minAuthors?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxAuthors?: number;
  @IsOptional() @IsBoolean() requirePresenter?: boolean;
  @IsOptional() @IsBoolean() requireCorrespondingAuthor?: boolean;
  @IsOptional() @IsBoolean() requireAuthorInstitution?: boolean;
  @IsOptional() @IsBoolean() collectAdditionalAuthors?: boolean;
  @IsOptional() @IsBoolean() collectAuthorOrder?: boolean;
  @IsOptional() @IsBoolean() collectAuthorInstitution?: boolean;
  @IsOptional() @IsInt() @Min(50) @Max(1000) titleMaxLength?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) minKeywords?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) maxKeywords?: number;
  @IsOptional() @IsArray() presentationFormats?: Array<{ code: string; label: string; submissionEnabled?: boolean; evaluationEnabled?: boolean }>;
  @IsOptional() @IsEnum(ScientificReviewMode) reviewMode?: ScientificReviewMode;
  @IsOptional() @IsBoolean() allowCorrections?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(20) maxPresenters?: number;
  @IsOptional() @IsBoolean() collectScientificName?: boolean;
  @IsOptional() @IsBoolean() collectInstitutionAddress?: boolean;
  @IsOptional() @IsBoolean() collectFundingAgency?: boolean;
  @IsOptional() @IsBoolean() collectConflictOfInterest?: boolean;
  @IsOptional() @IsBoolean() requireSubmitterAsFirstAuthor?: boolean;
  @IsOptional() @IsBoolean() requirePresentationSuggestion?: boolean;
  @IsOptional() @IsBoolean() collectTypedAbstract?: boolean;
  @IsOptional() @IsBoolean() collectReferences?: boolean;
  @IsOptional() @IsEnum(ScientificAbstractCounterUnit) abstractCounterUnit?: ScientificAbstractCounterUnit;
  @IsOptional() @IsInt() @Min(0) @Max(20000) abstractMin?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20000) abstractMax?: number;
  @IsOptional() @IsBoolean() showProceedingsAuthorization?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) proceedingsAuthorizationPt?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) proceedingsAuthorizationEs?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) proceedingsAuthorizationEn?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(10) reviewersPerSubmission?: number | null;
  @IsOptional() @IsBoolean() coordinatorDecidesStatus?: boolean;
  @IsOptional() @IsEnum(ScientificEvaluationStyle) evaluationStyle?: ScientificEvaluationStyle;
  @IsOptional() @IsBoolean() acceptedWorkUploadEnabled?: boolean;
  @IsOptional() @IsString() acceptedWorkUploadDeadline?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) acceptanceLetterBody?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) rejectionLetterBody?: string | null;
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
