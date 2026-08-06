import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const VERSION = '0.2.0-alpha.3';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health() {
    return { status: 'ok', service: 'evolvia-api', version: VERSION };
  }

  @Get('live')
  live() {
    return { status: 'ok', service: 'evolvia-api', version: VERSION };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        service: 'evolvia-api',
        version: VERSION,
        dependencies: { database: 'ok' },
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DEPENDENCY_UNAVAILABLE',
        message: 'A aplicação ainda não está pronta para receber tráfego.',
        context: { database: 'unavailable' },
      });
    }
  }
}
