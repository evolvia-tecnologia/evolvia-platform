import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, Min } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationBenefitInput } from './registration-benefits-policy';
import { RegistrationBenefitsService } from './registration-benefits.service';

class SaveRegistrationBenefitsDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsArray()
  benefits!: RegistrationBenefitInput[];
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-benefits')
export class RegistrationBenefitsController {
  constructor(private readonly benefits: RegistrationBenefitsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.benefits.get(request.user!.id, eventId);
  }

  @Put()
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: SaveRegistrationBenefitsDto,
  ) {
    return this.benefits.save(request.user!.id, eventId, dto);
  }
}
