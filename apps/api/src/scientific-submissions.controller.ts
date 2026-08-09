import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ScientificReviewMode } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  AddScientificSubmissionAuthorInput,
  ConfigureScientificSubmissionsInput,
  CreateScientificSubmissionInput,
  CreateScientificSubmissionModalityInput,
  ScientificSubmissionsService,
  SubmitScientificSubmissionInput,
} from './scientific-submissions.service';

class ConfigureScientificSubmissionsDto implements ConfigureScientificSubmissionsInput {
  @IsOptional() @IsBoolean() requireArea?: boolean;
  @IsOptional() @IsBoolean() requireSubarea?: boolean;
  @IsOptional() @IsBoolean() requireFile?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(100) minAuthors?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100) maxAuthors?: number;
  @IsOptional() @IsEnum(ScientificReviewMode) reviewMode?: ScientificReviewMode;
  @IsOptional() @IsBoolean() allowCorrections?: boolean;
}

class CreateScientificSubmissionModalityDto implements CreateScientificSubmissionModalityInput {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(600) description?: string;
  @IsOptional() @IsObject() rules?: Record<string, unknown>;
}

class CreateScientificSubmissionDto implements CreateScientificSubmissionInput {
  @IsString() @MinLength(10) @MaxLength(64) modalityId!: string;
  @IsString() @MinLength(2) @MaxLength(220) title!: string;
  @IsOptional() @IsString() @MaxLength(8000) abstractText?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @IsOptional() @IsString() @MinLength(10) @MaxLength(64) taxonomyAreaId?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(64) taxonomySubareaId?: string;
}

class AddScientificSubmissionAuthorDto implements AddScientificSubmissionAuthorInput {
  @IsString() @MinLength(10) @MaxLength(64) personId!: string;
  @IsInt() @Min(1) @Max(100) sortOrder!: number;
  @IsOptional() @IsBoolean() isPresenter?: boolean;
  @IsOptional() @IsBoolean() isCorresponding?: boolean;
}

class SubmitScientificSubmissionDto implements SubmitScientificSubmissionInput {
  @IsOptional() @IsString() @MaxLength(500) fileKey?: string;
  @IsOptional() @IsString() @MaxLength(128) contentHash?: string;
}

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/submissions')
export class ScientificSubmissionsController {
  constructor(private readonly submissions: ScientificSubmissionsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.submissions.get(request.user!.id, eventId);
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

  @Post()
  createSubmission(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificSubmissionDto,
  ) {
    return this.submissions.createSubmission(request.user!.id, eventId, dto);
  }

  @Post(':submissionId/authors')
  addAuthor(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: AddScientificSubmissionAuthorDto,
  ) {
    return this.submissions.addAuthor(request.user!.id, eventId, submissionId, dto);
  }

  @Post(':submissionId/submit')
  submit(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: SubmitScientificSubmissionDto,
  ) {
    return this.submissions.submit(request.user!.id, eventId, submissionId, dto);
  }
}
