import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard.ts';
import { AcaoMaster, PlatformMasterGuard, PlatformSessionGuard } from './platform-master.guard.ts';
import { PlatformMasterService } from './platform-master.service.ts';
import { AbrirInscricaoMasterDto, ConsumirInscricaoMasterDto, CatalogoDto, ConcederDto, ConcluirCerimoniaDto, RelatorioDeAuditoriaDto, RevisarConcessaoDto, RevogarDto, VisaoGeralDto } from './platform-master.dto.ts';
import type { AuthenticatedRequest } from './auth.guard.ts';
import type { RequisicaoMaster } from './platform-master.guard.ts';

type Requisicao = AuthenticatedRequest & RequisicaoMaster & { socket: { remoteAddress?: string } };

/**
 * Rotas da Área Master (#665).
 *
 * Três camadas de guard, e a diferença entre elas é o assunto da rota:
 *
 *   - só `AuthGuard`: abrir e concluir a autenticação. Ainda não existe sessão
 *     Master, e exigir uma seria exigir o que a rota serve para criar.
 *   - `PlatformSessionGuard`: o que é sobre a PRÓPRIA identidade — registrar a
 *     chave de backup e encerrar a sessão. Não depende de concessão, senão um
 *     delegado sem poderes não conseguiria nem sair, nem registrar a segunda
 *     chave que evita perder o acesso.
 *   - `PlatformMasterGuard` com `@AcaoMaster(...)`: o que exerce poder sobre a
 *     plataforma. A concessão é consultada em toda chamada.
 *
 * Nenhuma rota responde de forma a revelar que a Área Master existe para quem
 * não tem identidade Master: nesse caso é 404, do mesmo jeito que um recurso
 * inexistente.
 */
@Controller('platform/master')
export class PlatformMasterController {
  constructor(private readonly servico: PlatformMasterService) {}

  // ----------------------------------------------------------- autenticação

  @Post('sessions/challenge')
  @UseGuards(AuthGuard)
  async desafioDeAutenticacao(@Req() requisicao: Requisicao) {
    return this.servico.desafioDeAutenticacao(requisicao.user!.id);
  }

  @Post('sessions')
  @UseGuards(AuthGuard)
  async concluirAutenticacao(@Req() requisicao: Requisicao, @Body() corpo: ConcluirCerimoniaDto) {
    return this.servico.concluirAutenticacao(requisicao.user!.id, corpo.desafio, corpo.resposta);
  }

  @Delete('sessions')
  @UseGuards(AuthGuard, PlatformSessionGuard)
  async encerrarSessao(@Req() requisicao: Requisicao) {
    await this.servico.encerrarSessao(requisicao.master!);
    return { encerrada: true };
  }

  // --------------------------------------------------------------- registro

  @Post('enrollment/challenge')
  @UseGuards(AuthGuard)
  abrirInscricao(@Req() req: Requisicao, @Body() corpo: AbrirInscricaoMasterDto) {
    return this.servico.abrirInscricao(req.user!.id, req.user!.email, corpo, req.socket.remoteAddress ?? '');
  }

  @Post('enrollment/credential')
  @UseGuards(AuthGuard)
  consumirInscricao(@Req() req: Requisicao, @Body() corpo: ConsumirInscricaoMasterDto) {
    return this.servico.consumirInscricao(req.user!.id, corpo, req.socket.remoteAddress ?? '');
  }

  @Post('credentials/challenge')
  @UseGuards(AuthGuard, PlatformSessionGuard)
  async desafioDeRegistro(@Req() requisicao: Requisicao) {
    return this.servico.desafioDeRegistro(requisicao.user!.id, requisicao.master!, requisicao.user!.email);
  }

  @Post('credentials')
  @UseGuards(AuthGuard, PlatformSessionGuard)
  async concluirRegistro(@Req() requisicao: Requisicao, @Body() corpo: ConcluirCerimoniaDto) {
    return this.servico.concluirRegistro(
      requisicao.user!.id, requisicao.master!, corpo.desafio, corpo.resposta, corpo.rotulo ?? null,
    );
  }

