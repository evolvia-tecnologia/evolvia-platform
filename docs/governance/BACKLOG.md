# Backlog e ordem de execução — Modo Lançamento

## Reconciliação vigente — 20/10/2026

Implementação **87,0%**; conclusão comprovada **65,0%**; **80/93** unidades integradas; **0/11 Gates encerrados**. Baseline v1 preservada.

Portal externo do expositor/prestador e CAEX #537 integrados em `develop@badd9ff097c7b3856a2f4141d39a5fccc19065d5`, candidato `ab4c0b7ae990cea4c99a32f15e0a873c28408204`. [CI #1670](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39373910161) aprovado: qualidade, API/Web, ARM64 API/Web, PostgreSQL/fluxo funcional e migration idempotente. 13/13 threads resolvidas; Gemini sem novos bloqueios no candidato. **G10.13 recebe somente I/T**. [Run #1671](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/39375902865) do merge em execução na conferência; publicação/readiness e jornadas autenticadas ainda sem comprovação.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 100,0% | 71,9% | 23/32 |
| 5 | Submissão pelo autor | 75,0% | 56,3% | 18/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 92,3% | 67,3% | 35/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta deste corte: **+0,7 p.p. implementação / +0,3 p.p. conclusão**. Não atribuir deploy/aceite por CI de PR. Portal: `/evento/{slug}/expositor`; CAEX: `/eventos/{id}/painel/caex`. Validar duas organizações/eventos, conta/representante/e-mail não confirmado, cotas/prazos, mobile/desktop, teclado/leitor e impressão real. Rollback: revert do squash, preservando tabela de visitas e dados.

Coordenação: Composer local #568 (reconciliar com a base nova e fechar CI/threads); Cursor Cloud #169/#174 (sete rotas × quatro viewports); Codex acompanha publicação e homologação; científico #567 retomado no SHA0f7eafad com CI1674; #576 permanece dependente. O billing do Actions foi liberado após ajuste do usuário. Sem Go/No-Go de produção; Gates, e-mail real, Asaas sandbox, acessibilidade humana e hardware continuam pendentes. Listagem histórica de PRs abaixo não representa inventário vivo.


## Snapshot histórico — 11/10/2026

Implementação **86,3%**; conclusão comprovada **64,7%**; **79/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte integrada `develop@f1a91f093d2bbb8fdbbf2b999c3d52feab627748`; HEAD #565 `77fdcfad5b7c982f0124d7bf06dc8a669a7b60d7`, [CI 38150531939](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38150531939) integralmente verde e revisão Gemini sem achados abertos. A publicação desse merge ainda não foi comprovada; a última fonte publicada comprovada permanece `3c8a625e` no run `38118548732`/job `114410043257`. Não há novo aceite funcional.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 100,0% | 71,9% | 23/32 |
| 5 | Submissão pelo autor | 75,0% | 56,3% | 18/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta desde snapshot `38bfc29e`: **+7,6 p.p. implementação / +5,4 p.p. conclusão**. #565/G4.8 acrescenta somente I/T neste estado: janelas e blocos por modalidade, round-trip de correção, validação unit-aware e preservação do PDF. D depende do SHA exato publicado; F depende de ensaio autenticado. A meta de implementação foi superada; a meta >65,5% de conclusão comprovada ainda não foi atingida.

- #565: merge `f1a91f09`, HEAD `77fdcfad`, CI `38150531939`; publicação do merge pendente de evidência.
- Gates seguem abertos. Nginx/alias, ensaios com duas contas/orgs/eventos, Asaas sandbox, e-mail, WCAG humana e hardware preservam pendências. `main`, produção, infra e secrets sem alteração.

## Snapshot integrado anterior — 11/10/2026

Implementação **85,1%**; conclusão comprovada **64,1%**; **78/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Fonte integrada e publicada `develop@3c8a625e95415b99b615c681caffb5754c52178d`; CI do HEAD #521 `6c2edc471e360db063cf898095fda659a6900ed1` [38117629140](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38117629140) verde. O job [114410043257](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/38118548732/job/114410043257) comprovou Commit e readiness de API/PostgreSQL em 11/10/2026; o gate público falhou depois por Nginx/alias. Não há novo aceite funcional.

