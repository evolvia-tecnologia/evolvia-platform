---
snapshot_at_utc: 2026-09-16T17:50:00Z
repository: evolvia-tecnologia/evolvia-platform
stable_branch: main
integration_branch: develop
integration_sha: 314dace405060ef2dd628b82ed0f9f2b930f7864
active_phase: "Fase 1 — Divulgação do Evento"
active_work: "Gate 1 em No-Go residual: versão do Nginx e evidência humana"
next_gate: "Ocultar versão do proxy e registrar NVDA/VoiceOver"
next_phase: "Fase 2 — Inscrição, bloqueada pela EVO-006"
---

# Estado oficial do projeto

## Resumo executivo

- `develop@314dace405060ef2dd628b82ed0f9f2b930f7864` é a integração viva.
- PRs #295, #296, #297 e #312 foram integrados, removendo o estado Draft descrito
  no snapshot anterior.
- PR #315 integrou cabeçalhos defensivos na Web e configuração Nginx versionada.
- PRs #316 e #317 adicionaram promoção transacional/rollback e adaptaram o fluxo
  à chave SSH restrita, sem alterar secrets ou ampliar privilégios.
- CI #742 implantou os containers do SHA exato em homologação. Qualidade,
  integração, smoke, migrations, evidência visual, acessibilidade automatizada e
  builds API/Web ARM64 ficaram verdes.
- A prova pública confirmou API e PostgreSQL prontos, HTTPS 200, HTTP 308, HSTS,
  X-Content-Type-Options, Referrer-Policy e X-Frame-Options conformes, além da
  ausência de X-Powered-By.
- O cabeçalho `Server: nginx/1.24.0 (Ubuntu)` continua exposto. O comando SSH
  permitido executa um wrapper administrativo do host que não aplica o
  `deploy.sh`/Nginx versionado do repositório.
- Gate 1 permanece aberto. Também falta validação humana com NVDA/VoiceOver.
- Gate 2 permanece bloqueado por EVO-006; `main` e produção não foram alterados.
- Versões permanecem `0.2.0-alpha.3` em desenvolvimento/homologação e `0.1.1`
  em produção. Nenhuma release foi criada.
- Gemini Developer permanece pausado e não foi acionado.

## Entregas comprovadas nesta janela

| Entrega | Estado | Evidência |
| --- | --- | --- |
| Governança reconciliada | integrada | PR #312, `develop@5ca73ee8` |
| Planejadores locais #295–#297 | integrados em ordem segura | CIs #722 e #728; `develop@76871738` |
| Cabeçalhos Web/Nginx | integrados | PR #315, CI #732, `develop@855c52ba` |
| Promoção transacional do Nginx | integrada | PR #316, CI #736, `develop@315c89f6` |
| Deploy pela rota SSH autorizada | integrado | PR #317, CI #741, `develop@314dace4` |
| Homologação pública | parcial / No-Go | CI #742: todos os contratos, exceto versão do Nginx |

## Gate atual

Critérios atendidos automaticamente:

1. HEAD integrado com qualidade, segurança, integração e ARM64 verdes;
2. migrations aditivas/idempotentes e smoke funcional;
3. evidências visuais, responsivas, teclado e acessibilidade automatizada;
4. HTTPS, redirecionamento, readiness e quatro cabeçalhos defensivos públicos.

Critérios ainda ausentes:

1. remover a versão do Nginx no proxy efetivamente ativo por ação administrativa
   auditável e repetir o CI no mesmo SHA;
2. registrar validação humana de teclado/foco e NVDA ou VoiceOver;
3. emitir Go/No-Go formal da Fase 1.

## Segurança e compatibilidade preservadas

- autorização backend `deny-by-default`;
- isolamento por `organizationId + eventId` e DTO mínimo;
- migrations aditivas, idempotência, auditoria e rollback;
- Node 22 e Ubuntu/ARM64;
- WCAG 2.2 AA, reflow a 320 px e PT-BR;
- nenhum secret ou PII em evidência;
- nenhuma alteração de `main` ou produção.

## Próximos passos elegíveis

1. administrador do host deve fazer o wrapper `deploy $SHA` promover a
   configuração Nginx versionada ou aplicar o script auditável já integrado;
2. repetir CI/smoke público e comprovar `Server` sem versão;
3. executar e registrar NVDA/VoiceOver;
4. emitir Go/No-Go do Gate 1;
5. somente após Go, abrir a primeira fatia vertical do Gate 2 — Inscrição.

## Como atualizar este arquivo

Atualizar após merge, mudança de Gate, decisão do Product Owner ou bloqueio
relevante. Não converter intenção, CI de outro HEAD ou automação em evidência
humana ou homologação concluída.
