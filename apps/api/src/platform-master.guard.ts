import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { PlatformMasterRepository } from './platform-master.repository.ts';
import { registrarRecusa } from './platform-audit-transaction.ts';
import { decidir } from './platform-grant-policy.ts';
import { lerSessao } from './platform-session-policy.ts';
import type { Alvo, SessaoMaster as SessaoParaDecisao } from './platform-grant-policy.ts';

export const CHAVE_DA_ACAO_MASTER = 'evolvia:acao-master';

/** Cabeçalho que transporta o token da sessão Master. */
export const CABECALHO_DA_SESSAO = 'x-evolvia-master-session';

/**
 * Declara qual ação da Área Master o método exige. Sem a marca, o guard NEGA —
 * mesma escolha do `OperatorCapabilityGuard`: rota administrativa que esquece
 * de declarar a permissão não pode ficar aberta por omissão.
 */
export const AcaoMaster = (acao: string): MethodDecorator =>
  SetMetadata(CHAVE_DA_ACAO_MASTER, acao);

export interface SessaoMasterNaRequisicao {
  identityId: string;
  sessionId: string;
  tokenHash: string;
  proprietario: boolean;
  /**
   * O alvo que esta requisição está pedindo, derivado da ROTA.
   *
   * Fica aqui para que quem responde use o MESMO objeto que o guard conferiu.
   * Se o controller derivasse o alcance dos parâmetros outra vez, haveria duas
   * derivações do mesmo escopo, e a autorização poderia ser conferida para um
   * recurso e aplicada a outro — que é a forma mais comum de vazamento em tela
   * administrativa.
   */
  alvo: Alvo;
}

export interface RequisicaoMaster {
  user?: { id: string };
  params?: Record<string, unknown>;
  body?: unknown;
  headers: Record<string, unknown>;
  master?: SessaoMasterNaRequisicao;
}

const hashDoToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * O alvo que a rota está pedindo.
 *
 * Uma derivação só, usada pelo guard que decide E por quem responde. `eventId`
 * na rota faz o alvo ser o evento; `organizationId` sozinho faz ser a
 * organização; nenhum dos dois faz ser a plataforma, que é o alcance mais
 * largo e por isso exige concessão global.
 */
function alvoDaRequisicao(requisicao: RequisicaoMaster): Alvo {
  const eventId = requisicao.params?.eventId;
  const organizationId = requisicao.params?.organizationId;
  if (typeof eventId === 'string' && eventId.length > 0) {
    return {
      tipo: 'EVENTO',
      eventId,
      organizationId: typeof organizationId === 'string' ? organizationId : '',
    };
  }
  if (typeof organizationId === 'string' && organizationId.length > 0) {
    return { tipo: 'ORGANIZACAO', organizationId };
  }
  return { tipo: 'PLATAFORMA' };
}

function tokenDoCabecalho(requisicao: RequisicaoMaster): string | null {
  const bruto = requisicao.headers[CABECALHO_DA_SESSAO];
  const valor = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Resolve a sessão Master da requisição e a coloca em `request.master`.
 *
 * Os códigos são escolhidos e não acidentais:
 *
 *   - **404** quando a pessoa não tem identidade Master. Dizer 401 ou 403 já
 *     revelaria que a Área Master existe e que ela só errou a credencial. Para
 *     quem não é da Master, a rota não existe.
 *   - **401** quando a identidade existe mas a sessão não vale — inexistente,
 *     de outra pessoa, revogada, vencida, ou identidade suspensa. Quem já tem
 *     identidade sabe que a área existe e precisa saber que o problema é a
 *     sessão, não a permissão. Trocar isso por 403 manda a pessoa pedir acesso
 *     que ela já tem.
 */
async function resolverSessao(
  requisicao: RequisicaoMaster,
  repositorio: PlatformMasterRepository,
): Promise<{ sessaoNaRequisicao: SessaoMasterNaRequisicao; userId: string; sessao: SessaoParaDecisao }> {
  const userId = requisicao.user?.id;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new NotFoundException('Recurso não encontrado.');
  }

  // A identidade primeiro, e pelo usuário do token: sem ela a resposta é 404
  // antes de olhar sessão, cabeçalho ou ação declarada.
  const identidade = await repositorio.identidade(userId);
  if (!identidade) throw new NotFoundException('Recurso não encontrado.');

  const token = tokenDoCabecalho(requisicao);
  if (!token) throw new UnauthorizedException('Sessão da Área Master não informada.');

  const tokenHash = hashDoToken(token);
  const vinculo = await repositorio.porTokenDeSessao(tokenHash);

  // Sessão de outra pessoa não vale para esta. Sem esta conferência, um token
  // válido emprestado passaria carregando o `userId` de quem o apresentou.
  const daPessoa = vinculo && vinculo.userId === userId ? vinculo : null;
  if (!daPessoa) throw new UnauthorizedException('Sessão da Área Master não encontrada.');

  const leitura = lerSessao(daPessoa.identidade, daPessoa.sessao);
  if (!leitura.valida) throw new UnauthorizedException(leitura.porque);

  const sessaoNaRequisicao: SessaoMasterNaRequisicao = {
    identityId: daPessoa.identityId,
    sessionId: daPessoa.sessionId,
    tokenHash,
    proprietario: leitura.sessao.proprietario,
    alvo: alvoDaRequisicao(requisicao),
  };
  requisicao.master = sessaoNaRequisicao;
  // Devolve o valor já estreitado, e não a união: assim quem chama não precisa
  // de um `if` que nunca é verdadeiro só para o compilador aceitar o acesso.
  return { sessaoNaRequisicao, userId, sessao: leitura.sessao };
}