| Gate | Escopo | Implementação | Conclusão I/T/D/F | Pontos |
| --- | --- | ---: | ---: | ---: |
| 1 | Divulgação do evento | 100,0% | 78,1% | 25/32 |
| 2 | Inscrição | 64,3% | 48,2% | 27/56 |
| 3 | Área reservada do inscrito | 87,5% | 65,6% | 21/32 |
| 4 | Configuração científica | 87,5% | 65,6% | 21/32 |
| 5 | Submissão pelo autor | 75,0% | 56,3% | 18/32 |
| 6 | Avaliação científica | 87,5% | 65,6% | 21/32 |
| 7 | Decisão científica | 83,3% | 62,5% | 15/24 |
| 8 | Arquivo final, pôster e ePoster | 100,0% | 75,0% | 18/24 |
| 9 | Programação científica | 100,0% | 75,0% | 24/32 |
| 10 | Operação do evento | 84,6% | 63,5% | 33/52 |
| 11 | Pós-evento | 66,7% | 50,0% | 12/24 |

Delta desde snapshot 38bfc29e: **+6,4 p.p. implementação / +4,8 p.p. conclusão**. #497/G5.6, #517/G6.7, #521/G9.7, #525/G11.5 e #522/G11.3 estão integrados, testados e publicados; F permanece pendente. A meta de implementação foi superada; a meta >65,5% de conclusão comprovada ainda não foi atingida.

- #497: merge `041f83b4`, CI `38001809029`; job `114064573887` comprovou Commit e readiness em 09/10.
- #525: merge `db766978`, CI `38000947075`; job `114060762594` comprovou Commit e readiness em 09/10.
- #522: merge `c18fb511`, HEAD `66d82138`; CI `38005789849` verde e publicação `38111481265` comprovada antes do gate público.
- #517: merge `7963de77`, HEAD `24c901f7`; CI `38114993838` verde, sem threads abertas. Retomada transacional preserva banca/notas e expõe histórico/rubrica versionada. Publicação `38115506278` comprovada às 05:53 UTC.
- #521: merge `3c8a625e`, HEAD `6c2edc47`; CI `38117629140` verde, incluindo PostgreSQL/migration, hidratação, acessibilidade runtime e ARM64. Vínculo transacional de trabalho aceito à sessão, auditoria e projeção pública sem PII; publicação `38118548732` comprovada às 06:49 UTC.
- Gates seguem abertos. Nginx/alias, ensaios com duas contas/orgs/eventos, Asaas sandbox, e-mail, WCAG humana e hardware preservam pendências. `main`, produção, infra e secrets sem alteração.


GitHub Issues contém as unidades de trabalho. O estado e os percentuais
auditáveis estão em [PROJECT_STATE.md](PROJECT_STATE.md). Este quadro prioriza
o `develop` vivo; `main` e produção aguardam Go/No-Go próprio.

## Prioridade vigente — 09/10/2026

Implementação **78,7%**; conclusão comprovada **59,3%**; **73/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

Clone seguro #470 integrado em `develop@42256f46` e publicado no conjunto `develop@38bfc29e`; ensaio negativo cross-org/evento e aceite seguem pendentes. Central administrativa do expositor integrada (#490), com navegação refinada por #520/#527; portal/CAEX permanece no #537/#538. G10.13 fica parcial. G5.6 segue parcial com UI PDF no draft #497. #494/#498, #491, #471, #480 e #368 não pontuam enquanto não integrados. Asaas sandbox, entrega real de e-mail, WCAG humana e hardware continuam pendentes. `main` e produção sem promoção.

1. Priorizar jornadas e correções dos Gates; HTTPS/alias adiado pelo Product Owner até 95%, preservando No-Go e checks.
2. Provar em sessão autenticada o fluxo administrativo do expositor #486 (320/390/desktop/zoom, teclado/leitor e negativos cross-org/evento); concluir identidade externa #408 sem recriar a central #490 nem os refinamentos #520/#527.
3. Revisar PDF inicial #497, acessibilidade #494/#498, compra múltipla #471, reembolso #491 e kits #480 no HEAD vivo; cortes concorrentes precisam de handoff.
4. Ensaiar fila #468 no SHA implantado, manter limite de reentrada e entrega de e-mail como pendências explícitas.
5. Ensaiar o clone #470 com duas organizações/eventos; concluir ACL #368, blocos/janelas, rascunho, rubrica/reabertura, comunicação, vínculo sessão/trabalho e certificados.
6. Asaas sandbox, NFS-e e hardware com provas próprias; CI/automação não equivalem a aceite humano.

