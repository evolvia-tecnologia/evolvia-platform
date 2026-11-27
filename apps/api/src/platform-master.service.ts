import { HttpException, BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from './prisma.service.ts';
import { PlatformMasterRepository } from './platform-master.repository.ts';
import type { ClienteTransacional } from './platform-master.repository.ts';
import type { AbrirInscricaoMasterDto, ConsumirInscricaoMasterDto } from './platform-master.dto.ts';
import { PrismaPasswordRecoveryRateLimiter, PasswordRecoveryRateLimitExceededError } from './auth/password-recovery-rate-limiter';
import { configuracaoWebAuthn, PlatformWebAuthnService } from './platform-webauthn.ts';
import { abrirCerimonia, consumirDesafio } from './platform-ceremony-policy.ts';
import { contadorAceito, validadeDaSessao } from './platform-session-policy.ts';
import { MudancaRevertida, executarAuditado } from './platform-audit-transaction.ts';
import { resumoDaConcessao, validarPedidoDeConcessao } from './platform-grant-request.ts';
import { montarVisaoGeral } from './platform-overview-policy.ts';
import { validarFiltroDaVisaoGeral } from './platform-overview-request.ts';
import { montarRelatorio, restricaoDoEscopo, validarFiltroDoRelatorio } from './platform-audit-report.ts';
import { montarCatalogo, validarPedidoDoCatalogo } from './platform-catalog-request.ts';
import { recusaDeValidacao } from './platform-master-validation.ts';
import type { EscopoDoRelatorio } from './platform-audit-report.ts';
import type { Vinculo } from './platform-ceremony-policy.ts';
import type { PedidoDeConcessao } from './platform-grant-request.ts';
import type { Alvo } from './platform-grant-policy.ts';

const TAMANHO_DO_TOKEN = 32;

/**
 * Prefixo da acao da inscricao na trilha. O sufixo vai em MAIUSCULAS.
 *
 * Nao e escolha estetica. `validarFiltroDoRelatorio` aceita
 * `^[a-z_]{3,40}(:[A-Z_]{3,40})?$`, e `platform-audit-report.test.mjs` recusa
 * `consultar:minuscula` de proposito — o sufixo apos os dois-pontos e
 * SCREAMING_SNAKE em todo o contrato. Gravar `inscricao_master:abrir` fazia a
 * linha existir e NAO poder ser filtrada: `/platform/master/audit` devolvia 400
 * justamente para a acao que alguem procura ao investigar recusas, que e o
 * motivo de a trilha existir. Achado da revisao da #744, conferido contra o
 * validador e contra o teste que o fixa.
 */
export const ACAO_DA_INSCRICAO = 'inscricao_master';

/** As duas etapas, e o sufixo de cada uma. Fechado de proposito. */
export const SUFIXO_DA_ETAPA = Object.freeze({ abrir: 'ABRIR', concluir: 'CONCLUIR' } as Record<string, string>);

/** A acao gravada. Etapa desconhecida vira `OUTRA`, nunca minuscula. */
export const acaoDaInscricao = (etapa: string): string =>
  `${ACAO_DA_INSCRICAO}:${SUFIXO_DA_ETAPA[etapa] ?? 'OUTRA'}`.slice(0, 60);

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
 *
 * Pedido inválido sai por `recusaDeValidacao`, no contrato de erro da
 * plataforma. Lançar `{ erros }` cru fazia o filtro global descartar a lista
 * de problemas e responder uma frase genérica — ver o comentário em
 * `platform-master-validation.ts`.
 *
 * As rotas de concessão entregam `problemas`, que levam o CAMPO recusado até o
 * `field` da resposta; as de catálogo e relatório ainda entregam `erros`, que é
 * só a frase. A assimetria é transitória e deliberada: os validadores daquelas
 * ainda não nomeiam o campo, e `recusaDeValidacao` aceita as duas formas para
 * que a migração aconteça um validador por vez, sem que nenhuma rota pare de
 * funcionar nem passe a afirmar um campo que ninguém informou.
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
    const sessionId = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "PlatformMasterIdentity" WHERE id = ${identidade.id} FOR UPDATE`;
      const atual = await tx.platformMasterIdentity.findFirst({ where: { id: identidade.id, userId, status: 'ACTIVE' } });
      if (!atual) throw new UnauthorizedException();
      const alterada = await tx.platformWebAuthnCredential.updateMany({
        where: { identityId: identidade.id, credentialId: credencial.id, counter: credencial.counter },
        data: { counter: verificada.novoContador, lastUsedAt: new Date() },
      });
      if (alterada.count !== 1) throw new UnauthorizedException();
      const sessao = await tx.platformMasterSession.create({ data: {
        identityId: identidade.id, tokenHash: hash(token), secondFactorAt: new Date(agora),
        stepUpAt: new Date(agora), expiresAt: new Date(validadeDaSessao(agora)),
      } });
      return sessao.id;
    });
    return { token, sessionId, expiraEm: validadeDaSessao(agora) };
  }

  /** Encerra a sessão. A próxima operação com o mesmo token é recusada. */
  async encerrarSessao(contexto: ContextoMaster): Promise<void> {
    await this.repositorio.revogarSessao(contexto.sessionId);
  }

  // --------------------------------------------------------------- registro

  /**
   * Por que a janela não serviu — para a TRILHA, nunca para a resposta.
   *
   * O cliente recebe 404 em todos os casos, de propósito: distinguir "segredo
   * errado" de "janela vencida" na resposta diria a quem sonda que o segredo
   * estava certo, e isso é um oráculo. Quem investiga depois precisa justamente
   * dessa distinção, e ela cabe na trilha, que se lê com privilégio.
   *
   * `segredo_ou_finalidade_divergente` junta os dois casos porque o digest é
   * `sha256(segredo:finalidade:identityId)`: com a finalidade dentro do digest,
   * segredo certo com finalidade errada e segredo errado produzem a mesma
   * ausência de linha. Separá-los exigiria guardar o segredo de outra forma, o
   * que o desenho recusa.
   *
   * Envolvida em try/catch pela mesma razao que `registrarRecusaDeInscricao`:
   * esta consulta EXPLICA a recusa, nao a decide. Antes, uma falha de banco
   * aqui escapava antes do `NotFoundException` e trocava o 404 por 500 — ou
   * seja, a indisponibilidade da explicacao passava a dizer ao cliente que o
   * erro foi do servidor, e nao que a janela nao existe, nas duas rotas que
   * chegam por `janelaDeInscricao`. Achado da revisao da #744.
   *
   * `motivo_indisponivel` e deliberadamente distinto de `janela_indisponivel`:
   * um diz "nao foi possivel apurar", o outro diz "apurei e estava assim".
   * Trilha imprecisa e ruim; trilha que mente sobre o que apurou e pior.
   */
  private async motivoDaJanelaRecusada(
    identityId: string,
    secretDigest: string,
  ): Promise<{ motivo: string; correlationId: string | null }> {
    try {
      const pelaDigest = await this.prisma.platformMasterEnrollmentWindow.findFirst({
        where: { identityId, secretDigest },
        select: { consumedAt: true, revokedAt: true, expiresAt: true, correlationId: true },
      });
      if (!pelaDigest) {
        const abertas = await this.prisma.platformMasterEnrollmentWindow.count({
          where: { identityId, consumedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        });
        return {
          motivo: abertas > 0 ? 'segredo_ou_finalidade_divergente' : 'sem_janela_aberta',
          correlationId: null as string | null,
        };
      }
      if (pelaDigest.revokedAt) return { motivo: 'janela_revogada', correlationId: pelaDigest.correlationId };
      if (pelaDigest.consumedAt) return { motivo: 'janela_ja_consumida', correlationId: pelaDigest.correlationId };
      if (pelaDigest.expiresAt <= new Date()) return { motivo: 'janela_vencida', correlationId: pelaDigest.correlationId };
      return { motivo: 'janela_indisponivel', correlationId: pelaDigest.correlationId };
    } catch {
      return { motivo: 'motivo_indisponivel', correlationId: null };
    }
  }

  /**
   * Grava a recusa ou a falha da inscrição na trilha.
   *
   * Três escolhas, cada uma com consequência:
   *
   *   - **Fora da transação.** A recusa derruba a transação, e uma linha
   *     gravada dentro dela voltaria atrás junto com o consumo. Negar sem
   *     deixar rastro é como não ter negado — a mesma razão que levou
   *     `PlatformMasterGuard` a gravar `DENIED` fora de transação.
   *   - **Depois do limitador de tentativas.** Gravar antes transformaria a
   *     própria trilha em alvo: quem tivesse identidade Master encheria a
   *     tabela batendo na rota. Atrás do limitador, o número de linhas que uma
   *     sondagem escreve é o número de tentativas que o limitador deixa passar.
   *   - **Não derruba a recusa.** Se a gravação falhar, a pessoa continua
   *     recusada. Trocar 404/401 por 500 porque a auditoria caiu abriria outra
   *     porta, de outro tipo.
   *
   * O segredo NUNCA entra em `changes`. O que se registra é a finalidade, a
   * etapa e o motivo — o que a auditoria precisa, não o material que
   * autorizaria a inscrição.
   */
  private async registrarRecusaDeInscricao(dados: {
    userId: string;
    etapa: string;
    finalidade: string;
    motivo: string;
    resultado: 'DENIED' | 'FAILED';
    correlationId: string | null;
  }): Promise<void> {
    try {
      await this.prisma.platformAuditLog.create({
        data: {
          actorUserId: dados.userId,
          targetUserId: dados.userId,
          action: acaoDaInscricao(dados.etapa),
          scopeKind: 'GLOBAL',
          result: dados.resultado,
          reason: `${dados.resultado === 'FAILED' ? 'Falha' : 'Recusa'} na inscrição: ${dados.motivo}.`.slice(0, 200),
          correlationId: (dados.correlationId ?? `inscricao-${Date.now().toString(36)}`).slice(0, 64),
          changes: { finalidade: dados.finalidade, etapa: dados.etapa, motivo: dados.motivo },
        },
      });
    } catch {
      // Registrada ou não, a recusa vale.
    }
  }

  private async janelaDeInscricao(userId: string, pedido: AbrirInscricaoMasterDto, origem: string, etapa: string) {
    const config = configuracaoWebAuthn();
    const ambiente = process.env.EVOLVIA_AMBIENTE;
    const homologacao = ambiente === 'homologacao' && config.origin === 'https://homologacao.evolviatecnologia.com'
      && config.rpID === 'homologacao.evolviatecnologia.com' && process.env.EVOLVIA_PUBLIC_BASE_URL === config.origin;
    const ci = ambiente === 'ci' && process.env.EVOLVIA_CI_MODE === '1' && config.origin === 'http://localhost:3000'
      && config.rpID === 'localhost' && process.env.EVOLVIA_PUBLIC_BASE_URL === 'http://127.0.0.1:3000';
    if (!homologacao && !ci) throw new NotFoundException();
    const identidade = await this.exigirIdentidade(userId);
    if (identidade.status !== 'ACTIVE') throw new NotFoundException();
    try {
      await new PrismaPasswordRecoveryRateLimiter(this.prisma).assertAllowed({
        identityKey: hash('master-enrollment-' + etapa + ':' + identidade.id),
        originKey: hash('master-enrollment-' + etapa + ':' + origem),
      });
    } catch (e) {
      if (e instanceof PasswordRecoveryRateLimitExceededError) throw new HttpException('Tente novamente mais tarde.', 429);
      throw e;
    }
    const secretDigest = hash([pedido.segredo, pedido.finalidade, identidade.id].join(':'));
    const janela = await this.prisma.platformMasterEnrollmentWindow.findFirst({
      where: { identityId: identidade.id, secretDigest, purpose: pedido.finalidade, revokedAt: null, consumedAt: null,
        expiresAt: { gt: new Date() } },
      select: { id: true, identityId: true, correlationId: true, challengeHash: true },
    });
    if (!janela) {
      const { motivo, correlationId } = await this.motivoDaJanelaRecusada(identidade.id, secretDigest);
      await this.registrarRecusaDeInscricao({
        userId, etapa, finalidade: pedido.finalidade, motivo, resultado: 'DENIED', correlationId,
      });
      throw new NotFoundException();
    }
    return janela;
  }

  async abrirInscricao(userId: string, email: string, pedido: AbrirInscricaoMasterDto, origem: string) {
    const janela = await this.janelaDeInscricao(userId, pedido, origem, 'abrir');
    const opcoes = await this.webauthn.opcoesDeRegistro(email, []);
    const resultado = await this.prisma.platformMasterEnrollmentWindow.updateMany({
      where: { id: janela.id, identity: { userId, status: 'ACTIVE' }, revokedAt: null, consumedAt: null,
        expiresAt: { gt: new Date() } }, data: { challengeHash: hash(opcoes.challenge) },
    });
    if (!resultado.count) {
      // Entre a leitura e este UPDATE a janela deixou de ser utilizável —
      // revogada, vencida, consumida, ou a identidade saiu de ACTIVE.
      await this.registrarRecusaDeInscricao({
        userId, etapa: 'abrir', finalidade: pedido.finalidade, motivo: 'janela_indisponivel_na_abertura',
        resultado: 'DENIED', correlationId: janela.correlationId,
      });
      throw new NotFoundException();
    }
    return opcoes;
  }

  async consumirInscricao(userId: string, pedido: ConsumirInscricaoMasterDto, origem: string) {
    const janela = await this.janelaDeInscricao(userId, pedido, origem, 'concluir');
    const challengeHash = hash(pedido.desafio);
    if (janela.challengeHash !== challengeHash) {
      await this.registrarRecusaDeInscricao({
        userId, etapa: 'concluir', finalidade: pedido.finalidade, motivo: 'desafio_divergente',
        resultado: 'DENIED', correlationId: janela.correlationId,
      });
      throw new UnauthorizedException();
    }
    const verificado = await this.webauthn.verificarRegistro(pedido.resposta, pedido.desafio);
    if (!verificado) {
      // `FAILED` e não `DENIED`: a autorização estava em ordem e a cerimônia
      // criptográfica é que não se verificou. São investigações diferentes —
      // uma aponta para quem sonda, a outra para o autenticador ou a origem.
      await this.registrarRecusaDeInscricao({
        userId, etapa: 'concluir', finalidade: pedido.finalidade, motivo: 'atestacao_nao_verificada',
        resultado: 'FAILED', correlationId: janela.correlationId,
      });
      throw new UnauthorizedException();
    }
    try {
      await this.prisma.$transaction(async tx => {
        // Mesma ordem de locks do emissor no host: identidade antes da janela.
        const identidade = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PlatformMasterIdentity"
          WHERE id = ${janela.identityId} AND "userId" = ${userId} AND status = 'ACTIVE' FOR UPDATE`;
        if (!identidade.length || await tx.platformWebAuthnCredential.count({ where: { identityId: janela.identityId } })) {
          throw new UnauthorizedException();
        }
        const consumida = await tx.$executeRaw`UPDATE "PlatformMasterEnrollmentWindow"
          SET "consumedAt" = clock_timestamp(), "challengeHash" = NULL
          WHERE id = ${janela.id} AND "identityId" = ${janela.identityId} AND "challengeHash" = ${challengeHash}
            AND "consumedAt" IS NULL AND "revokedAt" IS NULL AND "expiresAt" > clock_timestamp()`;
        if (consumida !== 1) throw new UnauthorizedException();
        await tx.platformWebAuthnCredential.create({ data: this.repositorio.dadosDaCredencial({
          identityId: janela.identityId, rotulo: 'Chave de segurança', ...verificado,
        }) });
        await tx.platformAuditLog.create({ data: { actorUserId: userId, targetUserId: userId,
          action: 'consumir_inscricao_master', scopeKind: 'GLOBAL', result: 'ALLOWED',
          reason: 'Registro de autenticador autorizado no host.', correlationId: janela.correlationId,
          changes: { finalidade: pedido.finalidade } } });
      });
    } catch (erro) {
      // `UnauthorizedException` aqui é recusa de política DENTRO da transação:
      // a identidade saiu de ACTIVE, já havia credencial, ou a janela deixou de
      // ser consumível entre a leitura e o UPDATE. Qualquer outro erro é falha
      // de execução. Os dois casos não são a mesma linha na trilha, e tratá-los
      // como um só obrigaria quem investiga a reabrir o código para saber qual
      // aconteceu.
      const recusada = erro instanceof UnauthorizedException;
      await this.registrarRecusaDeInscricao({
        userId, etapa: 'concluir', finalidade: pedido.finalidade,
        motivo: recusada ? 'consumo_nao_autorizado' : 'falha_na_persistencia',
        resultado: recusada ? 'DENIED' : 'FAILED', correlationId: janela.correlationId,
      });
      throw erro;
    }
    return { registrado: true };
  }

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
        await tx.cliente.$queryRaw`SELECT id FROM "PlatformMasterIdentity" WHERE id = ${identidade.id} FOR UPDATE`;
        const sessao = await tx.cliente.platformMasterSession.findFirst({ where: {
          id: contexto.sessionId, identityId: identidade.id, tokenHash: contexto.tokenHash,
          revokedAt: null, expiresAt: { gt: new Date() },
        } });
        if (!sessao || !await tx.cliente.platformMasterIdentity.count({ where: { id: identidade.id, status: 'ACTIVE' } })) {
          throw new UnauthorizedException();
        }
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
    if (!leitura.ok) throw recusaDeValidacao(leitura.problemas);
    const nomes = await this.nomesDasPessoas(leitura.pedido.pessoas);
    return { pedido: leitura.pedido, resumo: resumoDaConcessao(leitura.pedido, nomes) };
  }

  /**
   * Concede. Só o proprietário chega aqui: o guard aplica `decidir`.
   *
   * **Atualiza antes de inserir, e a ordem não é indiferente.** A chave única da
   * concessão é (pessoa, ação, escopo), sem a validade. Com `createMany` e
   * `skipDuplicates` sozinhos, uma linha EXPIRADA fazia o insert ser descartado
   * e o `expiresAt` antigo permanecia — e `concessaoVigente` trata expirada como
   * ausente. O proprietário renovava, a resposta dizia que havia concedido, a
   * trilha gravava GRANTED, e a pessoa continuava barrada. Medido contra
   * PostgreSQL: 1 linha, ainda expirada.
   *
   * `skipDuplicates` continua no insert porque é ele que absorve a corrida com
   * outra requisição que tenha criado a mesma linha entre o update e o insert.
   *
   * `updateMany` com o `where` das cinco colunas, e não `upsert`, para não
   * depender do nome que o Prisma gera para a chave composta.
   */
  async conceder(actorUserId: string, contexto: ContextoMaster, corpo: unknown) {
    const leitura = validarPedidoDeConcessao(corpo);
    if (!leitura.ok) throw recusaDeValidacao(leitura.problemas);
    const pedido = leitura.pedido;
    const linhas = this.linhasDaConcessao(pedido);
    const validade = pedido.expiraEm ? new Date(pedido.expiraEm) : null;

    let renovadas = 0;
    let criadas = 0;
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
        for (const linha of linhas) {
          // `grantedAt` renovado junto: ele passa a dizer quando a validade
          // ATUAL foi concedida. O histórico de cada ação continua em
          // `PlatformGrantEvent`; manter a data da primeira concessão aqui
          // mostraria informação errada na tela de revisão.
          const { count } = await cliente.platformGrant.updateMany({
            where: linha,
            data: { grantedByUserId: actorUserId, grantedAt: new Date(), expiresAt: validade },
          });
          renovadas += count;
        }
        const inseridas = await cliente.platformGrant.createMany({
          data: linhas.map((l) => ({ ...l, grantedByUserId: actorUserId, expiresAt: validade })),
          skipDuplicates: true,
        });
        criadas = inseridas.count;
        await cliente.platformGrantEvent.createMany({
          data: linhas.map((l) => ({
            ...l,
            kind: 'GRANTED',
            actorUserId,
            reason: pedido.motivo,
            expiresAt: validade,
            correlationId: `grant-${contexto.sessionId}`,
          })),
        });
      },
    );
    // Conta o que de fato aconteceu. Antes respondia `linhas.length`, que era
    // verdade só quando nada existia antes.
    return { concedidas: renovadas + criadas, renovadas, criadas, resumo: resumoDaConcessao(pedido) };
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
    if (!leitura.ok) throw recusaDeValidacao(leitura.problemas);
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

  /**
   * A visão geral, contada sobre os dados persistidos.
   *
   * O recorte vai para o banco e para a política: o banco estreita por
   * igualdade em coluna escalar, a política aplica período e área. Ela recebe o
   * MESMO filtro, então o que o banco devolve é sempre um superconjunto do que
   * ela seleciona — e os totais não passam a depender de duas regras parecidas.
   *
   * O alvo desta rota é a plataforma inteira, então o guard só deixa passar
   * quem tem alcance global. Concessão de um evento não abre o painel geral:
   * mostrar totais da plataforma a quem só pode ver um evento seria vazamento
   * pela soma.
   */
  async visaoGeral(corpo: unknown) {
    const leitura = validarFiltroDaVisaoGeral(corpo);
    if (!leitura.ok) throw recusaDeValidacao(leitura.problemas);
    const eventos = await this.repositorio.eventosParaVisaoGeral(leitura.filtro);
    return montarVisaoGeral(eventos, leitura.filtro);
  }

  /**
   * O catálogo pesquisável de eventos.
   *
   * Mesmo alvo da visão geral — a plataforma — e por isso mesmo alcance
   * exigido: quem só cuida de um evento não recebe a lista de todos. O recorte
   * vai ao banco pelo MESMO `where` da visão geral, e o filtro fino roda na
   * política, que é a mesma função nos dois casos. É isso que impede o painel
   * de dizer um número e a lista de mostrar outro.
   */
  async catalogo(corpo: unknown) {
    const leitura = validarPedidoDoCatalogo(corpo);
    if (!leitura.ok) throw recusaDeValidacao(leitura.erros);
    const eventos = await this.repositorio.eventosParaCatalogo(leitura.pedido.filtro);
    return montarCatalogo(eventos, leitura.pedido);
  }

  /**
   * O relatório da trilha, no alcance que o guard autorizou.
   *
   * O escopo vem do `alvo` que o guard guardou na requisição, e não de uma
   * segunda leitura dos parâmetros: é o mesmo objeto que foi conferido. Essa
   * identidade é o que garante que a autorização e o relatório falem do mesmo
   * recurso.
   *
   * O filtro do corpo só estreita. Não existe campo de escopo nele, então não
   * há como pedir outro evento por aqui — e se alguém acrescentar um, o teste
   * de escopo é o que falha primeiro.
   */
  async relatorioDeAuditoria(alvo: Alvo, corpo: unknown) {
    const leitura = validarFiltroDoRelatorio(corpo);
    if (!leitura.ok) throw recusaDeValidacao(leitura.erros);
    const escopo = this.escopoDoAlvo(alvo);
    const linhas = await this.repositorio.trilhaDeAuditoria(restricaoDoEscopo(escopo), leitura.filtro);
    return montarRelatorio(linhas, escopo, leitura.filtro);
  }

  private escopoDoAlvo(alvo: Alvo): EscopoDoRelatorio {
    if (alvo.tipo === 'EVENTO') return { tipo: 'EVENTO', eventId: alvo.eventId };
    if (alvo.tipo === 'ORGANIZACAO') return { tipo: 'ORGANIZACAO', organizationId: alvo.organizationId };
    return { tipo: 'PLATAFORMA' };
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
