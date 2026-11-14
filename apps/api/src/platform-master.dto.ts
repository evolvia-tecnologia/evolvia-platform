import { IsArray, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * DTOs da Área Master (#665).
 *
 * De propósito permissivos na forma e rígidos no tamanho. O `ValidationPipe`
 * global roda com `forbidNonWhitelisted`, então declarar os campos é o que
 * impede corpo com propriedade estranha; o conteúdo de cada um é conferido por
 * `validarPedidoDeConcessao` e pelas políticas de cerimônia, que acumulam TODOS
 * os problemas e escrevem a mensagem que a pessoa lê. Repetir aqui as regras de
 * lá daria duas verdades sobre a mesma coisa, e a que o usuário veria seria a
 * pior das duas.
 *
 * Os limites de tamanho ficam aqui porque são defesa contra corpo grande, que é
 * assunto de transporte e não de regra de negócio.
 */

export class RevisarConcessaoDto {
  @IsArray()
  pessoas!: unknown[];

  @IsArray()
  acoes!: unknown[];

  @IsObject()
  escopo!: Record<string, unknown>;

  @IsString()
  @MaxLength(400)
  motivo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  expiraEm?: string | null;
}

export class ConcederDto extends RevisarConcessaoDto {}
export class RevogarDto extends RevisarConcessaoDto {}

/**
 * Filtro da visão geral.
 *
 * Declarar os campos é o que o `forbidNonWhitelisted` usa para recusar corpo
 * com propriedade estranha. O conteúdo é conferido por
 * `validarFiltroDaVisaoGeral`, que acumula todos os problemas e escreve as
 * mensagens.
 */
export class VisaoGeralDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  de?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  campoDoPeriodo?: string;

  @IsOptional()
  @IsArray()
  organizationIds?: unknown[];

  @IsOptional()
  @IsArray()
  profileCodes?: unknown[];

  @IsOptional()
  @IsArray()
  areas?: unknown[];

  @IsOptional()
  @IsArray()
  formatos?: unknown[];

  @IsOptional()
  @IsArray()
  situacoes?: unknown[];
}

/**
 * Filtro do relatório de auditoria.
 *
 * Sem campo de escopo, de propósito: o alcance vem da rota, que é o que o guard
 * conferiu. Acrescentar escopo aqui seria abrir a porta que `dentroDoEscopo`
 * existe para fechar.
 */
export class RelatorioDeAuditoriaDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  de?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ate?: string | null;

  @IsOptional()
  @IsArray()
  acoes?: unknown[];

  @IsOptional()
  @IsArray()
  resultados?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorUserId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limite?: number;
}

export class ConcluirCerimoniaDto {
  /**
   * O desafio que o cliente recebeu, devolvido como veio.
   *
   * Precisa voltar porque a coluna guarda o digest vinculado à sessão, não o
   * desafio cru — o servidor não tem como reconstruí-lo. A política confere que
   * é o que foi aberto e vinculado antes de a biblioteca olhar a assinatura.
   */
  @IsString()
  @MaxLength(512)
  desafio!: string;

  @IsObject()
  resposta!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  rotulo?: string | null;
}
