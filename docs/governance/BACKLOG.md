# Backlog e ordem de execução — Modo Lançamento

GitHub Issues contém as unidades de trabalho. O estado e os percentuais
auditáveis estão em [PROJECT_STATE.md](PROJECT_STATE.md). Este quadro prioriza
o `develop` vivo; `main` e produção aguardam Go/No-Go próprio.

## Prioridade vigente — 07/10/2026 UTC

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
