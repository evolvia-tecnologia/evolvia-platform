import { expect, test } from '@playwright/test';
import {
  isOperationalSection,
  showsEntertainmentNavigation,
  showsExhibitorNavigation,
  showsScientificNavigation,
  type EventFlowSection,
} from '../../../apps/web/lib/event-flow';

/**
 * Contrato de navegacao por perfil — CL-04.
 *
 * Estes testes exercitam a logica real de apps/web/lib/event-flow.ts, sem
 * navegador e sem ambiente de homologacao. Rodam hoje:
 *
 *     EVOLVIA_E2E_MODO=inventario npx playwright test --grep @contrato
 *
 * Por que isto existe separado dos testes de interface: a regra de quem ve o
 * que mora aqui, em funcoes puras. Testar a regra na funcao e barato,
 * deterministico e nao depende de ninguem publicar nada. Os testes de
 * interface continuam necessarios para provar que a funcao e de fato
 * consultada na tela — sao coisas diferentes e ambas precisam existir.
 */

/**
 * Nomes realmente exportados pelo modulo.
 *
 * O executor transpila para CommonJS e o resultado ganha `__esModule` e
 * `default`, que sao artefato do empacotador e nao superficie do modulo.
 * Sem filtrar, a assercao de contrato passaria a depender de qual
 * transpilador rodou — o oposto de um contrato.
 */
async function nomesExportados(): Promise<string[]> {
  const modulo = await import('../../../apps/web/lib/event-flow');
  const artefatos = new Set(['__esModule', 'default']);
  return Object.keys(modulo).filter((nome) => !artefatos.has(nome));
}

