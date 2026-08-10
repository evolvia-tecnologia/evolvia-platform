import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ScientificReviewRecommendation } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  CreateScientificReviewAssignmentInput,
  CreateScientificReviewCriterionInput,
  DeclareScientificReviewConflictInput,
  SaveScientificReviewInput,
  ScientificReviewScoreInput,
  ScientificReviewsService,
} from './scientific-reviews.service';

class CreateScientificReviewCriterionDto implements CreateScientificReviewCriterionInput {
  @IsString() @MinLength(2) @MaxLength(160) label!: string;
  @IsOptional() @IsString() @MaxLength(800) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsNumber({ allowNaN: false, allowInfinity: false }) minScore!: number;
  @IsNumber({ allowNaN: false, allowInfinity: false }) maxScore!: number;
  @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0.000001) weight?: number;
}

class CreateScientificReviewAssignmentDto implements CreateScientificReviewAssignmentInput {
  @IsString() @MinLength(10) @MaxLength(64) submissionId!: string;
  @IsString() @MinLength(10) @MaxLength(64) versionId!: string;
  @IsString() @MinLength(10) @MaxLength(64) reviewerPersonId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) assignmentRound?: number;
  @IsOptional() @IsDateString() dueAt?: string;
}

class DeclareScientificReviewConflictDto implements DeclareScientificReviewConflictInput {
  @IsBoolean() hasConflict!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

class ScientificReviewScoreDto implements ScientificReviewScoreInput {
  @IsString() @MinLength(10) @MaxLength(64) criterionId!: string;
  @IsNumber({ allowNaN: false, allowInfinity: false }) value!: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

class SaveScientificReviewDto implements SaveScientificReviewInput {
  @IsOptional() @IsEnum(ScientificReviewRecommendation) recommendation?: ScientificReviewRecommendation;
  @IsOptional() @IsString() @MaxLength(6000) authorComment?: string;
  @IsOptional() @IsString() @MaxLength(6000) confidentialComment?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScientificReviewScoreDto) scores!: ScientificReviewScoreDto[];
}

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/reviews')
export class ScientificReviewsController {
  constructor(private readonly reviews: ScientificReviewsService) {}

  @Get('management')
  management(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.reviews.getManagement(request.user!.id, eventId);
  }

  @Post('criteria')
  createCriterion(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificReviewCriterionDto,
  ) {
    return this.reviews.createCriterion(request.user!.id, eventId, dto);
  }

  @Post('assignments')
  createAssignment(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: CreateScientificReviewAssignmentDto,
  ) {
    return this.reviews.createAssignment(request.user!.id, eventId, dto);
  }

  @Get('mine')
  mine(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.reviews.getReviewerWorkspace(request.user!.id, request.user!.email, eventId);
  }

  @Put('mine/:assignmentId/conflict')
  declareConflict(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: DeclareScientificReviewConflictDto,
  ) {
    return this.reviews.declareConflict(request.user!.id, request.user!.email, eventId, assignmentId, dto);
  }

  @Put('mine/:assignmentId/draft')
  saveDraft(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: SaveScientificReviewDto,
  ) {
    return this.reviews.saveDraft(request.user!.id, request.user!.email, eventId, assignmentId, dto);
  }

  @Post('mine/:assignmentId/submit')
  submitReview(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: SaveScientificReviewDto,
  ) {
    return this.reviews.submitReview(request.user!.id, request.user!.email, eventId, assignmentId, dto);
  }
}
