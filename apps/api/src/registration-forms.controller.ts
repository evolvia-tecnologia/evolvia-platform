import { Body, Controller, Get, Header, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsString, MaxLength, Min } from 'class-validator';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { RegistrationField, RegistrationFormsService, SaveRegistrationFormInput } from './registration-forms.service';
import { RegistrationTermsDocumentService } from './registration-terms-document.service';

class SaveRegistrationFormDto implements SaveRegistrationFormInput {
  @IsInt() @Min(0) expectedRevision!: number;
  @IsArray() fields!: RegistrationField[];
}
class PublishRegistrationFormDto {
  @IsInt() @Min(1) expectedRevision!: number;
}
class UploadRegistrationTermsDto {
  @IsString() @MaxLength(7_000_000) contentBase64!: string;
  @IsString() @MaxLength(120) fileName!: string;
}

@UseGuards(AuthGuard)
@Controller('events/:eventId/registration-form')
export class RegistrationFormsController {
  constructor(
    private readonly forms: RegistrationFormsService,
    private readonly terms: RegistrationTermsDocumentService,
  ) {}

  @Get('post-event-report')
  postEventReport(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.forms.postEventReport(request.user!.id, eventId);
  }

  @Get('post-event-report/bi')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  postEventBiReport(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.forms.postEventBiReport(request.user!.id, eventId);
  }

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

  @Post('terms')
  attachTerms(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string, @Body() dto: UploadRegistrationTermsDto) {
    return this.terms.attach(request.user!.id, eventId, dto);
  }

  @Get('terms/file')
  async termsFile(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    const result = await this.terms.readForOrganizer(request.user!.id, eventId);
    const headers = this.terms.headers();
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.setHeader('Content-Length', result.bytes.length);
    response.end(result.bytes);
  }
}



