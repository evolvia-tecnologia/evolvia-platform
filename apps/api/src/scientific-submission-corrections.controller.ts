import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import {
  CorrectScientificSubmissionInput,
  ScientificSubmissionCorrectionsService,
} from './scientific-submission-corrections.service';

class CorrectScientificSubmissionDto implements CorrectScientificSubmissionInput {
  @IsString() @MinLength(5) @MaxLength(500) reason!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(220) title?: string;
  @IsOptional() @IsString() @MaxLength(8000) abstractText?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) keywords?: string[];
  @IsOptional() @IsString() @MinLength(10) @MaxLength(64) taxonomyAreaId?: string | null;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(64) taxonomySubareaId?: string | null;
  @IsOptional() @IsString() @MaxLength(500) fileKey?: string | null;
  @IsString() @MinLength(8) @MaxLength(128) contentHash!: string;
}

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/submissions')
export class ScientificSubmissionCorrectionsController {
  constructor(private readonly corrections: ScientificSubmissionCorrectionsService) {}

  @Post(':submissionId/corrections')
  correct(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('submissionId') submissionId: string,
    @Body() dto: CorrectScientificSubmissionDto,
  ) {
    return this.corrections.correct(request.user!.id, eventId, submissionId, dto);
  }
}
