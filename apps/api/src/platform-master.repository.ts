import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.ts';
import { guardarChavePublica, guardarIdDaCredencial, guardarRotulo, guardarTransportes, lerChavePublica, lerTransportes } from './platform-credential-codec.ts';
import type { Banco, RegistroGravado } from './platform-audit-transaction.ts';
import type { Concessao } from './platform-grant-policy.ts';
import type { IdentidadeMaster, SessaoGravada } from './platform-session-policy.ts';
import type { TipoDeCerimonia } from './platform-ceremony-policy.ts';
import type { EventoParaVisaoGeral, FormatoDoEvento, SituacaoDoEvento } from './platform-overview-policy.ts';

/**
 * O cliente de dentro da transação.
 *
 * É `Prisma.TransactionClient`, o tipo que o próprio Prisma entrega a
 * `$transaction`, e não um `Omit` do `PrismaService`. Eu havia escrito
 * `Omit<PrismaService, '$transaction'>` e o CI reprovou com TS2740: o
 * `PrismaService` estende `PrismaClient` E implementa os hooks de ciclo de
 * vida, então aquele `Omit` continuava exigindo `onModuleInit`,
 * `onModuleDestroy`, `$connect`, `$disconnect`, `$on`, `$use` e `$extends` —
 * nenhum deles existe dentro da transação, e com razão: ninguém deve conectar,
 * desconectar ou abrir outra transação de dentro de uma.
 *
 * O ponto de nomear este tipo segue o mesmo: cast amplo aqui esconderia o erro
 * de passar o cliente de fora e perder o rollback, que é a garantia inteira
 * desta frente.
 */
export type ClienteTransacional = Prisma.TransactionClient;

/** O que a cerimônia precisa gravar na identidade. */
export interface DesafioParaGravar {
  readonly pendingChallenge: string;
  readonly pendingChallengeKind: TipoDeCerimonia;
  readonly pendingChallengeExpires: string;
}

export interface CredencialParaVerificar {
  readonly id: string;
  readonly publicKey: Uint8Array;
  readonly counter: number;
  readonly transports: string[];
}

export interface IdentidadeComSessao {
  readonly identityId: string;
  readonly userId: string;
  readonly identidade: IdentidadeMaster;
  readonly sessao: SessaoGravada;
  readonly sessionId: string;
}

/**
 * Adaptador Prisma da Área Master (#665).
 *
 * Fino de propósito, como o `OperatorCapabilityRepository`: quem decide está em
 * `platform-session-policy`, `platform-ceremony-policy`, `platform-grant-policy`
 * e `platform-audit-transaction`, todos puros e testados. Aqui só se lê e se
 * escreve. A razão é a mesma de lá: o Node não parseia decorators, então este
 * arquivo não pode ser conferido na sessão que o escreveu, e por isso carrega o
 * mínimo possível de decisão.
 *
 * A chave pública nunca entra nem sai crua: passa por
 * `platform-credential-codec`, porque a coluna é texto e a biblioteca trabalha
 * com bytes.
 */
