import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Contrato do perfil Corrida — issue #624 (CLAUDE-DEV-01), requisitos da #620.
 *
 * O que este arquivo é, e o que ele não é
 * ---------------------------------------
 * A #624 pede testes CONTRATUAIS que demonstrem os gaps, e proíbe
 * explicitamente "inserir testes para funcionalidades ainda inexistentes como
 * se fossem sucesso". Então nada aqui afirma conformidade de algo ausente: o
 * que não existe sai como PENDENTE com a dependência nomeada, e o inventário
 * da lacuna é impresso para aparecer no CI mesmo quando os casos são pulados.
 *
 * Por que NÃO sigo a convenção dos testes vizinhos
 * ------------------------------------------------
 * A maioria dos `apps/web/tests/*.test.mjs` faz `readFileSync` do componente e
 * `assert.match` com expressão regular contra o TEXTO-FONTE. Isso é exatamente
 * a causa estrutural que o PR #625 documenta: um teste que casa o código-fonte
 * não exercita o comportamento, então passa quando a lógica muda e o texto
 * continua parecido -- e reprova quando o texto muda e a lógica continua certa.
 *
 * O Node 22 deste repositório importa `.ts` nativamente, sem flag (medido na
 * 22.23.4). Então aqui o módulo é IMPORTADO e aferido por comportamento. Isso
 * está disponível para toda a suíte e não exige ferramenta nova.
 *
 * Escopo e isolamento
 * -------------------
 * Arquivo novo. Não toca `apps/web/components/public-sports-landing.tsx` nem
 * `apps/web/lib/sports-public-profile.ts`, que são do PR #621 (Codex), nem
 * `.github/workflows/`. Ver #624.
 */

const DEPENDE = 'Depende do PR #621 (codex/sports-public-profile-foundation-20261101), '
  + 'que traz o contrato de modalidades esportivas. PENDENTE declarado — '
  + 'não é aprovação nem reprovação.';

/** Carrega a superfície esportiva se ela existir. Ausência não é erro aqui. */
async function superficieEsportiva() {
  try {
    return await import('../lib/sports-public-profile.ts');
  } catch {
    return null;
  }
}

test('premissa: o perfil Corrida é oferecido pelo catálogo canônico', async () => {
  const { findEventProfileOption, findEventProfileGroup, isKnownEventType } =
    await import('../lib/event-profile-catalog.ts');

  const corrida = findEventProfileOption('Corrida');
  assert.ok(corrida,
    'o perfil "Corrida" precisa estar no catálogo canônico: ele é a fonte única '
    + 'do Wizard, da Home e da EVA. Sem ele, o resto deste contrato não se aplica.');
  assert.equal(corrida.title, 'Corrida');
  assert.equal(findEventProfileGroup('Corrida')?.id, 'community',
    'Corrida pertence à família "Comunidades, causas e esportes"');
  assert.equal(isKnownEventType('Corrida'), true);

  // Contraprova: o catálogo tem de recusar o que não está nele. Sem isto,
  // `isKnownEventType` poderia devolver true para tudo e o caso acima passaria
  // por motivo errado.
  assert.equal(isKnownEventType('Maratona'), false,
    'um tipo inexistente não pode ser aceito; se for, a checagem não checa nada');
  assert.equal(isKnownEventType(42), false, 'entrada não-string não pode ser aceita');
  assert.equal(findEventProfileOption(null), undefined);
});

test('inventário da lacuna: o que a #620 exige e a base não tem', async () => {
  const superficie = await superficieEsportiva();

  /**
   * Os cinco contratos da #624, com o que CADA UM vai asserir quando a
   * superfície chegar. Escrever isso agora é o ponto do teste contratual: no
   * dia em que o #621 integrar, a lista vira asserção sem ninguém ter de
   * relembrar o requisito.
   */
  const contratos = [
    ['modalidade', 'tipo (corrida/caminhada/trail), distância, categoria, lote, '
      + 'faixa de idade, gênero quando necessário, PCD, guia, pelotão, vagas e limites'],
    ['dados do atleta', 'nome completo, nome de preferência editável, data de '
      + 'nascimento, documento/passaporte, e-mail, telefone internacional, '
      + 'cidade/UF/país e categoria; condicionais do organizador; menor de idade '
      + 'com responsável legal; dado sensível NÃO obrigatório por padrão'],
    ['tamanho de camiseta', 'variantes por kit, kits com e sem camiseta, '
      + 'compra extra e troca autorizada com inventário'],
    ['validação de estoque', 'reserva atômica com expiração e idempotência; '
      + 'sem venda acima do estoque e sem confirmação dupla'],
    ['acessibilidade pública', 'página pública em WCAG 2.2 AA: contraste, '
      + 'alvo de toque, reflow em 320 e 390 px, foco visível e bypass de blocos'],
  ];

  if (!superficie) {
    const linhas = contratos.map(([nome, oque]) => `    - ${nome}: ${oque}`).join('\n');
    console.log(
      '\n  LACUNA: a superfície esportiva de apps/web/lib/sports-public-profile.ts\n'
      + '  não existe nesta árvore. Os cinco contratos abaixo estão SEM COBERTURA:\n'
      + `${linhas}\n`
      + `  ${DEPENDE}\n`,
    );
    // Afirma o FATO medido: há cinco contratos e nenhum tem cobertura. Não
    // afirma conformidade de nada.
    //
    // Este caso NÃO é a rede de segurança para "alguém integrou e esqueceu
    // deste arquivo" -- uma asserção aqui dentro deste ramo seria tautológica,
    // porque o ramo só roda quando a superfície está ausente. Quem cobra a
    // atualização são os cinco casos de contrato abaixo, que REPROVAM quando a
    // superfície aparece. Medido nas duas direções.
    assert.equal(contratos.length, 5,
      'os cinco contratos da #624 precisam estar listados; se um saiu da lista, '
      + 'ele saiu da cobertura sem ninguém decidir isso');
    return;
  }

  console.log('\n  A superfície esportiva EXISTE nesta árvore. Os cinco casos de\n'
    + '  contrato abaixo passam a reprovar até serem escritos — de propósito.\n');
});

for (const [nome, descricao] of [
  ['modalidade', 'tipo, distância, categoria, lote, faixa de idade, gênero, PCD, guia, pelotão, vagas'],
  ['dados do atleta', 'campos base, condicionais, menor com responsável e minimização de dado sensível'],
  ['tamanho de camiseta', 'variantes por kit, kit sem camiseta, compra extra e troca auditada'],
  ['validação de estoque', 'reserva atômica, expiração, idempotência, sem venda acima do estoque'],
  ['acessibilidade pública', 'WCAG 2.2 AA na página pública da prova'],
]) {
  test(`contrato de ${nome}`, async (t) => {
    const superficie = await superficieEsportiva();
    if (!superficie) {
      t.skip(`${nome}: ${descricao}. ${DEPENDE}`);
      return;
    }
    assert.fail(
      `a superfície esportiva existe, mas o contrato de ${nome} ainda não foi `
      + `escrito. Asserir: ${descricao}. Não deixe passar como verde.`,
    );
  });
}