test.describe('Contrato de navegacao por perfil @contrato', () => {
  // ---- superficie exportada: ancora de todas as outras assercoes ----------

  test('event-flow.ts exporta exatamente a superficie esperada', async () => {
    const exportado = (await nomesExportados()).sort();
    // Fixado de propósito. Se alguem adicionar ou remover uma funcao aqui, este
    // teste falha antes dos outros e explica por que eles deixaram de valer:
    // as assercoes abaixo dependem desta superficie, e um teste de contrato que
    // nao sabe contra o que roda nao e evidencia de nada.
    expect(exportado).toEqual([
      'acceptWorkspacePayload',
      'buildEventFlow',
      'eventFlowSections',
      'eventTimeZoneLabel',
      'initialWorkspaceView',
      'isOperationalSection',
      'maskTaxId',
      'rejectWorkspaceLoad',
      'replaceWorkspaceEvent',
      'showsEntertainmentNavigation',
      'showsExhibitorNavigation',
      'showsScientificNavigation',
      'visibleWorkspacePayload',
      'workspaceShell',
    ]);
  });

  // ---- o que o produto JA condiciona: fixar para pegar regressao ----------

  test('entretenimento: perfil tem precedencia sobre o tipo informado', async () => {
    expect(showsEntertainmentNavigation('ENTERTAINMENT', null)).toBe(true);
    expect(showsEntertainmentNavigation('ENTERTAINMENT', 'Congresso')).toBe(true);
    // Perfil explicitamente nao-entretenimento vence o tipo, inclusive quando
    // o tipo diz o contrario. E a ordem certa: o perfil e a decisao curada.
    expect(showsEntertainmentNavigation('FAIR_EXHIBITION', 'Show ou entretenimento')).toBe(false);
    expect(showsEntertainmentNavigation('SCIENTIFIC_EVENT', 'Festival')).toBe(false);
    expect(showsEntertainmentNavigation('CORPORATE_TRAINING', 'Festival')).toBe(false);
    expect(showsEntertainmentNavigation('SOCIAL_COMMUNITY', 'Festival')).toBe(false);
  });

  test('entretenimento: sem perfil, decide pelo tipo', async () => {
    expect(showsEntertainmentNavigation(null, 'Show ou entretenimento')).toBe(true);
    expect(showsEntertainmentNavigation(null, 'Festival')).toBe(true);
    expect(showsEntertainmentNavigation(null, 'Congresso')).toBe(false);
    expect(showsEntertainmentNavigation(null, null)).toBe(false);
    expect(showsEntertainmentNavigation(undefined, undefined)).toBe(false);
  });

  test('feira: expositor depende de capability, nao de perfil', async () => {
    expect(showsExhibitorNavigation(['exhibitor'])).toBe(true);
    expect(showsExhibitorNavigation(['exhibitor', 'scientific_submission'])).toBe(true);
    expect(showsExhibitorNavigation([])).toBe(false);
    expect(showsExhibitorNavigation(null)).toBe(false);
    expect(showsExhibitorNavigation(undefined)).toBe(false);
    // FAIR_EXHIBITION sozinho NAO liga o modulo de expositor: quem liga e a
    // capability. Se isso mudar, este teste precisa mudar junto, de proposito.
    expect(showsExhibitorNavigation([])).toBe(false);
  });

  test('cientifico: perfil OU capability', async () => {
    expect(showsScientificNavigation('SCIENTIFIC_EVENT', [])).toBe(true);
    expect(showsScientificNavigation(null, ['scientific_submission'])).toBe(true);
    expect(showsScientificNavigation('ENTERTAINMENT', ['scientific_submission'])).toBe(true);
    expect(showsScientificNavigation(null, [])).toBe(false);
    expect(showsScientificNavigation(undefined, undefined)).toBe(false);
  });

  test('esportivo nao liga acessos e catracas pelo tipo', async ({}, testInfo) => {
    // Comportamento atual, fixado aqui para ficar visivel.
    expect(showsEntertainmentNavigation(null, 'Esportivo')).toBe(false);
    expect(showsEntertainmentNavigation(null, 'Evento esportivo')).toBe(false);
    testInfo.annotations.push({
      type: 'pergunta-de-produto',
      description: 'Evento esportivo com catraca na entrada hoje NAO recebe '
        + '"Acessos e catracas", porque a lista ENTERTAINMENT_EVENT_TYPES tem apenas '
        + '"Show ou entretenimento" e "Festival". Se a intencao for oferecer catraca '
        + 'para esportivo, falta um perfil ou uma capability para isso. '
        + 'Nao assumi resposta: o teste fixa o comportamento atual e falha se mudar '
        + 'sem decisao registrada.',
    });
  });

  test('secao operacional: superficie reduzida do operador', async () => {
    // workspaceShell cai para a casca 'operation' somente nestas secoes quando
    // a leitura de /event-wizard/:id falha — e o caminho do operador, que nao
    // le a configuracao do evento.
    for (const secao of ['check-in', 'show', 'registrations'] as EventFlowSection[]) {
      expect(isOperationalSection(secao), `${secao} precisa ser operacional`).toBe(true);
    }
    for (const secao of [
      'overview', 'reports', 'publication', 'communication', 'integrations',
      'commercial', 'form', 'benefits', 'exhibitors', 'caex',
      'transmission', 'certificates', 'financial', 'scientific',
    ] as EventFlowSection[]) {
      expect(isOperationalSection(secao), `${secao} nao deve dar casca de operador`).toBe(false);
    }
  });

  // ---- o requisito da CL-04 que o produto ainda NAO cumpre ----------------

  test('presencial nao deve oferecer Transmissao @gate-permissao', async ({}, testInfo) => {
    const porFormato = (await nomesExportados()).filter((nome) => /transmiss|format/iu.test(nome));

    testInfo.annotations.push({
      type: 'lacuna-confirmada',
      description: 'Tres camadas, dono Codex via #627: (1) event-workspace.tsx '
        + 'renderiza o <Link> de Transmissao sem guarda, enquanto isShow, '
        + 'hasExhibitors e isScientific condicionam os vizinhos; '
        + '(2) WorkspacePayload carrega eventType e capabilities, mas nao format, '
        + 'portanto a condicao nao e escrevivel no cliente sem mudar o contrato; '
        + '(3) apps/api/src/transmission-policy.ts valida kind, title e url, e nao '
        + 'o formato, logo nao ha protecao de acesso direto.',
    });

    expect(
      porFormato,
      'Nao existe em event-flow.ts nenhuma funcao que decida a visibilidade de '
      + 'Transmissao por formato do evento. As demais secoes condicionadas tem a sua: '
      + 'showsEntertainmentNavigation, showsExhibitorNavigation, '
      + 'showsScientificNavigation. Falta a quarta — algo como '
      + 'showsTransmissionNavigation(format) — e, antes dela, o campo format no '
      + 'payload de /event-wizard/:id.\n\n'
      + 'Esta falha e a evidencia do requisito ausente, nao defeito do teste. '
      + 'NAO a conserte afrouxando a assercao: ela deve permanecer vermelha ate o '
      + '#627 corrigir as tres camadas.',
    ).not.toEqual([]);
  });
});