@Injectable()
export class PlatformMasterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A identidade Master de uma pessoa, ou `null` se ela não tem uma. */
  async identidade(userId: string) {
    return this.prisma.platformMasterIdentity.findUnique({
      where: { userId },
      select: {
        id: true, userId: true, role: true, status: true,
        pendingChallenge: true, pendingChallengeKind: true, pendingChallengeExpires: true,
      },
    });
  }

  /**
   * Identidade e sessão a partir do hash do token.
   *
   * Duas consultas e não um join porque a sessão é achada pelo hash único e a
   * identidade pelo id dela — e porque assim a leitura serve igual dentro de
   * uma transação. Devolve `null` quando qualquer das duas falta; quem chama
   * responde sem distinguir, para não contar se o token existe.
   */
  async porTokenDeSessao(tokenHash: string): Promise<IdentidadeComSessao | null> {
    const sessao = await this.prisma.platformMasterSession.findUnique({
      where: { tokenHash },
      select: { id: true, identityId: true, secondFactorAt: true, stepUpAt: true, expiresAt: true, revokedAt: true },
    });
    if (!sessao) return null;

    const identidade = await this.prisma.platformMasterIdentity.findUnique({
      where: { id: sessao.identityId },
      select: { id: true, userId: true, role: true, status: true },
    });
    if (!identidade) return null;

    return {
      identityId: identidade.id,
      userId: identidade.userId,
      sessionId: sessao.id,
      identidade: {
        role: String(identidade.role) as IdentidadeMaster['role'],
        status: String(identidade.status) as IdentidadeMaster['status'],
      },
      sessao: {
        secondFactorAt: sessao.secondFactorAt,
        stepUpAt: sessao.stepUpAt,
        expiresAt: sessao.expiresAt,
        revokedAt: sessao.revokedAt,
      },
    };
  }

  /** Grava o desafio da cerimônia, substituindo qualquer um anterior. */
  async gravarDesafio(identityId: string, desafio: DesafioParaGravar): Promise<void> {
    await this.prisma.platformMasterIdentity.update({
      where: { id: identityId },
      data: {
        pendingChallenge: desafio.pendingChallenge,
        pendingChallengeKind: desafio.pendingChallengeKind,
        pendingChallengeExpires: new Date(desafio.pendingChallengeExpires),
      },
    });
  }

  /**
   * Apaga o desafio, e só se ele ainda for aquele.
   *
   * O `where` inclui o valor porque é isto que torna o consumo atômico: duas
   * requisições concorrentes com o mesmo desafio disputam a mesma linha, e a
   * segunda não encontra nada para atualizar. `count` zero significa que outra
   * já consumiu, e quem chama trata como desafio inválido — não como erro.
   */
  async consumirDesafio(identityId: string, desafioGravado: string): Promise<boolean> {
    const { count } = await this.prisma.platformMasterIdentity.updateMany({
      where: { id: identityId, pendingChallenge: desafioGravado },
      data: { pendingChallenge: null, pendingChallengeKind: null, pendingChallengeExpires: null },
    });
    return count === 1;
  }

  /** Credenciais da identidade, já na forma que a biblioteca espera. */
  async credenciais(identityId: string): Promise<CredencialParaVerificar[]> {
    const linhas = await this.prisma.platformWebAuthnCredential.findMany({
      where: { identityId },
      select: { credentialId: true, publicKey: true, counter: true, transports: true },
      orderBy: { createdAt: 'asc' },
    });
    return linhas.map((l) => ({
      id: l.credentialId,
      publicKey: lerChavePublica(l.publicKey),
      counter: l.counter,
      transports: lerTransportes(l.transports),
    }));
  }

  /** Uma credencial específica desta identidade, ou `null`. */
  async credencial(identityId: string, credentialId: string): Promise<CredencialParaVerificar | null> {
    const linha = await this.prisma.platformWebAuthnCredential.findUnique({
      where: { credentialId },
      select: { identityId: true, credentialId: true, publicKey: true, counter: true, transports: true },
    });
    if (!linha || linha.identityId !== identityId) return null;
    return {
      id: linha.credentialId,
      publicKey: lerChavePublica(linha.publicKey),
      counter: linha.counter,
      transports: lerTransportes(linha.transports),
    };
  }

  /**
   * Monta a linha da credencial para gravar.
   *
   * Existe como método próprio porque a gravação acontece DENTRO da transação
   * auditada, pelo cliente transacional, e não por `this.prisma`. Sem isto, o
   * serviço refaria a conversão à mão e haveria dois caminhos diferentes para a
   * mesma coluna — que é exatamente como uma chave pública se perde. Aqui há um
   * caminho só, e ele passa pelo codec com todas as guardas.
   */
  dadosDaCredencial(dados: {
    identityId: string;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    rotulo: string | null;
    backedUp: boolean;
    transportes: readonly string[] | null | undefined;
  }) {
    return {
      identityId: dados.identityId,
      credentialId: guardarIdDaCredencial(dados.credentialId),
      publicKey: guardarChavePublica(dados.publicKey),
      counter: dados.counter,
      label: guardarRotulo(dados.rotulo),
      backedUp: dados.backedUp,
      transports: guardarTransportes(dados.transportes),
    };
  }

  /** Registra a credencial fora de transação. Usa o MESMO construtor acima. */
  async registrarCredencial(dados: Parameters<PlatformMasterRepository['dadosDaCredencial']>[0]): Promise<void> {
    await this.prisma.platformWebAuthnCredential.create({ data: this.dadosDaCredencial(dados) });
  }

  /**
   * Avança o contador da credencial, e só para frente.
   *
   * O `where` exige que o contador gravado continue menor: em duas
   * autenticações concorrentes, a que chegar com o valor menor não retrocede o
   * contador da outra. Contador que não avança é detectado antes, por
   * `contadorAceito`; esta guarda é contra a corrida, não contra o clone.
   */
  async avancarContador(credentialId: string, de: number, para: number): Promise<void> {
    await this.prisma.platformWebAuthnCredential.updateMany({
      where: { credentialId, counter: { lte: de } },
      data: { counter: para, lastUsedAt: new Date() },
    });
  }

  /** Abre a sessão Master. O token cru fica com quem chamou; aqui só o hash. */
  async criarSessao(dados: {
    identityId: string;
    tokenHash: string;
    secondFactorAt: string;
    expiresAt: string;
  }): Promise<string> {
    const criada = await this.prisma.platformMasterSession.create({
      data: {
        identityId: dados.identityId,
        tokenHash: dados.tokenHash,
        secondFactorAt: new Date(dados.secondFactorAt),
        stepUpAt: new Date(dados.secondFactorAt),
        expiresAt: new Date(dados.expiresAt),
      },
      select: { id: true },
    });
    return criada.id;
  }

  /**
   * Encerra a sessão.
   *
   * `updateMany` com `revokedAt: null` no filtro para que encerrar duas vezes
   * seja idempotente e não sobrescreva o instante da primeira revogação — que é
   * o que a trilha de auditoria vai citar.
   */
  async revogarSessao(sessionId: string): Promise<void> {
    await this.prisma.platformMasterSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Concessões vigentes de uma pessoa, na forma que a política consome. */
  async concessoes(targetUserId: string): Promise<Concessao[]> {
    const linhas = await this.prisma.platformGrant.findMany({
      where: { targetUserId },
      select: { action: true, scopeKind: true, organizationId: true, eventId: true, expiresAt: true },
    });
    return linhas.map((l) => ({
      acao: l.action,
      escopo: this.escopoDaLinha(l.scopeKind, l.organizationId, l.eventId),
      expiraEm: l.expiresAt,
      revogadaEm: null,
    }));
  }

  private escopoDaLinha(scopeKind: unknown, organizationId: string, eventId: string): Concessao['escopo'] {
    const tipo = String(scopeKind);
    if (tipo === 'ORGANIZACAO') return { tipo: 'ORGANIZACAO', organizationId };
    if (tipo === 'EVENTO') return { tipo: 'EVENTO', eventId };
    return { tipo: 'GLOBAL' };
  }

  /**
   * Os eventos que a visão geral conta.
   *
   * O `where` só estreita por igualdade em coluna escalar — organização,
   * perfil, formato e situação. Período e área ficam com a política, de
   * propósito: o que o banco devolve tem de ser um SUPERCONJUNTO do que a
   * política seleciona, senão os totais passam a depender de duas regras
   * parecidas mas não idênticas, e a primeira divergência de borda vira número
   * errado sem ninguém notar.
   *
   * Isto lê todos os eventos que passam no recorte. É varredura, e é aceitável
   * enquanto a plataforma tem poucos eventos; quando crescer, a conta vira
   * agregação em SQL. O contrato da política — o número É a lista — é o que
   * vai permitir conferir essa troca.
   */
  async eventosParaVisaoGeral(recorte: {
    organizationIds?: readonly string[];
    profileCodes?: readonly string[];
    formatos?: readonly FormatoDoEvento[];
    situacoes?: readonly SituacaoDoEvento[];
  }): Promise<EventoParaVisaoGeral[]> {
    const where: Record<string, unknown> = {};
    if (recorte.organizationIds?.length) where.organizationId = { in: [...recorte.organizationIds] };
    if (recorte.profileCodes?.length) where.profileCode = { in: [...recorte.profileCodes] };
    if (recorte.formatos?.length) where.format = { in: [...recorte.formatos] };
    if (recorte.situacoes?.length) where.status = { in: [...recorte.situacoes] };

    const linhas = await this.prisma.event.findMany({
      where: where as never,
      select: {
        id: true, organizationId: true, profileCode: true, format: true,
        status: true, subjectAreas: true, createdAt: true, startDate: true, endDate: true,
      },
    });
    return linhas.map((l) => ({
      id: l.id,
      organizationId: l.organizationId,
      profileCode: l.profileCode === null ? null : String(l.profileCode),
      format: String(l.format) as FormatoDoEvento,
      status: String(l.status) as SituacaoDoEvento,
      subjectAreas: l.subjectAreas,
      createdAt: l.createdAt,
      startDate: l.startDate,
      endDate: l.endDate,
    }));
  }

  /**
   * O `Banco` que `executarAuditado` consome.
   *
   * `emTransacao` entrega o cliente transacional em `cliente`, e é por ele que a
   * mudança privilegiada tem de passar — se passar pelo cliente de fora, não
   * participa do rollback e a garantia da #665 deixa de valer.
   */
  banco(): Banco<ClienteTransacional> {
    return {
      emTransacao: (fn) =>
        this.prisma.$transaction((tx) =>
          fn({
            cliente: tx,
            gravarAuditoria: (registro: RegistroGravado) =>
              tx.platformAuditLog.create({ data: this.paraColunas(registro) }),
          }),
        ),
      gravarAuditoriaSolta: (registro: RegistroGravado) =>
        this.prisma.platformAuditLog.create({ data: this.paraColunas(registro) }),
    };
  }

  /**
   * Traduz o registro para as colunas, e só o `changes` precisa de tradução.
   *
   * A coluna é `Json?`, e Prisma distingue três coisas que em JavaScript são
   * todas `null`: ausência de valor (SQL NULL), o literal JSON `null` gravado
   * dentro do documento, e não mexer na coluna. Passar `null` cru é o TS2322
   * que o CI acusou, e escolher errado entre `DbNull` e `JsonNull` muda o que
   * uma consulta de auditoria encontra depois.
   *
   * Aqui `null` significa "esta ação não registrou alteração nenhuma", que é
   * ausência de valor — portanto `DbNull`, SQL NULL. `JsonNull` diria que a
   * ação registrou, como conteúdo, o valor nulo; não é o caso.
   */
  private paraColunas(registro: RegistroGravado) {
    const { changes, ...colunas } = registro;
    return { ...colunas, changes: changes === null ? Prisma.DbNull : changes };
  }
}
