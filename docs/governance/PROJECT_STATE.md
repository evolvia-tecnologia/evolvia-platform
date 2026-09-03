---
snapshot_at_utc: 2026-08-29T15:07:41Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha: 961be8471c5eeb594016b507e2e191e922ae0ada
active_phase: "Item 1 — Divulgação do evento"
gate_state: "Gate 1 — No-Go temporário"
next_phase: "Item 2 — Inscrição, bloqueado pelo Gate 1"
---

# Estado oficial do projeto

## Resumo executivo

- `main` e produção permanecem fora do ciclo atual.
- A fonte integrada é `develop@961be8471c5eeb594016b507e2e191e922ae0ada`.
- O item 1 — Divulgação está integrado e implantado em homologação até esse SHA, mas o Gate 1 continua em **No-Go temporário**.
- O deploy #411 aprovou aplicação, banco, migrations, integração, idempotência, API/Web ARM64, publicação, readiness, HTTPS 200 e HTTP→HTTPS 308.
- A mesma execução falhou corretamente na prova defensiva pública: o Nginx ativo não aplica os cabeçalhos versionados e ainda expõe sua versão. Issues #68 e #108 concentram a intervenção externa necessária.
- A matriz humana ainda exige evento publicado autorizado, leitor de tela, mobile/tablet, zoom e reflow, teclado/foco, alternativas reais de mídia e Go explícito do Product Owner.
- Itens 2 a 11 permanecem bloqueados; nenhuma fase posterior foi ativada.

Este snapshot registra fatos vivos. Conversas e memória proposta do PR #81 orientam produto, mas não comprovam implementação, CI, merge ou deploy.

## Sequência canônica 1→11

| Nº | Capability/jornada | Estado verificável | Predecessor/Gate | Evidência e frente viva | Próxima entrega permitida |
| ---: | --- | --- | --- | --- | --- |
| 1 | Divulgação do evento | **Aberta — No-Go temporário** | Gate 1 | issues #32/#56; `develop@961be847`; PRs #85/#121/#122 | revisar/integrar cortes aprovados, ativar Nginx versionado e concluir matriz humana |
| 2 | Inscrição | **Bloqueada** | Go do Gate 1 | issue #45; decisão EVO-006 | iniciar somente após Go explícito |
| 3 | Área reservada do inscrito | **Bloqueada** | item 2 | mapa #114 | aguardar inscrição canônica |
| 4 | Configuração de trabalhos científicos | **Bloqueada** | Gates anteriores + perfil/capability | issues #15/#26; PR #28 preservado | não expor rota/CTA antes da liberação |
| 5 | Submissão pelo autor | **Bloqueada** | item 4 + identidade externa | issues #15/#26; PR #27 preservado | aguardar configuração científica |
| 6 | Avaliação científica | **Bloqueada** | item 5 | issue #17 | aguardar submissão |
| 7 | Decisão científica | **Bloqueada** | item 6 | issue #22; PR #23 preservado | aguardar avaliação |
| 8 | Pós-aprovação — arquivo final/ePoster | **Bloqueada** | item 7 | mapa #114 | aguardar decisão |
| 9 | Programação científica definitiva | **Bloqueada** | itens 4–8 conforme capability | mapa #114 | aguardar cadeia científica |
| 10 | Operação do evento | **Bloqueada** | jornadas anteriores aplicáveis | mapa #114 | aguardar credenciamento/acesso autorizados |
| 11 | Pós-evento | **Bloqueada** | item 10 | mapa #114 | aguardar operação concluída |

Fases 4–9 podem não se aplicar a todos os perfis, mas isso não permite renumerar ou pular dependências. O painel pode mostrá-las apenas como mapa informativo bloqueado, sem CTA ou rota fictícia.

## Item 1 — critérios comprovados

Integrado no `develop`:

- Wizard e configuração inicial self-service;
- conteúdo editorial, identidade visual e mídia pública segura;
- preview autenticado fiel à projeção pública;
- publicação explícita, ACL deny-by-default, concorrência, idempotência e auditoria sanitizada;
- timezone IANA canônico e datas determinísticas;
- catálogo, página pública, SEO e smoke renderizado;
- EVA contextual pública e do organizador, determinística e sem mutações;
- skip link, foco, alvos de 44 px, contraste AA, reflow e movimento reduzido;
- mapa informativo dos Gates e design system nas superfícies integradas.

Em revisão, ainda não integrados:

