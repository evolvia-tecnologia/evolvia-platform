import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service.ts';
import { PlatformMasterRepository } from './platform-master.repository.ts';
import type { ClienteTransacional } from './platform-master.repository.ts';
import { PlatformWebAuthnService } from './platform-webauthn.ts';
import { abrirCerimonia, consumirDesafio } from './platform-ceremony-policy.ts';
import { contadorAceito, validadeDaSessao } from './platform-session-policy.ts';
import { MudancaRevertida, executarAuditado } from './platform-audit-transaction.ts';
import { resumoDaConcessao, validarPedidoDeConcessao } from './platform-grant-request.ts';
import type { Vinculo } from './platform-ceremony-policy.ts';
import type { PedidoDeConcessao } from './platform-grant-request.ts';

const TAMANHO_DO_TOKEN = 32;
const hash = (valor: string): string => createHash('sha256').update(valor).digest('hex');

/** O alcance de uma linha, na forma das colunas de `PlatformGrant`. */
interface Alcance {
  readonly scopeKind: 'GLOBAL' | 'ORGANIZACAO' | 'EVENTO';
  readonly organizationId: string;
  readonly eventId: string;
}

/** Uma linha de concessão, que é também o `where` da revogação. */
interface LinhaDeConcessao extends Alcance {
  readonly targetUserId: string;
  readonly action: string;
}

export interface ContextoMaster {
  readonly identityId: string;
  readonly sessionId: string;
  readonly tokenHash: string;
}

/**
 * Operações da Área Master (#665).
 *
 * As decisões não estão aqui: cerimônia em `platform-ceremony-policy`, frescor
 * de sessão em `platform-session-policy`, permissão em `platform-grant-policy`
 * (aplicada pelo guard), obrigatoriedade da auditoria em
 * `platform-audit-transaction`, conversão da credencial em
 * `platform-credential-codec`. Todos puros e com teste de mutação. Este arquivo
 * encadeia, e é o encadeamento que o teste HTTP com PostgreSQL mede.
 *
 * O desafio cru nunca é guardado: a coluna tem o digest vinculado à sessão. Por
 * isso o cliente devolve o desafio que recebeu, a política confirma que é o que
 * abrimos e vinculamos, e só então a biblioteca confere a assinatura sobre ele.
 * Sem esse eco, o servidor não teria o que passar como `expectedChallenge`.
 */
