import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { ScientificFileBatchService } from './scientific-file-batch.service';

type ByteResponse = { setHeader(name: string, value: string | number): void; end(body: Buffer): void };

@UseGuards(AuthGuard)
@Controller('scientific-events/:eventId/submission-files')
export class ScientificFileBatchController {
  constructor(private readonly batch: ScientificFileBatchService) {}

  @Get('batch')
  async download(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Res() response: ByteResponse,
  ) {
    const result = await this.batch.download(request.user!.id, eventId);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', 'attachment; filename="trabalhos.zip"');
    response.setHeader('Content-Length', result.bytes.length);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Evolvia-Truncated', result.truncated ? '1' : '0');
    response.end(result.bytes);
  }
}