| PR | HEAD/CI | Estado real | Escopo |
| --- | --- | --- | --- |
| #121 | `0a95eea1` / CI #416 aprovado | Draft, mesclável, 3 à frente e 0 atrás | Dashboard, Wizard e autenticação no design system; remoção de CSS global legado |
| #122 | `57eaa5ba` / CI #418 aprovado | Ready, mesclável, 2 à frente e 0 atrás | perfil, tipo e público estimado nas superfícies públicas e EVA |
| #99 | `85328060` / CI #376 aprovado | Ready, 1 à frente e 35 atrás | contrato seguro de locales; exige sincronização antes de qualquer integração |
| #113 | `db7af4fb` / CI #412 aprovado | Draft, mesclável, 4 à frente e 0 atrás | fundação documental de integrações, sem antecipar conectores |

CI aprovado em branch não equivale a integração ou implantação.

## Bloqueios do Gate 1

### Externo — Nginx ativo

O script versionado está integrado, mas o gateway restrito de deploy não pode executá-lo como administrador. O responsável autorizado precisa aplicar uma única vez o bootstrap registrado na issue #108, validar `nginx -t` e recarregar o serviço. Não ampliar a chave SSH e não usar GitHub Actions como ponte.

Critérios públicos pendentes:

- HSTS;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- `X-Frame-Options: SAMEORIGIN`;
- ocultação da versão do Nginx.

### Humano — WCAG e aceite do produto

Executar no SHA integrado e implantado:

- evento de teste autorizado em estado `PUBLISHED`;
- página `/evento/[slug]` com mídias e textos reais;
- desktop 1366×768, tablet e celular;
- zoom/reflow a 200% e 400%;
- teclado completo, ordem de foco e foco visível;
- leitor de tela;
- texto alternativo e caráter decorativo das mídias;
- datas consistentes entre navegadores/fusos;
- Go explícito do Product Owner.

Automação fortalece a cobertura, mas não substitui essa matriz.

## Autenticação preservada

O PR #72, HEAD `06f0d3b4`, contém recuperação de senha e confirmação real de e-mail com anti-enumeração, tokens opacos em hash, uso único, rate limit, auditoria sanitizada e migrations expansivas. Ele permanece Draft e não mesclável no estado atual.

Bloqueio real:

- configurar endpoint/token/remetente do gateway fora do Git;
- definir URL pública HTTPS;
- implantar em ambiente autorizado;
- comprovar recebimento em caixa de teste;
- repetir a matriz visual e acessível no SHA implantado.

Não inventar prova de envio e não registrar e-mail, token, hash ou origem.

## EVA e memória do produto

A EVA continua inteligência operacional transversal:

- contexto limitado por ator, organização, evento, capability, finalidade e estado;
- sugestão separada de execução;
- ações sensíveis somente por APIs oficiais, confirmação explícita, idempotência e auditoria sanitizada;
- nenhuma exposição cross-tenant, roadmap interno, benchmark bruto, código, arquitetura, prompts, defesas, credenciais, custos ou preço restrito;
- fallback determinístico e recusa útil.

O PR #81 propõe `PRODUCT_MEMORY.md` e salvaguardas adicionais. Enquanto não integrado, deve ser lido como alinhamento proposto, não como estado do `develop`.

## Benchmark aplicado

A issue #36 permanece o inventário vivo. Para o item 1, os padrões úteis aplicados são descoberta clara, identidade do evento, conteúdo público confiável, consistência visual, suporte contextual e acessibilidade. EVEN3, Sympla, MITTE e demais referências canônicas orientam problemas e capacidades; nenhuma interface, texto, ativo, código ou fluxo proprietário é copiado.

Oportunidades de inscrição, pagamentos, científico, operação, integrações e pós-evento permanecem registradas na fase correta e não autorizam antecipação.

## Próximos passos elegíveis

1. revisar os PRs #121 e #122;
2. sincronizar o PR #99 com `develop` antes de qualquer integração;
3. aplicar externamente o Nginx versionado conforme #108;
4. implantar os SHAs integrados autorizados e concluir a matriz humana;
5. registrar o Go/No-Go do Gate 1;
6. somente após Go explícito considerar o item 2 — Inscrição.

## Regra de atualização

Atualizar este arquivo somente após merge, mudança de Gate, decisão do Product Owner ou bloqueio novo comprovado. Sempre registrar SHA, CI, integração e implantação separadamente.
