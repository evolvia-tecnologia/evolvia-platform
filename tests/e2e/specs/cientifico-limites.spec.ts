import { expect, test } from '@playwright/test';
import {
  assertAbstractWithinEvent,
  assertAuthorRoster,
  AuthorSubmissionPolicyError,
  countAbstractUnits,
  normalizeAuthorSubmission,
  type AuthorRosterRules,
} from '../../../apps/api/src/scientific-author-policy';
import {
  canTransitionSubmission,
  DEFAULT_PRESENTATION_FORMATS,
  requiresImmutableSubmittedVersion,
  shouldHideAuthorIdentity,
  type ScientificSubmissionStatus,
} from '../../../apps/api/src/scientific-submission-policy';

/**
 * Fronteiras do evento cientifico — CL-03.
 *
 * scientific-author-policy.ts e scientific-submission-policy.ts nao tem nenhum
 * import: sao logica pura. Da para exercita-las por comportamento, sem banco,
 * sem HTTP e sem ambiente:
 *
 *     EVOLVIA_E2E_MODO=inventario npx playwright test --grep @cientifico
 *
 * O que isto NAO e: nao substitui a jornada ponta a ponta. Congresso criado,
 * submissao enviada, avaliacao distribuida e ePoster publicado continuam
 * exigindo ambiente. Isto cobre as fronteiras numericas, que sao onde o
 * requisito escrito e o codigo mais facilmente divergem — e divergem.
 */

const base = {
  modalityId: 'abcdefghij',
  title: 'Titulo valido de trabalho',
  abstractText: 'Resumo valido.',
  institution: 'Universidade Ficticia',
  keywords: ['alfa', 'beta', 'gama'],
  coauthors: [],
  proceedingsAuthorizationAccepted: true,
};

function coautor(indice: number) {
  return {
    name: `Coautor ${indice}`,
    email: `coautor${indice}@exemplo.invalido`,
    institution: 'Universidade Ficticia',
    presenter: false,
    corresponding: false,
    sortOrder: indice + 1,
  };
}