Há 74 PRs abertos no snapshot: lista exata em GATES_STATUS.json. PR aberto não é entrega. Fonte integrada e publicada: 38bfc29e4576ca182f84285ba21b2b91dd6758fc; run #1502 publicou com readiness, mantendo falhas públicas conhecidas de Nginx/alias. As filas e percentuais abaixo são históricos.

## Snapshot histórico — prioridade de 07/10/2026 UTC

Implementação **76,5%**; conclusão comprovada **57,7%**; **71/93** unidades integradas; **0/11 Gates encerrados**. Denominador e pesos da baseline v1 preservados.

1. Corrigir Nginx/TLS no host e registrar WCAG humana; não enfraquecer checks.
2. Ensaiar jornadas autenticadas, negativo cross-org/evento, gratuito/comprovante/Asaas sandbox e dispositivos reais no SHA implantado.
3. Corrigir identidade do expositor (#408) e reconciliar ACL granular do operador (#368).
4. Completar rascunho/upload inicial PDF, blocos e janelas por modalidade, reabertura/rubrica e operações em lote.
5. Provar comunicação entregue, refund/categoria/fila/compra múltipla e NFS-e com homologação própria.
6. Completar vínculo sessão/trabalho, certificados por atividade/trabalho/papel, PDF/segunda via/lotes/verso, visitas/BI e clone seguro.
7. Reconciliar 65 PRs históricos com código vivo antes de integrar; dois têm destino main, três outras branches.

Integrados: coautores, avaliador/parecer, decisão com quórum da versão atual, ePoster, correção, agenda/vagas, presença diária/estorno, avaliação/CSV, EVA contextual, comissão e logo do totem. Não recriar esses módulos. Certificado de participação é parcial diante da engine completa.

## Snapshot histórico — backlog de 04/10/2026



Baseline v1: conclusão comprovada 39,0%, implementação 51,6%; [matriz dos 93 critérios](GATES_STATUS.md). Ordem operacional atual:

1. Resolver Nginx/TLS pelo acesso administrativo e concluir evidência humana WCAG.
2. Ensaiar Gate1/2/3/10 no SHA implantado: contas distintas, gratuito/comprovante/Asaas sandbox, QR, OPERATOR, totem e impressão física.
3. Resolver posse de identidade do #408 antes de integrar; #409 continua draft e não pontuado.
4. Concluir G5 coautoria/PDF, G6 área do avaliador/parecer, G7 decisão/comunicação e G8 arquivo final, reutilizando contratos existentes.
5. Completar UI de reagendamento, programação pública e agenda pessoal (G9).
6. Presença diária/estorno, vagas em atividades, relatórios finais e certificados por presença/papel.

As filas históricas abaixo não autorizam recriar funcionalidades já integradas. #368 refere-se à ACL granular restante; posto/totem/impressão básica estão no #395/#407. O percentual da issue #114 agora possui denominador documentado; a issue permanece aberta pelo restante de seu aceite (PRs antigos, evidência humana e Go).

## Snapshot anterior da consolidação em 04/10/2026

Leva #392/#395–#404 integrada: 11/11; este é um recorte de integração. CI e
homologação são critérios distintos. #406 e #407 estão integrados após CI completo (1202 e 1198). #408 aguarda prova de posse do e-mail na autenticação da
empresa, sem senha compartilhada. O estado e as evidências estão em
[PROJECT_STATE.md](PROJECT_STATE.md). O contrato de operação é direção futura,
não prova de entrega de todas as fatias.

## Direção do Product Owner em 04/10/2026

O Product Owner mandou incorporar no Evolvia a operação observada na Even3.
Isso ainda não está implementado. O contrato está em
[operacao-do-evento.md](../operacao-do-evento.md). Decisões EVO-016 e EVO-017.

O Orquestrador incorpora uma fatia por vez, nesta ordem:

1. Histórico do inscrito por CPF ou passaporte, com login por e-mail.
2. Pessoas do evento e exportação da ficha, uma coluna por campo.
3. Relatórios do próprio evento: visitas, inscritos, submissões, vendas e valor recebido.
4. Presença por dia e por atividade, junto da presença geral e da entrega de material.
5. Inscrição na atividade, separada da inscrição no evento.
6. Avaliação do evento, com exportação.
7. Clonar evento, sem pessoas e sem dinheiro.
8. Link oculto e troca de categoria.
9. Avisos por e-mail, sem WhatsApp.
10. Prazo com hora, lote visível e fila de espera.
11. Científico operacional sobre o que já existe, com PDF passivo.
12. Programação na página pública e agenda da pessoa.
13. Certificado sem cobrança de download, só com presença ou papel confirmado.
14. Reembolso visível antes de pagar e cupom em quantidade.
15. Transmissão: um link https do evento para inscrição confirmada. Se o campo já existir, não criar outro modelo; o que falta é o link da atividade.
16. Credenciamento: posto, celular, leitor, etiquetas, relatório, impressão, sorteio, totem e o link com validade já estão no rascunho #407. Não recriar. Presença por dia continua na fatia 4.
17. Área do expositor: o menu Expositor e serviços, os formulários que a empresa e o prestador veem, cotas, credenciais e pedidos já estão no rascunho #408. Acesso por e-mail e documento da empresa. Não recriar e não acrescentar senha, boleto nem upload.

Doação, assento, anais, DOI, WhatsApp, aplicativo nativo, upload de vídeo,
comentário na transmissão, senha compartilhada do evento, senha de expositor, inscrição em grupo
como módulo, permissão menu a menu e captcha não entram por esta direção.

| Prioridade | Frente | Estado e próxima ação |
| --- | --- | --- |
| P0 | Gate público da homologação | CI #977: deploy e readiness concluídos, Gate vermelho pela versão do Nginx exposta e pelo TLS/redirecionamento do alias `dev`. Corrigir no host e repetir a prova sem enfraquecer checks. |
| P1 | WCAG humana | Registrar teclado/foco e NVDA ou VoiceOver no fluxo real, incluindo painel e inscrição. |
| P1 | Painel do evento | PR #370 integrado em `develop@1b3151c`: credenciamento e hierarquia dos acessos atualizados; verificar publicação em homologação. |
| P1 | Credenciamento e check-in | PR #368 draft: revisar, integrar e ensaiar câmera/leitor e fallback antes de afirmar que a operação de entrada está concluída. |
| P1 | Gates 1–11 | Issue #114: estabelecer mapa, critérios e evidência de cada Gate. Não divulgar um percentual global sem denominador. |
| P1 | Jornada de inscrição | Cinco fatias integradas: #323/#325, #327, #329, #331, #335. Exercitar checkout e área do participante em homologação; cobrança real permanece desabilitada por padrão. |
| P1 | Integrações | Catálogo #149 integrado. Planejar adaptadores reais por plataforma, inclusive NFS-e de qualquer município/UF, com autenticação, idempotência, LGPD e homologação fiscal por provedor. O catálogo ainda não conecta nem emite. |
| P2 | Recuperação/confirmação de conta | Issues #40 e #42, transversais à jornada. |
| P2 | Contrato dos planejadores | PR #284: preservar exigências da revisão e revalidar antes de integrar. |
| P3 | Científico funcional, gamificação e demais jornadas | Desdobrar em fatias verticais aprovadas, sem atribuir progresso por código isolado. |

## Sequência operacional

1. Verificar publicação de `develop@1b3151c` em homologação e ensaiar o novo painel.
2. Corrigir versão do Nginx, certificado e redirecionamento do alias `dev` no host
   autorizado; repetir o Gate externo sem dispensar HTTPS ou cabeçalhos.
3. Executar validação humana de acessibilidade e registrar evidência.
4. Revisar PR #368 e testar credenciamento com dispositivos reais.
5. Reconciliar #114 para que os 11 Gates tenham critérios e percentuais
   reproduzíveis; manter o estado de cada corte sincronizado no projeto.
6. Exigir Go/No-Go explícito antes de promover `main` ou produção.

Regras transversais: isolamento `organizationId + eventId`, deny-by-default,
minimização de dados pessoais, auditoria, idempotência, migrations aditivas,
rollback, Node 22/ARM64, PostgreSQL, Redis, WCAG 2.2 AA e PT-BR.


## Entrega verificada em 09/10/2026 — catálogo #541

- PR [#541](https://github.com/evolvia-tecnologia/evolvia-platform/pull/541) integrado em `develop@7a8d4d39657e12b7624ab6e62b5221e49e20b1be`, após reconciliação com `develop@1496df7936eed9b261ce5ac508edc5d9af97a880`. HEAD validado `da609eb1316127b0f78d4802f0e9042698d83249`.
- [CI 1518](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37966032162) verde: Node22, integração/PostgreSQL, migration idempotente, hidratação isolada do catálogo, acessibilidade runtime, espaçamento de texto, árvore acessível e ARM64 Web. API ARM64 foi ignorada por não haver mudança de imagem API. Job de integração `113941575567`. Prova local complementar: 29/29 testes Node24, harness de hooks e diagnóstico; não equivale a React DOM ou prova humana.
- Código preserva imagem no SSR, separa ciclo de montagem da verificação de mídia e descarta erro tardio do elemento substituído. Diagnóstico preserva código React e somente os enums text/HTML, sem argumentos/URLs privados e sem suprimir erros.
- Publicação comprovada do merge `7a8d4d39657e12b7624ab6e62b5221e49e20b1be`: [run 37967190612](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37967190612), job `113947839793`, passo de deploy com rollback aprovado e log Commit em 09/10/2026 às 17:45:06 UTC; readiness público API/PostgreSQL aprovado às 17:45:08 UTC. O job falhou depois pela versão `nginx/1.24.0` exposta; log do alias dev ainda registra hostname mismatch, apesar do passo terminar verde. Nenhum novo aceite funcional/humano.
- #542 foi incluído na lista de PRs reconciliados por consolidar a evidência de G11.6: merge `1496df7936eed9b261ce5ac508edc5d9af97a880`, publicação no run `37937702677` / job `113847881323`. Essa inclusão é documental, sem novo crédito por critério.
- Ensaio público nesta execução: home → catálogo com dois fixtures QA, viewport desktop 1363×936 sem overflow. Busca científica retornou 502 Bad Gateway / Connection refused antes e após uma única recarga com readiness já confirmado. Jornada filtrada não homologada; causa não atribuída ao código/infra. Sem carga, PII ou operação financeira.
- Matriz permanece 78,7% implementação / 59,3% conclusão, 73/93 e 0/11; delta 0,0/0,0 pp. Correção dentro de escopo já integrado não cria critério novo. A fonte da medição por critério continua `38bfc29e`; esta seção registra evidência posterior separadamente.
- #525 HEAD `24ddb396cc4c10b15cb9beb9d191a33769bbe96f`: CI verde e conciliação de vendas comprovada por fixtures, mas sem merge/deploy. Contrato #532 ainda exige limite de escrita pública: rota anônima executa incremento a cada pedido sem controle demonstrado na aplicação/configuração versionada. Handoff de correção no mesmo PR: `EVOLVIA_HANDOFF:525:24ddb396cc4c10b15cb9beb9d191a33769bbe96f`. Paths permanecem Cursor, sem lançamento automático de Composer. Não fazer carga no ambiente real.
- #536 integrado em `develop@5cd9392abfd88af84e0dcb57ea7661e678b4716a`, HEAD `68b2b8dd0d3f2f3840c4b5467e274df2c462462b`, base `7a8d4d39`, após [CI1522](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37967721576) verde e três threads resolvidas. Recuperação GET após gravação confirmada não repete POST; lista desatualizada bloqueia novas ações. Testes locais existentes helper/navegação: 19/19 Node24. Publicação do merge comprovada no [run 37969826699](https://github.com/evolvia-tecnologia/evolvia-platform/actions/runs/37969826699), job `113957185095`: Commit `5cd9392a` às 18:08:36 UTC e readiness público API/PostgreSQL às 18:08:38 UTC. O job falhou depois pela versão `nginx/1.24.0` exposta; alias dev manteve hostname mismatch. Ensaio autenticado e resultado POST ambíguo permanecem pendentes; sem novo crédito G10.13.
- #497 continua reservado e serializado com #515/#516. Sem alterações em main, produção, infra ou secrets. Rollback de #541/#536: reversão da aplicação, sem migration/destruição de dados. Revisão do diff não é auditoria total.