@Injectable()
export class PlatformMasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repositorio: PlatformMasterRepository,
    private readonly webauthn: PlatformWebAuthnService,
  ) {}

  /** Identidade Master de quem está autenticado, ou 404. */
  private async exigirIdentidade(userId: string) {
    const identidade = await this.repositorio.identidade(userId);
    if (!identidade) throw new NotFoundException('Recurso não encontrado.');
    return identidade;
  }

  // ----------------------------------------------------------- autenticação

  /** Abre a cerimônia de autenticação. Ainda não existe sessão para vincular. */
  async desafioDeAutenticacao(userId: string) {
    const identidade = await this.exigirIdentidade(userId);
    const credenciais = await this.repositorio.credenciais(identidade.id);
    if (credenciais.length === 0) {
      throw new BadRequestException('Nenhuma chave de segurança registrada para este acesso.');
    }
    const opcoes = await this.webauthn.opcoesDeAutenticacao(credenciais);
    const abertura = abrirCerimonia(
      { status: String(identidade.status) as 'ACTIVE' | 'SUSPENDED' },
      'AUTHENTICATION',
      opcoes.challenge,
      { tipo: 'SEM_SESSAO' },
    );
    await this.repositorio.gravarDesafio(identidade.id, abertura.gravar);
    return opcoes;
  }

  /**
   * Conclui a autenticação e devolve o token da sessão UMA vez.
   *
   * O token cru não é gravado em lugar nenhum: a coluna guarda o sha256 dele,
   * que tem exatamente os 64 caracteres de `tokenHash`. Quem perder o token
   * abre outra sessão; não há como recuperá-lo, e isso é a intenção.
   */
  async concluirAutenticacao(userId: string, desafioApresentado: string, resposta: unknown) {
    const identidade = await this.exigirIdentidade(userId);
    const leitura = consumirDesafio(identidade, 'AUTHENTICATION', desafioApresentado, { tipo: 'SEM_SESSAO' });
    if (!leitura.ok) throw new UnauthorizedException(leitura.porque);

    // Consumo atômico: em duas requisições concorrentes com o mesmo desafio,
    // só uma encontra a linha para limpar. A outra cai aqui.
    const gravado = identidade.pendingChallenge;
    if (!gravado || !(await this.repositorio.consumirDesafio(identidade.id, gravado))) {
      throw new UnauthorizedException('Não foi possível concluir. Comece novamente.');
    }

    const credencialId = this.idDaResposta(resposta);
    const credencial = credencialId ? await this.repositorio.credencial(identidade.id, credencialId) : null;
    if (!credencial) throw new UnauthorizedException('Não foi possível concluir. Comece novamente.');

    const verificada = await this.webauthn.verificarAutenticacao(resposta, desafioApresentado, credencial);
    if (!verificada) throw new UnauthorizedException('Não foi possível concluir. Comece novamente.');

    // Defesa em profundidade contra autenticador clonado: a biblioteca também
    // olha o contador, e `contadorAceito` carrega a exceção da especificação
    // para autenticador que não implementa contador.
    if (!contadorAceito(credencial.counter, verificada.novoContador)) {
      throw new UnauthorizedException('Não foi possível concluir. Comece novamente.');
    }

    const agora = Date.now();
    const token = randomBytes(TAMANHO_DO_TOKEN).toString('base64url');
    const sessionId = await this.repositorio.criarSessao({
      identityId: identidade.id,
      tokenHash: hash(token),
      secondFactorAt: new Date(agora).toISOString(),
      expiresAt: validadeDaSessao(agora),
    });
    await this.repositorio.avancarContador(credencial.id, credencial.counter, verificada.novoContador);
    return { token, sessionId, expiraEm: validadeDaSessao(agora) };
  }

  /** Encerra a sessão. A próxima operação com o mesmo token é recusada. */
  async encerrarSessao(contexto: ContextoMaster): Promise<void> {
    await this.repositorio.revogarSessao(contexto.sessionId);
  }

  // --------------------------------------------------------------- registro

  /** Abre a cerimônia de registro, vinculada à sessão Master em curso. */
  async desafioDeRegistro(userId: string, contexto: ContextoMaster, nomeDeUsuario: string) {
    const identidade = await this.exigirIdentidade(userId);
    const jaRegistradas = await this.repositorio.credenciais(identidade.id);
    const opcoes = await this.webauthn.opcoesDeRegistro(nomeDeUsuario, jaRegistradas);
    const abertura = abrirCerimonia(
      { status: String(identidade.status) as 'ACTIVE' | 'SUSPENDED' },
      'REGISTRATION',
      opcoes.challenge,
      this.vinculoDaSessao(contexto),
    );
    await this.repositorio.gravarDesafio(identidade.id, abertura.gravar);
    return opcoes;
  }

  /**
   * Registra a chave de segurança.
   *
   * Vai por `executarAuditado`: acrescentar autenticador à Área Master é
   * mudança privilegiada, e se a auditoria não gravar, o registro é desfeito na
   * mesma transação — a decisão da #665 vale aqui como vale para conceder.
   */
  async concluirRegistro(
    userId: string,
    contexto: ContextoMaster,
    desafioApresentado: string,
    resposta: unknown,
    rotulo: string | null,
  ) {
    const identidade = await this.exigirIdentidade(userId);
    const leitura = consumirDesafio(
      identidade, 'REGISTRATION', desafioApresentado, this.vinculoDaSessao(contexto),
    );
    if (!leitura.ok) throw new UnauthorizedException(leitura.porque);

    const gravado = identidade.pendingChallenge;
    if (!gravado || !(await this.repositorio.consumirDesafio(identidade.id, gravado))) {
      throw new UnauthorizedException('Não foi possível concluir. Comece novamente.');
    }

    const verificado = await this.webauthn.verificarRegistro(resposta, desafioApresentado);
    if (!verificado) throw new UnauthorizedException('Não foi possível concluir. Comece novamente.');

    await this.auditado(
      {
        actorUserId: userId,
        action: 'registrar_autenticador',
        scopeKind: 'GLOBAL',
        targetUserId: userId,
        reason: 'Registro de chave de segurança da Área Master.',
        correlationId: `reg-${contexto.sessionId}`,
        changes: { credentialId: verificado.credentialId, backedUp: verificado.backedUp },
      },
      async (tx) => {
        await tx.cliente.platformWebAuthnCredential.create({
          // Pelo construtor do repositório, que passa pelo codec. Converter
          // aqui à mão criaria um segundo caminho para a mesma coluna, sem as
          // guardas de alfabeto e de limite.
          data: this.repositorio.dadosDaCredencial({
            identityId: identidade.id,
            credentialId: verificado.credentialId,
            publicKey: verificado.publicKey,
            counter: verificado.counter,
            rotulo,
            backedUp: verificado.backedUp,
            transportes: verificado.transportes,
          }),
        });
      },
    );
    return { credentialId: verificado.credentialId, backedUp: verificado.backedUp };
  }

  // -------------------------------------------------------------- concessões

  /** O resumo que a tela mostra ANTES de confirmar, montado no servidor. */
  async revisarConcessao(corpo: unknown) {
    const leitura = validarPedidoDeConcessao(corpo);
    if (!leitura.ok) throw new BadRequestException({ erros: leitura.erros });
    const nomes = await this.nomesDasPessoas(leitura.pedido.pessoas);
    return { pedido: leitura.pedido, resumo: resumoDaConcessao(leitura.pedido, nomes) };
  }

  /** Concede. Só o proprietário chega aqui: o guard aplica `decidir`. */
  async conceder(actorUserId: string, contexto: ContextoMaster, corpo: unknown) {
    const leitura = validarPedidoDeConcessao(corpo);
    if (!leitura.ok) throw new BadRequestException({ erros: leitura.erros });
    const pedido = leitura.pedido;
    const linhas = this.linhasDaConcessao(pedido);

    await this.auditado(
      {
        actorUserId,
        action: 'conceder',
        scopeKind: this.escopoDoPedido(pedido),
        organizationId: pedido.escopo.tipo === 'ORGANIZACAO' ? pedido.escopo.organizationId : '',
        reason: pedido.motivo,
        correlationId: `grant-${contexto.sessionId}`,
        changes: { pessoas: pedido.pessoas.length, acoes: pedido.acoes, escopo: pedido.escopo.tipo },
      },
      async (tx) => {
        const cliente: ClienteTransacional = tx.cliente;
        // `skipDuplicates` em vez de upsert: a unicidade da concessão já está
        // no banco, e assim não dependo do nome que o Prisma gera para a chave
        // composta — nome que eu não conferi e não vou presumir.
        await cliente.platformGrant.createMany({
          data: linhas.map((l) => ({ ...l, grantedByUserId: actorUserId, expiresAt: pedido.expiraEm ? new Date(pedido.expiraEm) : null })),
          skipDuplicates: true,
        });
        await cliente.platformGrantEvent.createMany({
          data: linhas.map((l) => ({
            ...l,
            kind: 'GRANTED',
            actorUserId,
            reason: pedido.motivo,
            expiresAt: pedido.expiraEm ? new Date(pedido.expiraEm) : null,
            correlationId: `grant-${contexto.sessionId}`,
          })),
        });
      },
    );
    return { concedidas: linhas.length, resumo: resumoDaConcessao(pedido) };
  }

  /**
   * Revoga.
   *
   * A linha sai da projeção, e é isso que faz a revogação valer na operação
   * seguinte mesmo com a sessão aberta: o guard reconsulta as concessões em toda
   * requisição, então não há token a invalidar nem cache a esperar.
   */
  async revogar(actorUserId: string, contexto: ContextoMaster, corpo: unknown) {
    const leitura = validarPedidoDeConcessao(corpo);
    if (!leitura.ok) throw new BadRequestException({ erros: leitura.erros });
    const pedido = leitura.pedido;
    const linhas = this.linhasDaConcessao(pedido);

    let removidas = 0;
    await this.auditado(
      {
        actorUserId,
        action: 'revogar',
        scopeKind: this.escopoDoPedido(pedido),
        organizationId: pedido.escopo.tipo === 'ORGANIZACAO' ? pedido.escopo.organizationId : '',
        reason: pedido.motivo,
        correlationId: `revoke-${contexto.sessionId}`,
        changes: { pessoas: pedido.pessoas.length, acoes: pedido.acoes, escopo: pedido.escopo.tipo },
      },
      async (tx) => {
        const cliente: ClienteTransacional = tx.cliente;
        for (const linha of linhas) {
          const { count } = await cliente.platformGrant.deleteMany({ where: linha });
          removidas += count;
        }
        await cliente.platformGrantEvent.createMany({
          data: linhas.map((l) => ({
            ...l,
            kind: 'REVOKED',
            actorUserId,
            reason: pedido.motivo,
            expiresAt: null,
            correlationId: `revoke-${contexto.sessionId}`,
          })),
        });
      },
    );
    return { revogadas: removidas };
  }

  /** Consulta de apoio de um evento, sob a ação `consultar`. */
  async consultarEvento(eventId: string) {
    const evento = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, status: true, startDate: true, endDate: true, organizationId: true },
    });
    if (!evento) throw new NotFoundException('Recurso não encontrado.');
    return evento;
  }

  /**
   * Transforma a reversão em resposta que a pessoa entende.
   *
   * Sem isto, `MudancaRevertida` sobe como 500 e quem tentou conceder não
   * descobre que nada foi gravado — justamente o caso em que saber importa.
   * 503 porque o impedimento é temporário: a ação pode ser repetida quando a
   * auditoria voltar, e repetir é seguro porque nada ficou pela metade.
   */
  private async auditado<T>(
    dados: Parameters<typeof executarAuditado>[1],
    mudanca: (tx: { cliente: ClienteTransacional }) => Promise<T>,
  ): Promise<T> {
    try {
      return await executarAuditado(this.repositorio.banco(), dados, mudanca);
    } catch (erro) {
      if (erro instanceof MudancaRevertida) {
        throw new ServiceUnavailableException(
          'A ação foi desfeita porque não foi possível registrar a auditoria. Nada foi alterado; tente novamente.',
        );
      }
      throw erro;
    }
  }

  // ------------------------------------------------------------- auxiliares

  private vinculoDaSessao(contexto: ContextoMaster): Vinculo {
    return { tipo: 'SESSAO', tokenHash: contexto.tokenHash };
  }

  private idDaResposta(resposta: unknown): string | null {
    const id = (resposta as { id?: unknown } | null | undefined)?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }

  /** Uma linha de concessão por pessoa × ação × alcance. */
  private linhasDaConcessao(pedido: PedidoDeConcessao): LinhaDeConcessao[] {
    const alcances: Alcance[] =
      pedido.escopo.tipo === 'GLOBAL'
        ? [{ scopeKind: 'GLOBAL', organizationId: '', eventId: '' }]
        : pedido.escopo.tipo === 'ORGANIZACAO'
          ? [{ scopeKind: 'ORGANIZACAO', organizationId: pedido.escopo.organizationId, eventId: '' }]
          : pedido.escopo.eventIds.map((eventId) => ({ scopeKind: 'EVENTO' as const, organizationId: '', eventId }));

    const linhas: LinhaDeConcessao[] = [];
    for (const targetUserId of pedido.pessoas) {
      for (const action of pedido.acoes) {
        for (const alcance of alcances) {
          linhas.push({ targetUserId, action, ...alcance });
        }
      }
    }
    return linhas;
  }

  private escopoDoPedido(pedido: PedidoDeConcessao): 'GLOBAL' | 'ORGANIZACAO' | 'EVENTO' {
    if (pedido.escopo.tipo === 'GLOBAL') return 'GLOBAL';
    if (pedido.escopo.tipo === 'ORGANIZACAO') return 'ORGANIZACAO';
    return 'EVENTO';
  }

  private async nomesDasPessoas(ids: readonly string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const pessoas = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    const nomes: Record<string, string> = {};
    for (const pessoa of pessoas) if (pessoa.name) nomes[pessoa.id] = pessoa.name;
    return nomes;
  }
}
