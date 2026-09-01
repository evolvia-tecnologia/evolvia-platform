import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, Min } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationField, RegistrationFormsService, SaveRegistrationFormInput } from './registration-forms.service';

class SaveRegistrationFormDto implements SaveRegistrationFormInput {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsArray() fields!: RegistrationField[];
}
class PublishRegistrationFormDto {
  @IsInt() @Min(1) expectedRevision!: number;
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-form')
export class RegistrationFormsController {
  constructor(private readonly forms: RegistrationFormsService) {}

  @Get()
  get(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.forms.get(request.user!.id, eventId);
  }

  @Put()
  save(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: SaveRegistrationFormDto) {
    return this.forms.save(request.user!.id, eventId, dto);
  }

  @Post('publish')
  publish(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: PublishRegistrationFormDto) {
    return this.forms.publish(request.user!.id, eventId, dto.expectedRevision);
  }
}