test.describe('Fronteiras do evento cientifico @cientifico', () => {
  // ---- o que o produto JA garante: fixar para pegar regressao -------------

  test('modalidades de apresentacao padrao incluem oral e poster', async () => {
    const codigos = DEFAULT_PRESENTATION_FORMATS.map((f) => f.code).sort();
    expect(codigos).toEqual(['EPOSTER', 'ORAL', 'POSTER', 'TEMA_LIVRE']);
    for (const formato of DEFAULT_PRESENTATION_FORMATS) {
      expect(formato.submissionEnabled, `${formato.code} precisa aceitar submissao`).toBe(true);
      expect(formato.evaluationEnabled, `${formato.code} precisa aceitar avaliacao`).toBe(true);
    }
  });

  test('resumo respeita o limite configurado no evento', async () => {
    const regra = { enabled: true, unit: 'CHARACTERS' as const, min: 100, max: 2800 };
    expect(countAbstractUnits('a'.repeat(2800), 'CHARACTERS')).toBe(2800);
    expect(() => assertAbstractWithinEvent('a'.repeat(2800), regra)).not.toThrow();
    expect(() => assertAbstractWithinEvent('a'.repeat(2801), regra)).toThrow(AuthorSubmissionPolicyError);
    expect(() => assertAbstractWithinEvent('a'.repeat(99), regra)).toThrow(AuthorSubmissionPolicyError);
    // Contagem por palavras muda a fronteira: 'uma duas tres' = 3 palavras.
    expect(countAbstractUnits('uma duas tres', 'WORDS')).toBe(3);
    // Evento que nao coleta resumo recusa texto, em vez de ignorar.
    expect(() => assertAbstractWithinEvent('qualquer coisa', { enabled: false, unit: 'CHARACTERS', min: 0, max: 0 }))
      .toThrow(AuthorSubmissionPolicyError);
  });

  test('coautor duplicado, e-mail invalido e repeticao do remetente sao recusados', async () => {
    expect(() => normalizeAuthorSubmission({ ...base, coauthors: [coautor(1), coautor(1)] }))
      .toThrow(AuthorSubmissionPolicyError);
    expect(() => normalizeAuthorSubmission({ ...base, coauthors: [{ ...coautor(1), email: 'sem-arroba' }] }))
      .toThrow(AuthorSubmissionPolicyError);

    const regras: AuthorRosterRules = {
      minAuthors: 1, maxAuthors: 10, maxPresenters: 1,
      requirePresenter: true, requireCorrespondingAuthor: false, requireAuthorInstitution: false,
    };
    expect(() => assertAuthorRoster('autor@exemplo.invalido', {
      coauthors: [{ ...coautor(1), email: 'autor@exemplo.invalido' }],
      submitterPresenter: true, submitterCorresponding: true,
      institution: 'Universidade Ficticia', submitterSortOrder: 1,
    }, regras)).toThrow(/mesmo e-mail|repetir/iu);
  });

  test('texto do participante recusa injecao', async () => {
    for (const veneno of ['<script>alert(1)</script>', 'javascript:alert(1)', 'Titulo com <b> tag']) {
      expect(
        () => normalizeAuthorSubmission({ ...base, title: `Trabalho ${veneno}` }),
        `precisa recusar: ${veneno}`,
      ).toThrow(AuthorSubmissionPolicyError);
    }
  });

  test('palavra-chave repetida e recusada, inclusive por caixa', async () => {
    expect(() => normalizeAuthorSubmission({ ...base, keywords: ['Alfa', 'alfa'] }))
      .toThrow(AuthorSubmissionPolicyError);
    expect(() => normalizeAuthorSubmission({ ...base, keywords: ['a'] }))
      .toThrow(AuthorSubmissionPolicyError);
  });

  test('o fluxo de avaliacao segue a maquina de estados declarada', async () => {
    expect(canTransitionSubmission('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionSubmission('SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransitionSubmission('UNDER_REVIEW', 'ACCEPTED')).toBe(true);
    expect(canTransitionSubmission('UNDER_REVIEW', 'ACCEPTED_WITH_CHANGES')).toBe(true);
    // Submetido nao volta a rascunho: a versao submetida e imutavel.
    expect(canTransitionSubmission('SUBMITTED', 'DRAFT')).toBe(false);
    expect(canTransitionSubmission('DRAFT', 'ACCEPTED')).toBe(false);
    for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'ACCEPTED_WITH_CHANGES'] as ScientificSubmissionStatus[]) {
      expect(requiresImmutableSubmittedVersion(status), `${status} precisa congelar a versao`).toBe(true);
    }
    expect(requiresImmutableSubmittedVersion('DRAFT')).toBe(false);
  });

  test('avaliacao cega esconde a identidade do autor', async () => {
    expect(shouldHideAuthorIdentity('DOUBLE_BLIND')).toBe(true);
    expect(shouldHideAuthorIdentity('SINGLE_BLIND')).toBe(true);
    expect(shouldHideAuthorIdentity('OPEN')).toBe(false);
  });

  // ---- fronteiras que a #628 nomeia e o codigo NAO impoe ------------------

  test('titulo deveria ter limite de 180 caracteres', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'divergencia-requisito-codigo',
      description: 'A #628 pede titulo de 180 caracteres. '
        + 'normalizeAuthorSubmission aceita de 5 a 1000. Nao existe 180 no codigo.',
    });
    // 181 caracteres: pelo requisito deveria recusar.
    expect(
      () => normalizeAuthorSubmission({ ...base, title: 'T'.repeat(181) }),
      'Titulo de 181 caracteres foi ACEITO. O limite real e 1000, nao 180 '
      + '(scientific-author-policy.ts: "O titulo deve ter entre 5 e 1000 caracteres"). '
      + 'Decidir qual vale: se 180 e requisito, falta impor; se 1000 e o certo, '
      + 'corrigir a #628. Nao alterei nenhum dos dois.',
    ).toThrow(AuthorSubmissionPolicyError);
  });

  test('palavras-chave deveriam exigir de 3 a 5', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'divergencia-requisito-codigo',
      description: 'A #628 pede de 3 a 5 palavras-chave. O codigo aceita de 0 a 20: '
        + 'nao ha minimo nenhum, e o maximo e 20. Lista vazia passa.',
    });
    // Lista vazia: pelo requisito deveria recusar.
    expect(
      () => normalizeAuthorSubmission({ ...base, keywords: [] }),
      'Submissao SEM nenhuma palavra-chave foi ACEITA. '
      + 'A validacao e `keywords.length > 20`, sem minimo, logo [] passa e 20 tambem. '
      + 'O requisito de 3 a 5 nao esta imposto em lugar nenhum desta politica.',
    ).toThrow(AuthorSubmissionPolicyError);
  });

  test('coautores deveriam parar em 10', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'divergencia-requisito-codigo',
      description: 'A #628 pede ate 10 coautores. O teto rigido e 19 coautores '
        + '(normalizeCoauthors: `value.length > 19`), o que da 20 autores com o remetente. '
        + 'maxAuthors existe como regra do evento, mas e configuravel: um evento '
        + 'configurado sem maxAuthors aceita 20 autores.',
    });
    const onze = Array.from({ length: 11 }, (_, i) => coautor(i + 1));
    expect(
      () => normalizeAuthorSubmission({ ...base, coauthors: onze }),
      'Onze coautores foram ACEITOS pela normalizacao. O teto rigido e 19. '
      + 'O limite de 10 so vale se o evento definir maxAuthors=11 em AuthorRosterRules, '
      + 'o que e configuracao, nao garantia do produto.',
    ).toThrow(AuthorSubmissionPolicyError);
  });

  test('trabalho aceito com alteracoes deveria permitir correcao @gate-permissao', async ({}, testInfo) => {
    testInfo.annotations.push({
      type: 'lacuna-confirmada',
      description: 'ALLOWED_TRANSITIONS define ACCEPTED_WITH_CHANGES: [] — estado '
        + 'terminal, sem saida. A #628 pede o passo de correcoes depois da avaliacao. '
        + 'Como esta, o autor nao tem para onde ir: nenhuma transicao sai de '
        + 'ACCEPTED_WITH_CHANGES, e requiresImmutableSubmittedVersion congela a versao.',
    });
    const saidas = (['DRAFT', 'INCOMPLETE', 'SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'] as ScientificSubmissionStatus[])
      .filter((destino) => canTransitionSubmission('ACCEPTED_WITH_CHANGES', destino));
    expect(
      saidas,
      'ACCEPTED_WITH_CHANGES e terminal: nenhuma transicao sai dele. '
      + 'O ciclo de correcao pedido pela #628 ("avaliacao, correcoes") nao e '
      + 'alcancavel por esta maquina de estados. Faltaria algo como '
      + 'ACCEPTED_WITH_CHANGES -> SUBMITTED (nova versao) ou um estado de revisao '
      + 'do autor.\n\n'
      + 'Esta falha e a evidencia da lacuna, nao defeito do teste.',
    ).not.toEqual([]);
  });
});
