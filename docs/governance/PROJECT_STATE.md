---
snapshot_at_utc: 2026-08-27T04:10:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
stable_sha: 05e8d6aabbd33e1740c1bd3511def8ec2c4838cf
stable_version: 0.1.1
integration_branch: develop
integration_sha: 94c51e9ee610ab17c69791a81d4c22a40bcd15ca
development_version: 0.2.0-alpha.3
active_phase: "Fase 1 — Divulgação do Evento"
active_work: "Validação humana final e Go/No-Go da Fase 1"
active_pr: 85
next_gate: "Página real publicada, leitor de tela, mobile e zoom/reflow"
next_phase: "Fase 2 — Inscrição, bloqueada pelo Gate anterior"
---

# Estado oficial do projeto

## Resumo executivo

- Produção permanece na versão estável `v0.1.1`. Este ciclo não alterou
  `main` nem produção.
- A integração está em
  `develop@94c51e9ee610ab17c69791a81d4c22a40bcd15ca`.
- O PR #82 foi integrado pelo merge `2bf6ed0d` e consolidou a jornada pública
  da Fase 1: editor, publicação explícita, descoberta, página pública, EVA,
  timezone, SEO, identidade visual e mídia segura.
- O PR #84 corrigiu as três falhas objetivas encontradas na primeira validação
  pública: skip link, área ativa de navegação e contraste. Seu HEAD
  `d314cba7` foi aprovado no CI #338 e integrado pelo merge `94c51e9e`.
- O push natural [#339](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/33029430593)
  aprovou qualidade, segurança, builds, migration/integração, idempotência,
  API/Web ARM64, deploy com rollback, HTTPS e status verificável no SHA.
- A comparação entre o SHA implantado e `develop` retornou `identical`,
  zero commit à frente e zero atrás.
- A issue #68 foi encerrada: HTTPS 200, HTTP→HTTPS 308, healthcheck público e
  `evolvia/homologacao: success` estão comprovados.
- O Gate 1 permanece aberto. A homologação contém zero eventos `PUBLISHED`;
  por isso a terceira superfície pública e os testes humanos de leitor de tela,
  mobile e zoom/reflow ainda não possuem evidência.
- O PR #85 consolida as provas e o roteiro final sem alterar código ou antecipar
  a Fase 2.

## Linha ativa

| Ordem | Entrega | Estado verificável | Evidência |
| ---: | --- | --- | --- |
| 1 | Fundação, editor e navegação da Divulgação | integrada | issue #32 e histórico de `develop` |
| 2 | Publicação explícita, ACL, auditoria e concorrência | integrada | issues #32/#56 e PR #82 |
| 3 | Mídia pública segura, SEO e identidade visual | integrada | issues #55/#57 e PR #82 |
| 4 | EVA, descoberta e consistência temporal | integrada | PR #82, CI #336 e deploy #32994262318 |
| 5 | Correções WCAG da validação pública | integrada e implantada | PR #84, CI #338 e push #339 |
| 6 | HTTPS público da homologação | concluído | issue #68 e push #339 |
| 7 | Matriz humana final do Gate 1 | aberto | PR #85 e issue #32 |
| 8 | Fase 2 — Inscrição | bloqueada | decisão EVO-006 |

## Homologação

A homologação executa exatamente `develop@94c51e9e`.

Evidência técnica da execução #339:

- qualidade, tipos, auditoria de dependências e builds: aprovados;
- testes unitários aplicáveis: aprovados;
- migration e integração em ambiente descartável: aprovadas;
- segunda execução de migration: sem pendências;
- imagens finais API e Web `linux/arm64`: aprovadas;
- publicação SSH com rollback: aprovada;
- domínio público e HTTPS: aprovados;
- status `evolvia/homologacao: success` publicado no SHA.

Regressão pública repetida em 27/08/2026:

- home e catálogo: HTTP 200 em HTTPS;
- redirecionamento HTTP: 308;
- `/api/health`: `status=ok`, versão `0.2.0-alpha.3`;
- viewport `1363 × 936`, sem overflow horizontal;
- skip link visível no primeiro `Tab`, altura 44 px e foco de 3 px;
- `Enter` transfere o foco a `main#main-content`;
- tokens `#5d6f87` sobre `#f3f6fb`, razão automatizada 4,74:1;
- catálogo: zero eventos publicados.

## Gate atual

Critérios técnicos comprovados:

- qualidade, segurança e builds Web/API;
- regressões e smokes aplicáveis;
- migration descartável, integração e idempotência;
- compatibilidade Ubuntu/ARM64;
- ACL deny-by-default, isolamento `organizationId + eventId` e DTO mínimo;
- publicação explícita, preview, auditoria e revisão otimista;
- deploy do SHA exato;
- HTTPS, redirecionamento e healthcheck públicos;
- correções automáticas de contraste, skip link e baseline de alvos.

Critérios ainda não comprovados:

1. página `/evento/[slug]` com evento de teste realmente `PUBLISHED`;
2. leitor de tela no fluxo público crítico;
3. zoom/reflow a 200% e 400%;
4. celular e tablet;
5. teclado e foco do fluxo completo;
6. texto alternativo das mídias do evento publicado;
7. Go explícito do Product Owner.

A ausência de evidência mantém o estado **No-Go temporário**. Não é permitido
declarar o Gate concluído nem iniciar a Fase 2.

## Governança e linhas preservadas

- O PR #85 é documental e parte do SHA atual de `develop`.
- O PR #81 preserva memória de produto/EVA, mas parte de base anterior; deve
  sincronizar uma única vez e repetir CI antes de qualquer decisão.
- O PR #72 permanece Draft e depende de gateway transacional real, configuração
  de ambiente e testes humanos; não compõe o encerramento deste Gate.
- O PR #63 depende de decisão administrativa sobre Dependabot na branch padrão.
- Os PRs científicos #27, #28 e #23 permanecem preservados e fora da linha
  ativa.
- `main` e `develop` têm histórico divergente: `develop` está 364 commits
  à frente e 2 atrás. Os dois commits exclusivos de `main` são um placeholder
  e sua reversão. Não fundir ou reescrever histórico durante o Gate; reconciliar
  de forma controlada somente antes de futura promoção.

## Próximos passos elegíveis

1. concluir o CI e a revisão do PR #85 no HEAD exato;
2. durante os testes do dia, publicar somente evento de teste autorizado pelo
   fluxo canônico e executar a matriz do documento
   `GATE1_GO_NO_GO.md`;
3. se surgir defeito, abrir lote isolado na Fase 1 e repetir os Gates aplicáveis;
4. se toda a matriz passar, registrar o Go explícito e consolidar o estado;
5. avaliar a Fase 2 somente depois do encerramento verificável do Gate 1.

## Como atualizar este arquivo

O Orquestrador atualiza este snapshot após merge, mudança de Gate, decisão do
Product Owner ou bloqueio relevante. Use fatos verificáveis; não use memória,
percentuais estimados ou CI de outro HEAD como prova.
