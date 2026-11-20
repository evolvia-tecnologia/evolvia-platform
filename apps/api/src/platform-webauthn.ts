import { Injectable } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { CredencialParaVerificar } from './platform-master.repository.ts';

/**
 * Único arquivo que fala com `@simplewebauthn/server` (#665).
 *
 * Isolado de propósito: a assinatura da biblioteca é a parte que eu não posso
 * conferir na sessão que escreveu este código, porque `node_modules` não está
 * disponível. Concentrando as quatro chamadas aqui, um erro de assinatura
 * aparece num arquivo pequeno e não espalhado pelo serviço.
 *
 * A verificação criptográfica é dela. A decisão de qual desafio vale, se já foi
 * usado e se vem da sessão certa é de `platform-ceremony-policy`, que é puro e
 * testado.
 */

export interface ConfiguracaoWebAuthn {
  readonly rpID: string;
  readonly rpName: string;
  readonly origin: string;
}

export function configuracaoWebAuthn(): ConfiguracaoWebAuthn {
  return {
    rpID: process.env.PLATFORM_MASTER_RP_ID ?? 'localhost',
    rpName: process.env.PLATFORM_MASTER_RP_NAME ?? 'Evolvia — Área Master',
    origin: process.env.PLATFORM_MASTER_ORIGIN ?? 'http://localhost:3000',
  };
}

export interface RegistroVerificado {
  readonly credentialId: string;
  readonly publicKey: Uint8Array;
  readonly counter: number;
  readonly transportes: string[] | undefined;
  readonly backedUp: boolean;
}

export interface AutenticacaoVerificada {
  readonly novoContador: number;
}

@Injectable()
export class PlatformWebAuthnService {
  private readonly config = configuracaoWebAuthn();

  async opcoesDeRegistro(userName: string, jaRegistradas: readonly CredencialParaVerificar[]) {
    return generateRegistrationOptions({
      rpName: this.config.rpName,
      rpID: this.config.rpID,
      userName,
      attestationType: 'none',
      excludeCredentials: jaRegistradas.map((c) => ({ id: c.id })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
  }

  async opcoesDeAutenticacao(credenciais: readonly CredencialParaVerificar[]) {
    return generateAuthenticationOptions({
      rpID: this.config.rpID,
      allowCredentials: credenciais.map((c) => ({ id: c.id })),
      userVerification: 'required',
    });
  }

  /**
   * `null` quando a biblioteca não verificou — nunca um "deu quase certo".
   *
   * O `catch` não é descuido: a biblioteca LANÇA quando a resposta é malformada,
   * e resposta malformada é verificação falhada, não erro de servidor. Sem isto,
   * um corpo inválido viraria 500 — o que entrega detalhe interno a quem está
   * sondando e confunde quem errou de boa-fé.
   */
  async verificarRegistro(resposta: unknown, desafioEsperado: string): Promise<RegistroVerificado | null> {
    const verificacao = await this.semLancar(() => verifyRegistrationResponse({
      response: resposta as never,
      expectedChallenge: desafioEsperado,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpID,
      requireUserVerification: true,
    }));
    if (!verificacao || !verificacao.verified || !verificacao.registrationInfo) return null;
    const info = verificacao.registrationInfo;
    return {
      credentialId: info.credential.id,
      publicKey: info.credential.publicKey,
      counter: info.credential.counter,
      transportes: info.credential.transports,
      backedUp: info.credentialBackedUp,
    };
  }

  async verificarAutenticacao(
    resposta: unknown,
    desafioEsperado: string,
    credencial: CredencialParaVerificar,
  ): Promise<AutenticacaoVerificada | null> {
    const verificacao = await this.semLancar(() => verifyAuthenticationResponse({
      response: resposta as never,
      expectedChallenge: desafioEsperado,
      expectedOrigin: this.config.origin,
      expectedRPID: this.config.rpID,
      requireUserVerification: true,
      credential: {
        id: credencial.id,
        // Cópia explícita, e não a referência: a biblioteca declara
        // `Uint8Array<ArrayBuffer>` e o que vem do banco é
        // `Uint8Array<ArrayBufferLike>`, que inclui `SharedArrayBuffer`. Foi o
        // TS2322 que o CI acusou. `new Uint8Array(…)` a partir de um array de
        // bytes aloca buffer próprio, então o tipo fica certo sem cast, e a
        // chave que a biblioteca lê não compartilha memória com mais nada.
        publicKey: new Uint8Array(credencial.publicKey),
        counter: credencial.counter,
        transports: credencial.transports as never,
      },
    }));
    if (!verificacao || !verificacao.verified) return null;
    return { novoContador: verificacao.authenticationInfo.newCounter };
  }

  /** Verificação que falha é `null`. O motivo nunca sobe para a resposta. */
  private async semLancar<T>(executar: () => Promise<T>): Promise<T | null> {
    try {
      return await executar();
    } catch {
      return null;
    }
  }
}
