import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard, AuthenticatedRequest } from './auth.guard';
import { OperatorCapabilityGuard, RotaDoBalcaoMarcada } from './operator-capability.guard';
import { RegistrationCategoryProofService } from './registration-category-proof.service';
import { RegistrationOperationsService } from './registration-operations.service';

/**
 * Operacoes de inscricao do organizador (CL01).
 *
 * `OperatorCapabilityGuard` entrou aqui porque este controller tinha APENAS
 * `AuthGuard`, e o service autorizava por papel com uma lista que incluia
 * OPERATOR. Efeito medido lendo o codigo: operador com concessao apenas de
 * leitura alterava categoria de inscricao de fato, e baixava o arquivo do
 * comprovante de categoria.
 *
 * O guard falha fechado: metodo sem `@RotaDoBalcaoMarcada(...)` e NEGADO, e
 * rota fora de `ROTAS_IMPOSTAS` tambem. Entao acrescentar rota aqui sem
 * registrar a exigencia la a faz nascer inacessivel, nao liberada.
 *
 * Todas as seis rotas estao marcadas como `organizador`. Nao e desleixo de
 * granularidade: nao existe concessao definida para alterar categoria nem para
 * revisar comprovante, e inventar uma seria criar politica por conta propria.
 * Operador que precise LER inscricao usa as rotas do balcao, que sao
 * concediveis e escopadas por evento.
 */
@UseGuards(AuthGuard, OperatorCapabilityGuard)
@Controller('events/:eventId/registration-operations')
export class RegistrationOperationsController {
  constructor(
    private readonly operations: RegistrationOperationsService,
    private readonly categoryProofs: RegistrationCategoryProofService,
  ) {}

  @Get()
  @RotaDoBalcaoMarcada('GET /registration-operations')
  list(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Query() query: { page?: string; status?: string; protocol?: string; presence?: string },
  ) {
    return this.operations.list(request.user!.id, eventId, {
      page: query.page, status: query.status, protocol: query.protocol, presence: query.presence,
    });
  }

  @Post('search')
  @RotaDoBalcaoMarcada('POST /registration-operations/search')
  search(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Body() filters: Parameters<RegistrationOperationsService['list']>[2],
  ) {
    return this.operations.list(request.user!.id, eventId, filters);
  }

  @Get(':protocol/category-options')
  @RotaDoBalcaoMarcada('GET /registration-operations/:protocol/category-options')
  categoryOptions(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('protocol') protocol: string,
  ) {
    return this.operations.categoryOptions(request.user!.id, eventId, protocol);
  }

  @Post(':protocol/category')
  @RotaDoBalcaoMarcada('POST /registration-operations/:protocol/category')
  changeCategory(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('protocol') protocol: string,
    @Body() input: unknown,
  ) {
    return this.operations.changeCategory(request.user!.id, eventId, protocol, input);
  }

  @Post(':protocol/category-proof')
  @RotaDoBalcaoMarcada('POST /registration-operations/:protocol/category-proof')
  reviewCategoryProof(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('protocol') protocol: string,
    @Body() input: unknown,
  ) {
    return this.categoryProofs.review(request.user!.id, eventId, protocol, input);
  }

  @Get(':protocol/category-proof/file')
  @RotaDoBalcaoMarcada('GET /registration-operations/:protocol/category-proof/file')
  async categoryProofFile(
    @Req() request: AuthenticatedRequest,
    @Param('eventId') eventId: string,
    @Param('protocol') protocol: string,
    @Res() response: { setHeader(name: string, value: string | number): void; end(body: Buffer): void },
  ) {
    const result = await this.categoryProofs.readForOrganizer(request.user!.id, eventId, protocol);
    for (const [name, value] of Object.entries(this.categoryProofs.headers())) response.setHeader(name, value);
    response.setHeader('X-Proof-Checksum', result.checksumSha256);
    response.setHeader('Content-Length', result.bytes.length);
    response.end(result.bytes);
  }
}