  // ------------------------------------------------------------- concessões

  /** O resumo legível, montado no servidor, mostrado ANTES de confirmar. */
  @Post('grants/review')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('conceder')
  async revisarConcessao(@Body() corpo: RevisarConcessaoDto) {
    return this.servico.revisarConcessao(corpo);
  }

  @Post('grants')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('conceder')
  async conceder(@Req() requisicao: Requisicao, @Body() corpo: ConcederDto) {
    return this.servico.conceder(requisicao.user!.id, requisicao.master!, corpo);
  }

  @Post('grants/revoke')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('revogar')
  async revogar(@Req() requisicao: Requisicao, @Body() corpo: RevogarDto) {
    return this.servico.revogar(requisicao.user!.id, requisicao.master!, corpo);
  }

  // ---------------------------------------------------------------- consulta

  /**
   * A visão geral da plataforma.
   *
   * `POST` e não `GET` porque o recorte tem cinco dimensões, três delas listas:
   * em query string isso vira cadeia frágil de `?a[]=&a[]=`, e um recorte
   * truncado pelo tamanho da URL daria total errado sem ninguém notar. O corpo
   * carrega o filtro inteiro ou nada.
   *
   * Sem `eventId` na rota, o alvo é a plataforma — então só passa quem tem
   * alcance global.
   */
  @Post('overview')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('consultar')
  async visaoGeral(@Body() corpo: VisaoGeralDto) {
    return this.servico.visaoGeral(corpo);
  }

  /**
   * O catálogo pesquisável.
   *
   * `POST` pelo mesmo motivo da visão geral: o recorte tem cinco dimensões,
   * três delas listas, e em query string isso vira cadeia frágil que um limite
   * de URL pode truncar sem avisar — com busca e página por cima.
   *
   * Sem `eventId` na rota o alvo é a plataforma, então só passa quem tem
   * alcance global. Uma lista de TODOS os eventos para quem cuida de um só
   * seria vazamento pela listagem, do mesmo jeito que o painel seria pela soma.
   */
  @Post('catalog')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('consultar')
  async catalogo(@Body() corpo: CatalogoDto) {
    return this.servico.catalogo(corpo);
  }

  // ---------------------------------------------------------------- auditoria

  /**
   * A trilha da plataforma inteira. Só com concessão global.
   *
   * Três rotas e não uma com escopo no corpo: é a rota que diz o alcance, e é a
   * rota que o guard confere. Escopo no corpo faria a autorização ser conferida
   * para um recurso e aplicada a outro.
   */
  @Post('audit')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('auditar')
  async auditoriaDaPlataforma(@Req() requisicao: Requisicao, @Body() corpo: RelatorioDeAuditoriaDto) {
    return this.servico.relatorioDeAuditoria(requisicao.master!.alvo, corpo);
  }

  /** A trilha de um evento. Alcança quem tem `auditar` naquele evento. */
  @Post('events/:eventId/audit')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('auditar')
  async auditoriaDoEvento(@Req() requisicao: Requisicao, @Body() corpo: RelatorioDeAuditoriaDto) {
    return this.servico.relatorioDeAuditoria(requisicao.master!.alvo, corpo);
  }

  /** A trilha de uma organização. */
  @Post('organizations/:organizationId/audit')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('auditar')
  async auditoriaDaOrganizacao(@Req() requisicao: Requisicao, @Body() corpo: RelatorioDeAuditoriaDto) {
    return this.servico.relatorioDeAuditoria(requisicao.master!.alvo, corpo);
  }

  /**
   * Consulta de apoio de um evento.
   *
   * O `eventId` está na rota, e é de lá que o guard tira o alvo da decisão —
   * por isso uma concessão de evento alcança este caminho e não alcança o de
   * outro evento, sem que o serviço precise conferir escopo de novo.
   */
  @Get('events/:eventId/summary')
  @UseGuards(AuthGuard, PlatformMasterGuard)
  @AcaoMaster('consultar')
  async consultarEvento(@Param('eventId') eventId: string) {
    return this.servico.consultarEvento(eventId);
  }
}
