# Gate 1 — roteiro e evidências do Go/No-Go

> Estado em 27/08/2026: **Gate aberto / No-Go temporário** até concluir as
> validações humanas listadas neste documento. Isso não representa reprovação
> da entrega técnica e não autoriza iniciar a Fase 2.

## Escopo desta consolidação

Este documento fixa a evidência pós-integração da correção WCAG do PR #84 e
transforma as verificações restantes em um roteiro reproduzível. Ele não altera
código, dados, configuração, migration, ambiente, `main` ou produção.

## Linha de base exata

- branch de integração: `develop`;
- SHA integrado e implantado:
  `94c51e9ee610ab17c69791a81d4c22a40bcd15ca`;
- PR integrado: #84;
- HEAD aprovado do PR:
  `d314cba737f2fede40fc23a19f6ad4b58c832712`;
- CI do PR: execução
  [#338](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/33013349181);
- CI/deploy do merge: execução
  [#339](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/33029430593);
- ambiente: `https://homologacao.evolviatecnologia.com`.

A comparação do GitHub entre o SHA implantado e `develop` retornou
`identical`, zero commit à frente e zero atrás.

## Evidência automatizada no SHA implantado

A execução #339 concluiu com sucesso:

- qualidade, tipos, auditoria de segurança e builds;
- testes unitários aplicáveis;
- migration e integração em ambiente descartável;
- segunda execução de migration sem pendência, comprovando idempotência;
- imagens API e Web para `linux/arm64`;
- Gate consolidado ARM64;
- publicação da homologação com rollback;
- prova pública do domínio e HTTPS;
- status verificável `evolvia/homologacao: success` no próprio SHA.

O lote do PR #84 acrescentou três regressões Web, totalizando sete testes Web
no CI do PR:

- skip link e destino principal focável nas três rotas públicas;
- alvos de navegação com baseline de 44 px;
- contraste mínimo WCAG AA do token de texto secundário.

A mudança é exclusivamente Web. Ela não altera persistência, API, ACL,
organização, evento, PII, EVA ou transições de publicação. Os Gates de
migration, isolamento e segurança foram repetidos no push integrado para
detectar regressão transversal, não porque exista migration nova.

## Regressão pública repetida após o deploy

Verificação externa em 27/08/2026, após a execução #339:

- `GET https://homologacao.evolviatecnologia.com/`: HTTP 200;
- `GET https://homologacao.evolviatecnologia.com/eventos`: HTTP 200;
- `GET http://homologacao.evolviatecnologia.com/`: redirecionamento 308 para
  HTTPS;
- `GET /api/health`: `status=ok`, serviço `evolvia-api`, versão
  `0.2.0-alpha.3`;
- home e catálogo expõem “Pular para o conteúdo principal” e
  `main#main-content`;
- viewport `1363 × 936`, sem overflow horizontal;
- primeiro `Tab`: skip link visível a `top=12px`, altura de 44 px e outline
  azul sólido de 3 px;
- `Enter` no skip link: foco transferido a `main#main-content`;
- tokens implantados: `--muted: #5d6f87` e `--bg: #f3f6fb`, razão
  automatizada de 4,74:1;
- catálogo íntegro, mas com `0 eventos encontrados`.

## Bloqueios reais para o Go

A terceira superfície, `/evento/[slug]`, ainda não pode ser validada em
homologação porque não existe evento `PUBLISHED`. Não criar publicação
artificial nem usar rota privada como prova pública.

Também permanecem obrigatórios testes humanos, porque automação e inspeção de
DOM não substituem tecnologia assistiva real:

1. página pública de um evento efetivamente publicado;
2. leitor de tela no fluxo crítico;
3. zoom e reflow a 200% e 400%;
4. celular e tablet, incluindo orientação e alvos de toque;
5. teclado e foco do fluxo completo, não somente o skip link;
6. verificação de conteúdo alternativo das imagens do evento publicado.

Enquanto qualquer item falhar ou não tiver evidência, a decisão continua
**No-Go temporário** e a Fase 2 permanece bloqueada.

## Roteiro humano reproduzível

### Preparação segura

- confirmar que a homologação continua em
  `develop@94c51e9ee610ab17c69791a81d4c22a40bcd15ca`;
- escolher um evento de teste autorizado;
- completar o fluxo canônico
  `SETUP → HOMOLOGATION → READY_TO_PUBLISH → PUBLISHED`;
- exigir confirmação humana explícita no passo final;
- não reutilizar evento real de cliente e não inserir PII desnecessária;
- registrar slug e horário, mas nunca token, credencial ou dado sensível.

### Matriz de validação

| Superfície | Teste | Aceite |
| --- | --- | --- |
| Home | teclado completo | ordem previsível, foco sempre visível e sem armadilha |
| Catálogo | teclado, filtros e paginação | rótulos compreensíveis, estado anunciado e operação sem mouse |
| Evento publicado | teclado e leitor de tela | landmarks/títulos coerentes, alt text correto e conteúdo útil anunciado |
| Todas | zoom 200% e 400% | sem perda de conteúdo/ação e sem rolagem em duas dimensões no conteúdo principal |
| Todas | celular e tablet | sem corte, sobreposição ou alvo impraticável |
| Todas | contraste/estados | texto AA e nenhum estado comunicado apenas por cor |
| Todas | movimento | preferência de movimento reduzido respeitada quando aplicável |

### Evidência mínima a registrar

- SHA e URL da execução de deploy;
- slug público testado;
- navegador, sistema, viewport e leitor de tela;
- resultado de cada linha da matriz;
- captura somente quando não contiver dado sensível;
- defeito com passos de reprodução, resultado esperado e observado;
- decisão final Go/No-Go e responsável humano.

## Critério de encerramento

O Gate 1 só pode ser encerrado quando:

- todos os checks técnicos permanecerem verdes no SHA implantado;
- a matriz humana estiver integralmente aprovada;
- a página pública real estiver comprovada;
- não houver defeito bloqueador aberto;
- o Product Owner registrar o Go explícito.

Até lá:

- `main` e produção permanecem inalteradas;
- nenhuma migration destrutiva é admitida;
- a Fase 2 — Inscrição não começa;
- ciclos técnicos podem fortalecer testes, diagnóstico e governança sem inventar
  conclusão.

## Rollback

Este lote é exclusivamente documental. O rollback consiste em reverter seu
commit. Nenhum rollback de aplicação, banco ou infraestrutura é necessário.
