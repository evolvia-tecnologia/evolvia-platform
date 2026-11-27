import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

const VERSION = '0.2.0-alpha.3';

/**
 * O commit servido, assado na imagem pelo Dockerfile.
 *
 * `VERSION` e uma constante de codigo: ela diz a versao do produto e NAO
 * identifica o build. Sem este campo nao havia como, de fora do host, saber qual
 * SHA a homologacao estava servindo — e sem isso nenhum ensaio de aceite e
 * atribuivel a um commit, porque a evidencia nao diz contra o que foi medido.
 *
 * `'desconhecido'` quando a imagem foi construida sem o argumento. E deliberado
 * nao inventar valor nem omitir o campo: campo ausente faria um verificador
 * antigo passar por omissao, e um valor fabricado seria pior que nenhum.
 */
const buildSha = process.env.EVOLVIA_BUILD_SHA ?? '';
const BUILD = /^[0-9a-f]{40}$/iu.test(buildSha) && buildSha.length === 40 ? buildSha.toLowerCase() : 'desconhecido';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  health() {
    return { status: 'ok', service: 'evolvia-api', version: VERSION, build: BUILD };
  }

  @Get('live')
  live() {
    return { status: 'ok', service: 'evolvia-api', version: VERSION, build: BUILD };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        service: 'evolvia-api',
        version: VERSION,
        build: BUILD,
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
