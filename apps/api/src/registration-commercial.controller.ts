import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, Min } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationCategoryInput } from './registration-commercial-policy';
import { RegistrationCommercialService } from './registration-commercial.service';

class SaveRegistrationCommercialDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsArray()
  categories!: RegistrationCategoryInput[];
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-commercial')
export class RegistrationCommercialController {
  constructor(private readonly commercial: RegistrationCommercialService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.commercial.get(request.user!.id, eventId);
  }

  @Put()
  save(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() dto: SaveRegistrationCommercialDto,
  ) {
    return this.commercial.save(request.user!.id, eventId, dto);
  }
}
