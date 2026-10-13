import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { EventPeopleSheetService } from './event-people-sheet.service';

type ByteResponse = { setHeader(name: string, value: string | number): void; end(body: string): void };

@UseGuards(AuthGuard)
@Controller('events/:eventId/people')
export class EventPeopleSheetController {
  constructor(private readonly people: EventPeopleSheetService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Param('eventId') eventId: string) {
    return this.people.list(request.user!.id, eventId);
  }

  @Get('sheet')
  async sheet(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Res() response: ByteResponse,
  ) {
    const result = await this.people.sheet(request.user!.id, eventId);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', 'attachment; filename="inscritos.csv"');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Evolvia-Truncated', result.truncated ? '1' : '0');
    response.end(result.csv);
  }
}
