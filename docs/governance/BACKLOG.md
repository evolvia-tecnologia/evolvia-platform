# Backlog e ordem de execução — Modo Lançamento

GitHub Issues contém as unidades de trabalho. O estado e os percentuais
auditáveis estão em [PROJECT_STATE.md](PROJECT_STATE.md). Este quadro prioriza
o `develop` vivo; `main` e produção aguardam Go/No-Go próprio.

| Prioridade | Frente | Estado e próxima ação |
| --- | --- | --- |
| P0 | Gate público da homologação | CI #977: deploy e readiness concluídos, Gate vermelho pela versão do Nginx exposta e pelo TLS/redirecionamento do alias `dev`. Corrigir no host e repetir a prova sem enfraquecer checks. |
| P1 | WCAG humana | Registrar teclado/foco e NVDA ou VoiceOver no fluxo real, incluindo painel e inscrição. |
| P1 | Visão geral do evento | PR #370 em CI/revisão: atualizar credenciamento e hierarquia dos acessos; integrar HEAD verde e publicar em homologação. |
| P1 | Credenciamento operacional | PR #368 draft: revisar, integrar e ensaiar câmera/leitor e fallback antes de afirmar que a operação de entrada está concluída. |
| P1 | Gates 1–11 | Issue #114: estabelecer mapa, critérios e evidência de cada Gate. Não divulgar um percentual global sem denominador. |
| P1 | Jornada de inscrição | Cinco fatias integradas: #323/#325, #327, #329, #331, #335. Exercitar checkout e área do participante em homologação; cobrança real permanece desabilitada por padrão. |
| P1 | Integrações | Catálogo #149 integrado. Planejar adaptadores reais por plataforma, inclusive NFS-e de qualquer município/UF, com autenticação, idempotência, LGPD e homologação fiscal por provedor. O catálogo ainda não conecta nem emite. |
| P2 | Recuperação/confirmação de conta | Issues #40 e #42, transversais à jornada. |
| P2 | Contrato dos planejadores | PR #284: preservar exigências da revisão e revalidar antes de integrar. |
| P3 | Científico funcional, gamificação e demais jornadas | Desdobrar em fatias verticais aprovadas, sem atribuir progresso por código isolado. |

## Sequência operacional

1. Concluir CI e revisão do PR #370; integrar o HEAD exato verde em `develop`.
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
