import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  CreateScientificReviewAssignmentInput,
  CreateScientificReviewCriterionInput,
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

/**
 * Superfície administrativa do Gate A7.
 *
 * A comissão configura critérios, distribui versões e acompanha pareceres.
 * Conflito, notas e parecer são enviados pelo avaliador em /evento/{slug}/avaliador.
 */
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
}