/**
 * Exige apenas sessão Master válida, sem concessão.
 *
 * Serve o que é sobre a própria identidade e não sobre poderes na plataforma:
 * registrar a própria chave de backup e encerrar a própria sessão. Exigir
 * concessão aqui deixaria um delegado sem poderes incapaz até de sair, e
 * registrar uma segunda chave é justamente o que evita perder o acesso.
 */
@Injectable()
export class PlatformSessionGuard implements CanActivate {
  constructor(private readonly repositorio: PlatformMasterRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    await resolverSessao(context.switchToHttp().getRequest<RequisicaoMaster>(), this.repositorio);
    return true;
  }
}

/**
 * Autoriza cada operação de poder da Área Master (#665).
 *
 * Consulta a concessão em TODA operação, de propósito: é isso que faz uma
 * revogação valer na operação seguinte mesmo com a sessão aberta. Nada de
 * decidir uma vez no login e confiar no token depois — não há cache a expirar
 * nem token a invalidar.
 *
 * **403** quando a sessão vale e a concessão não alcança a operação, ou quando
 * o segundo fator ou a verificação reforçada estão velhos. Toda recusa entra na
 * trilha como `DENIED`, fora de transação, porque negar sem deixar rastro é como
 * não ter negado.
 */
@Injectable()
export class PlatformMasterGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly repositorio: PlatformMasterRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requisicao = context.switchToHttp().getRequest<RequisicaoMaster>();
    const { userId, sessao, sessaoNaRequisicao } = await resolverSessao(requisicao, this.repositorio);

    const acao = this.reflector.get<unknown>(CHAVE_DA_ACAO_MASTER, context.getHandler());
    if (typeof acao !== 'string' || acao.length === 0) {
      // Rota da Master sem permissão declarada: nega, não libera.
      throw new ForbiddenException('Operação sem permissão declarada.');
    }

    const alvo = sessaoNaRequisicao.alvo;
    const motivo = this.motivoDoCorpo(requisicao.body);
    const concessoes = await this.repositorio.concessoes(userId);
    const decisao = decidir(sessao, concessoes, { acao, alvo, motivo });

    if (!decisao.permitido) {
      await this.registrarRecusaSemDerrubar(userId, acao, alvo, decisao.recusa, motivo);
      throw new ForbiddenException(decisao.porque);
    }
    return true;
  }

  private motivoDoCorpo(corpo: unknown): string | undefined {
    const motivo = (corpo as { motivo?: unknown } | null | undefined)?.motivo;
    return typeof motivo === 'string' ? motivo : undefined;
  }

  /**
   * A trilha da recusa não pode derrubar a recusa.
   *
   * Se a gravação falhar, a pessoa continua recusada. Trocar 403 por 500 aqui
   * transformaria auditoria indisponível em porta aberta de outro tipo. A
   * gravação que PRECISA desfazer a operação é a da mudança privilegiada, em
   * `executarAuditado`, e essa continua valendo.
   */
  private async registrarRecusaSemDerrubar(
    actorUserId: string,
    acao: string,
    alvo: Alvo,
    recusa: string,
    motivo: string | undefined,
  ): Promise<void> {
    try {
      await registrarRecusa(this.repositorio.banco(), {
        actorUserId,
        action: `${acao}:${recusa}`.slice(0, 60),
        scopeKind: alvo.tipo === 'EVENTO' ? 'EVENTO' : alvo.tipo === 'ORGANIZACAO' ? 'ORGANIZACAO' : 'GLOBAL',
        organizationId: 'organizationId' in alvo ? alvo.organizationId : '',
        eventId: alvo.tipo === 'EVENTO' ? alvo.eventId : '',
        reason: motivo && motivo.trim().length > 0 ? motivo : `Recusa automática: ${recusa}.`,
        correlationId: `guard-${Date.now().toString(36)}`,
      });
    } catch {
      // Registrada ou não, a recusa vale.
    }
  }
}
