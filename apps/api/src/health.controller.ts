import { Controller, Get } from '@nestjs/common';
@Controller('health')
export class HealthController {
  @Get()
  health() { return { status: 'ok', service: 'evolvia-api', version: '0.2.0-alpha.2' }; }
}
